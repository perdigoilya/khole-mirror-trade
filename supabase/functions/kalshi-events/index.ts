import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[PUBLIC] Fetching Kalshi events from public API');

    const limit = 200;
    const path = `/trade-api/v2/events?status=open&limit=${limit}&with_nested_markets=true`;
    
    const baseUrls = [
      'https://api.elections.kalshi.com',
      'https://api.kalshi.com'
    ];

    let eventData = null;
    let lastError = '';

    for (const base of baseUrls) {
      const url = `${base}${path}`;
      console.log('[PUBLIC] Trying public endpoint:', url);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        eventData = await response.json();
        console.log(`[PUBLIC] Successfully fetched ${eventData.events?.length || 0} events from ${base}`);
        break;
      } else {
        lastError = await response.text();
        console.log(`[PUBLIC] Failed ${base}:`, response.status, lastError);
      }
    }

    if (!eventData) {
      console.error('[PUBLIC] All Kalshi public API attempts failed:', lastError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch events from Kalshi public API.', details: lastError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Defer fetching event metadata images until after sorting to avoid heavy parallel requests
    // We'll enrich only the top N events to reduce rate limits.

    // Normalize events
    const normalizedEvents = (eventData.events || []).map((event: any) => {
      // Find the most liquid/popular market in this event as the "headline"
      const markets = event.markets || [];
      const headlineMarket = markets.length > 0 
        ? markets.reduce((best: any, current: any) => {
            const bestVol = (typeof best.volume_24h_dollars === 'string' ? parseFloat(best.volume_24h_dollars) : 0) || best.volume_24h || best.volume || 0;
            const currVol = (typeof current.volume_24h_dollars === 'string' ? parseFloat(current.volume_24h_dollars) : 0) || current.volume_24h || current.volume || 0;
            return currVol > bestVol ? current : best;
          }, markets[0])
        : null;

      // Calculate price from headline market
      let yesPrice = 50;
      let noPrice = 50;
      if (headlineMarket) {
        const lastPrice = headlineMarket.last_price;
        if (typeof lastPrice === 'number') {
          yesPrice = Math.round(lastPrice);
          noPrice = 100 - yesPrice;
        }
      }

      // Aggregate 24h dollar volume and liquidity across all markets in event
      const totalDollarVolume24h = markets.reduce((sum: number, m: any) => {
        const v = typeof m.volume_24h_dollars === 'string' ? parseFloat(m.volume_24h_dollars) : 0;
        return sum + (isNaN(v) ? 0 : v);
      }, 0);
      
      // Use lifetime volume as fallback for events with low daily activity
      let totalVolume = totalDollarVolume24h;
      if (totalVolume === 0) {
        const totalDollarVolume = markets.reduce((sum: number, m: any) => {
          const v = typeof m.volume_dollars === 'string' ? parseFloat(m.volume_dollars) : 0;
          return sum + (isNaN(v) ? 0 : v);
        }, 0);
        totalVolume = totalDollarVolume;
      }
      
      const totalLiquidity = markets.reduce((sum: number, m: any) => {
        const liq = m.liquidity_dollars ? parseFloat(m.liquidity_dollars) : 0;
        return sum + liq;
      }, 0);

      const volumeLabel = totalVolume > 0 
        ? `$${Math.round(totalVolume).toLocaleString('en-US')}` 
        : '$0';
      
      return {
        id: event.event_ticker,
        eventTicker: event.event_ticker,
        title: event.title || event.sub_title || event.event_ticker,
        subtitle: event.sub_title,
        description: event.title || event.sub_title,
        image: null,
        yesPrice,
        noPrice,
        volume: volumeLabel,
        liquidity: totalLiquidity > 0 ? `$${totalLiquidity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
        volumeRaw: totalVolume,
        volume24hRaw: totalDollarVolume24h,  // Track both for sorting
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
          volume: (typeof m.volume_24h_dollars === 'string' ? parseFloat(m.volume_24h_dollars) : 0) || m.volume_24h || m.volume || 0,
        })),
      };
    });

    // Smart sorting: Prioritize events with recent activity, but don't exclude long-term ones
    const now = new Date();
    const sortedEvents = normalizedEvents.sort((a: any, b: any) => {
      const aEnd = new Date(a.endDate).getTime();
      const bEnd = new Date(b.endDate).getTime();
      const nowTime = now.getTime();
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      
      // Calculate "recency bonus" - events within 1 year get a boost
      const aRecencyBonus = aEnd < nowTime + oneYear ? 1.5 : 1.0;
      const bRecencyBonus = bEnd < nowTime + oneYear ? 1.5 : 1.0;
      
      // Prioritize 24h volume, but use lifetime volume as tiebreaker
      const aVol = (a.volume24hRaw || 0) * aRecencyBonus + (a.volumeRaw || 0) * 0.1;
      const bVol = (b.volume24hRaw || 0) * bRecencyBonus + (b.volumeRaw || 0) * 0.1;
      
      return bVol - aVol;
    });
    
    console.log(`[PUBLIC] Sorted ${sortedEvents.length} events by volume+recency`);

    // Enrich top N events with metadata images (sequential to avoid rate limits)
    const fetchEventImage = async (ticker: string): Promise<string | null> => {
      for (const base of baseUrls) {
        const metaUrl = `${base}/trade-api/v2/events/${ticker}/metadata`;
        try {
          const resp = await fetch(metaUrl, { headers: { 'Accept': 'application/json' } });
          if (resp.ok) {
            const md = await resp.json();
            return md?.image_url || null;
          }
        } catch (e) {
          console.log('[PUBLIC] metadata error', ticker, e);
        }
      }
      return null;
    };

    const TOP_N = Math.min(40, sortedEvents.length);
    for (let i = 0; i < TOP_N; i++) {
      const ticker = sortedEvents[i].eventTicker;
      const img = await fetchEventImage(ticker);
      if (img) sortedEvents[i].image = img;
    }

    console.log(`[PUBLIC] Returning ${sortedEvents.length} events`);
    return new Response(
      JSON.stringify({ 
        events: sortedEvents,
        cursor: eventData.cursor 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[PUBLIC] Events fetch error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
