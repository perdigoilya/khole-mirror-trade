import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HIGH_VOLUME_SERIES = [
  // Politics
  'PRESIDENT', 'CONGRESS', 'SENATE', 'HOUSE', 'ELECTION',
  // Sports
  'NFL', 'NBA', 'MLB', 'WORLDCUP', 'SUPERBOWL',
  // Finance
  'FED', 'FOMC', 'CPI', 'GDP', 'STOCKS', 'SPX',
  // Crypto
  'BTC', 'ETH', 'CRYPTO',
  // Other
  'WEATHER', 'OSCAR', 'EMMYS'
];

const BASE_URLS = [
  'https://api.elections.kalshi.com',
  'https://api.kalshi.com'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[AGGREGATE] Starting multi-source Kalshi event aggregation');

    // Source 1: Deep pagination (30 pages)
    const fetchDeepPagination = async (): Promise<any[]> => {
      console.log('[AGGREGATE] Source 1: Deep pagination (30 pages)');
      const limit = 200;
      const maxPages = 30;
      let allEvents: any[] = [];
      let cursor: string | undefined = undefined;

      for (let page = 0; page < maxPages; page++) {
        const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
        const path = `/trade-api/v2/events?status=open&limit=${limit}&with_nested_markets=true${cursorParam}`;
        
        let eventData = null;
        for (const base of BASE_URLS) {
          const url = `${base}${path}`;
          try {
            const response = await fetch(url, {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(15000),
            });

            if (response.ok) {
              eventData = await response.json();
              break;
            }
          } catch (e) {
            console.error(`[AGGREGATE] Deep pagination error:`, e);
          }
        }

        if (!eventData || !eventData.events) break;
        
        allEvents = allEvents.concat(eventData.events);
        cursor = eventData.cursor;
        
        if (!cursor) break;
      }

      console.log(`[AGGREGATE] Deep pagination fetched ${allEvents.length} events`);
      return allEvents;
    };

    // Source 2: Series-targeted fetching
    const fetchSeriesTargeted = async (): Promise<any[]> => {
      console.log('[AGGREGATE] Source 2: Series-targeted fetching');
      const allEvents: any[] = [];
      
      for (const series of HIGH_VOLUME_SERIES) {
        const path = `/trade-api/v2/events?status=open&limit=200&with_nested_markets=true&series_ticker=${series}`;
        
        for (const base of BASE_URLS) {
          const url = `${base}${path}`;
          try {
            const response = await fetch(url, {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(10000),
            });

            if (response.ok) {
              const data = await response.json();
              if (data.events) {
                allEvents.push(...data.events);
                console.log(`[AGGREGATE] Series ${series}: ${data.events.length} events`);
              }
              break;
            }
          } catch (e) {
            console.error(`[AGGREGATE] Series ${series} error:`, e);
          }
        }
      }

      console.log(`[AGGREGATE] Series-targeted fetched ${allEvents.length} events`);
      return allEvents;
    };

    // Source 3: Markets grouping
    const fetchAndGroupMarkets = async (): Promise<any[]> => {
      console.log('[AGGREGATE] Source 3: Markets grouping');
      const path = `/trade-api/v2/markets?status=open&limit=1000`;
      
      for (const base of BASE_URLS) {
        const url = `${base}${path}`;
        try {
          const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.markets) {
              // Group markets by event_ticker
              const eventMap = new Map<string, any>();
              
              for (const market of data.markets) {
                const eventTicker = market.event_ticker;
                if (!eventMap.has(eventTicker)) {
                  eventMap.set(eventTicker, {
                    event_ticker: eventTicker,
                    title: market.title?.split(',')[0] || eventTicker,
                    category: market.category || 'General',
                    markets: [],
                  });
                }
                
                eventMap.get(eventTicker).markets.push(market);
              }
              
              const groupedEvents = Array.from(eventMap.values());
              console.log(`[AGGREGATE] Markets grouping created ${groupedEvents.length} events`);
              return groupedEvents;
            }
          }
        } catch (e) {
          console.error(`[AGGREGATE] Markets grouping error:`, e);
        }
      }

      return [];
    };

    // Fetch all sources in parallel
    const [deepEvents, seriesEvents, marketsGrouped] = await Promise.all([
      fetchDeepPagination(),
      fetchSeriesTargeted(),
      fetchAndGroupMarkets(),
    ]);

    // Merge and deduplicate
    console.log('[AGGREGATE] Merging and deduplicating events');
    const eventMap = new Map<string, any>();

    const addEvents = (events: any[], source: string) => {
      for (const event of events) {
        const ticker = event.event_ticker;
        if (!ticker) continue;

        if (!eventMap.has(ticker)) {
          eventMap.set(ticker, { ...event, _source: source });
        } else {
          // Merge: keep highest volume data
          const existing = eventMap.get(ticker);
          const existingVol = existing.markets?.reduce((sum: number, m: any) => {
            return sum + (parseFloat(m.volume_24h_dollars) || 0);
          }, 0) || 0;
          
          const newVol = event.markets?.reduce((sum: number, m: any) => {
            return sum + (parseFloat(m.volume_24h_dollars) || 0);
          }, 0) || 0;
          
          if (newVol > existingVol) {
            eventMap.set(ticker, { ...event, _source: `${existing._source}+${source}` });
          }
        }
      }
    };

    addEvents(deepEvents, 'deep');
    addEvents(seriesEvents, 'series');
    addEvents(marketsGrouped, 'markets');

    console.log(`[AGGREGATE] Merged ${deepEvents.length + seriesEvents.length + marketsGrouped.length} total → ${eventMap.size} unique events`);

    // Normalize events
    const normalizedEvents = Array.from(eventMap.values()).map((event: any) => {
      const markets = event.markets || [];
      const headlineMarket = markets.length > 0 
        ? markets.reduce((best: any, current: any) => {
            const bestVol = parseFloat(best.volume_24h_dollars) || 0;
            const currVol = parseFloat(current.volume_24h_dollars) || 0;
            return currVol > bestVol ? current : best;
          }, markets[0])
        : null;

      let yesPrice = 50;
      let noPrice = 50;
      if (headlineMarket?.last_price) {
        yesPrice = Math.round(headlineMarket.last_price);
        noPrice = 100 - yesPrice;
      }

      const totalDollarVolume24h = markets.reduce((sum: number, m: any) => {
        return sum + (parseFloat(m.volume_24h_dollars) || 0);
      }, 0);
      
      const totalDollarVolume = markets.reduce((sum: number, m: any) => {
        return sum + (parseFloat(m.volume_dollars) || 0);
      }, 0);
      
      const totalVolume = totalDollarVolume24h || totalDollarVolume;
      
      const totalLiquidity = markets.reduce((sum: number, m: any) => {
        return sum + (parseFloat(m.liquidity_dollars) || 0);
      }, 0);

      return {
        id: event.event_ticker,
        eventTicker: event.event_ticker,
        title: event.title || event.sub_title || event.event_ticker,
        subtitle: event.sub_title,
        description: event.title || event.sub_title,
        image: null as string | null,
        yesPrice,
        noPrice,
        volume: totalVolume > 0 ? `$${Math.round(totalVolume).toLocaleString('en-US')}` : '$0',
        liquidity: totalLiquidity > 0 ? `$${totalLiquidity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
        volumeRaw: totalVolume,
        volume24hRaw: totalDollarVolume24h,
        liquidityRaw: totalLiquidity,
        endDate: headlineMarket?.close_time || headlineMarket?.expiration_time || new Date().toISOString(),
        status: 'Active',
        category: event.category || 'General',
        provider: 'kalshi' as const,
        marketCount: markets.length,
        markets: markets.map((m: any) => ({
          ticker: m.ticker,
          title: m.title,
          yesPrice: m.last_price || 50,
          volume: parseFloat(m.volume_24h_dollars) || m.volume_24h || m.volume || 0,
        })),
        _source: event._source,
      };
    });

    // Smart sorting with weighted formula
    const now = new Date();
    const sortedEvents = normalizedEvents.sort((a: any, b: any) => {
      const aEnd = new Date(a.endDate).getTime();
      const bEnd = new Date(b.endDate).getTime();
      const nowTime = now.getTime();
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      
      const aRecencyBonus = aEnd < nowTime + oneYear ? 1.5 : 1.0;
      const bRecencyBonus = bEnd < nowTime + oneYear ? 1.5 : 1.0;
      
      // Weighted: (24h_volume × 2) + (total_volume × 0.1) + recency
      const aScore = ((a.volume24hRaw || 0) * 2 + (a.volumeRaw || 0) * 0.1) * aRecencyBonus;
      const bScore = ((b.volume24hRaw || 0) * 2 + (b.volumeRaw || 0) * 0.1) * bRecencyBonus;
      
      return bScore - aScore;
    });

    console.log(`[AGGREGATE] Sorted ${sortedEvents.length} events by weighted volume+recency`);
    console.log(`[AGGREGATE] Top 5 events:`, sortedEvents.slice(0, 5).map(e => ({
      ticker: e.eventTicker,
      title: e.title.substring(0, 50),
      vol24h: e.volume24hRaw,
      volTotal: e.volumeRaw,
      source: e._source,
    })));

    // Enrich top 50 events with images
    const fetchEventImage = async (ticker: string): Promise<string | null> => {
      for (const base of BASE_URLS) {
        const metaUrl = `${base}/trade-api/v2/events/${ticker}/metadata`;
        try {
          const resp = await fetch(metaUrl, { headers: { 'Accept': 'application/json' } });
          if (resp.ok) {
            const md = await resp.json();
            return md?.image_url || null;
          }
        } catch (e) {
          // Silent fail
        }
      }
      return null;
    };

    const TOP_N = Math.min(50, sortedEvents.length);
    for (let i = 0; i < TOP_N; i++) {
      const ticker = sortedEvents[i].eventTicker;
      const img = await fetchEventImage(ticker);
      if (img) sortedEvents[i].image = img;
    }

    console.log(`[AGGREGATE] Returning ${sortedEvents.length} events`);
    return new Response(
      JSON.stringify({ events: sortedEvents }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[AGGREGATE] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
