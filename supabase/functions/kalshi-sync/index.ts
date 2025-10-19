import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[SYNC] Starting Kalshi market sync job');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all markets from Kalshi with pagination
    const limit = 1000;
    const maxPages = 15; // Aim for 15k markets
    let allMarkets: any[] = [];
    let cursor: string | undefined = undefined;
    
    const baseUrls = [
      'https://api.elections.kalshi.com',
      'https://api.kalshi.com'
    ];

    for (let page = 0; page < maxPages; page++) {
      const cursorParam: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const path: string = `/trade-api/v2/markets?status=open&limit=${limit}${cursorParam}`;
      
      let marketData = null;

      for (const base of baseUrls) {
        const url: string = `${base}${path}`;
        console.log(`[SYNC] Page ${page + 1}/${maxPages} - Fetching: ${url}`);
        
        try {
          const response: Response = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(15000),
          });

          if (response.ok) {
            marketData = await response.json();
            console.log(`[SYNC] Page ${page + 1}: Fetched ${marketData.markets?.length || 0} markets`);
            break;
          }
        } catch (e) {
          console.error(`[SYNC] Error fetching from ${base}:`, e);
        }
      }

      if (!marketData || !marketData.markets) {
        console.log(`[SYNC] No more markets on page ${page + 1}`);
        break;
      }

      allMarkets = allMarkets.concat(marketData.markets);
      
      if (marketData.cursor) {
        cursor = marketData.cursor;
        console.log(`[SYNC] Total so far: ${allMarkets.length} markets`);
      } else {
        console.log(`[SYNC] Pagination complete. Total: ${allMarkets.length} markets`);
        break;
      }
    }

    if (allMarkets.length === 0) {
      throw new Error('No markets fetched from Kalshi');
    }

    // Filter out parlays, single-game combos, and multi-condition markets
    const isParlay = (m: any): boolean => {
      const ticker = m.ticker || '';
      const eventTicker = m.event_ticker || '';
      const title = (m.title || '').toString();
      
      // Determine series from ticker prefix (before -S)
      const series = (eventTicker || ticker).split('-')[0] || '';
      
      // Exclude Kalshi Single Game and explicit parlay/bundle series
      if (/SINGLEGAME/i.test(series)) return true;
      if (/MULTIGAME|PARLAY|BUNDLE|EXTENDED/i.test(series)) return true;
      if (/MULTIGAME|PARLAY|BUNDLE|EXTENDED/i.test(ticker) || /MULTIGAME|PARLAY|BUNDLE|EXTENDED/i.test(eventTicker)) return true;
      
      // Explicit multi-condition pattern using yes/no prefixes
      // e.g., "yes A,yes B" or "yes A,no B"
      if (/\b(yes|no)\s+[^,]+,\s*(yes|no)\s+/i.test(title)) return true;
      
      // Multiple player props pattern: "Name: 100+, Other: 50+"
      const colonCount = (title.match(/:/g) || []).length;
      if (colonCount >= 2) return true;
      
      // Fallback comma-and pattern
      if (/,\s*(and|\&)\s*[A-Z]/.test(title)) return true;
      
      return false;
    };

    const singleLegMarkets = allMarkets.filter(m => !isParlay(m));
    console.log(`[SYNC] Filtered to ${singleLegMarkets.length} single-leg markets`);

    // Group markets by event_ticker
    const eventGroups = new Map<string, any[]>();
    for (const market of singleLegMarkets) {
      const eventTicker = market.event_ticker || market.ticker;
      if (!eventGroups.has(eventTicker)) {
        eventGroups.set(eventTicker, []);
      }
      eventGroups.get(eventTicker)!.push(market);
    }

    console.log(`[SYNC] Grouped into ${eventGroups.size} events`);

    // Helpers for pricing and titles
    const toCents = (num: unknown, dollars: unknown): number | null => {
      if (typeof num === 'number' && !isNaN(num)) return Math.round(num);
      if (typeof dollars === 'string') {
        const f = parseFloat(dollars);
        if (!isNaN(f)) return Math.round(f * 100);
      }
      if (typeof dollars === 'number' && !isNaN(dollars)) return Math.round((dollars as number) * 100);
      return null;
    };

    const calcYesPrice = (m: any): number | undefined => {
      const last = toCents(m.last_price, m.last_price_dollars);
      const yesAsk = toCents(m.yes_ask, m.yes_ask_dollars);
      const yesBid = toCents(m.yes_bid, m.yes_bid_dollars);
      if (last !== null) return last;
      if (yesAsk !== null && yesBid !== null) return Math.round((yesAsk + yesBid) / 2);
      if (yesAsk !== null) return yesAsk;
      if (yesBid !== null) return yesBid;
      return undefined;
    };

    const cleanTitle = (rawTitle: string | undefined, sub: string | undefined): string => {
      const t = (rawTitle || '').toString();
      if (sub && sub.trim().length > 0) return sub.trim();
      // Remove leading "yes " or "no "
      let s = t.replace(/^\s*(yes|no)\s+/i, '');
      // If comma-separated, take the first part
      if (s.includes(',')) s = s.split(',')[0];
      return s.trim() || t;
    };

    // Build event-level records
    const eventRecords = [] as any[];
    for (const [eventTicker, markets] of eventGroups) {
      // Find headline market (highest 24h vol, fallback lifetime)
      const headlineMarket = markets.reduce((best, curr) => {
        const bestVol = parseFloat(best.volume_24h_dollars || '0') || parseFloat(best.volume_dollars || '0') || 0;
        const currVol = parseFloat(curr.volume_24h_dollars || '0') || parseFloat(curr.volume_dollars || '0') || 0;
        return currVol > bestVol ? curr : best;
      }, markets[0]);

      // Aggregate volume and liquidity
      const totalVolume24h = markets.reduce((sum, m) => sum + (parseFloat(m.volume_24h_dollars || '0') || 0), 0);
      const totalVolume = markets.reduce((sum, m) => sum + (parseFloat(m.volume_dollars || '0') || 0), 0);
      const totalLiquidity = markets.reduce((sum, m) => sum + (parseFloat(m.liquidity_dollars || '0') || 0), 0);

      const volumeForSorting = totalVolume24h > 0 ? totalVolume24h : totalVolume;

      const seriesCode = (eventTicker || '').split('-')[0] || '';
      const imageUrl = seriesCode ? `https://kalshi-public-docs.s3.amazonaws.com/series-images-webp/${seriesCode}.webp` : null;

      const headlineYes = calcYesPrice(headlineMarket);

      eventRecords.push({
        id: eventTicker,
        event_ticker: eventTicker,
        title: cleanTitle(headlineMarket.title, headlineMarket.subtitle),
        subtitle: headlineMarket.subtitle || null,
        category: headlineMarket.category || 'General',
        total_volume: volumeForSorting,
        total_liquidity: totalLiquidity,
        market_count: markets.length,
        event_data: {
          image: imageUrl,
          headlineMarket: {
            ticker: headlineMarket.ticker,
            yesPrice: typeof headlineYes === 'number' ? headlineYes : undefined,
            endDate: headlineMarket.close_time || headlineMarket.expiration_time,
          },
          markets: markets.map(m => ({
            ticker: m.ticker,
            title: cleanTitle(m.title, m.subtitle),
            yesPrice: calcYesPrice(m),
            volume24h: parseFloat(m.volume_24h_dollars || '0') || 0,
          }))
        },
        last_updated: new Date().toISOString(),
      });
    }

    console.log(`[SYNC] Built ${eventRecords.length} event records`);

    // Clear old data and insert new data
    const { error: deleteError } = await supabase
      .from('kalshi_events')
      .delete()
      .neq('id', ''); // Delete all records

    if (deleteError) {
      console.error('[SYNC] Error clearing old events:', deleteError);
    }

    // Insert in batches of 500
    const batchSize = 500;
    for (let i = 0; i < eventRecords.length; i += batchSize) {
      const batch = eventRecords.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('kalshi_events')
        .insert(batch);

      if (insertError) {
        console.error(`[SYNC] Error inserting batch ${i / batchSize + 1}:`, insertError);
      } else {
        console.log(`[SYNC] Inserted batch ${i / batchSize + 1} (${batch.length} records)`);
      }
    }

    console.log(`[SYNC] Sync complete. Total events stored: ${eventRecords.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        eventsStored: eventRecords.length,
        marketsProcessed: allMarkets.length,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[SYNC] Sync job error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
