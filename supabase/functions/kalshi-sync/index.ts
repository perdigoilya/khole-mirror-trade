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

    // Filter out parlays
    const isParlay = (m: any): boolean => {
      const ticker = m.ticker || '';
      const eventTicker = m.event_ticker || '';
      const title = (m.title || '').toString();
      
      const multiFlag = /MULTIGAME|PARLAY|BUNDLE/i.test(ticker) || /MULTIGAME|PARLAY|BUNDLE/i.test(eventTicker);
      if (multiFlag) return true;
      
      const parlayPattern = /,\s*(and|&)\s*[A-Z]/;
      const multipleOutcomePattern = /,\s*[A-Z][^,]+,/;
      return parlayPattern.test(title) || multipleOutcomePattern.test(title);
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

    // Build event-level records
    const eventRecords = [];
    for (const [eventTicker, markets] of eventGroups) {
      // Find headline market (highest volume)
      const headlineMarket = markets.reduce((best, curr) => {
        const bestVol = parseFloat(best.volume_24h_dollars || '0') || parseFloat(best.volume_dollars || '0') || 0;
        const currVol = parseFloat(curr.volume_24h_dollars || '0') || parseFloat(curr.volume_dollars || '0') || 0;
        return currVol > bestVol ? curr : best;
      }, markets[0]);

      // Aggregate volume and liquidity
      const totalVolume24h = markets.reduce((sum, m) => {
        const vol = parseFloat(m.volume_24h_dollars || '0') || 0;
        return sum + vol;
      }, 0);

      const totalVolume = markets.reduce((sum, m) => {
        const vol = parseFloat(m.volume_dollars || '0') || 0;
        return sum + vol;
      }, 0);

      const totalLiquidity = markets.reduce((sum, m) => {
        const liq = parseFloat(m.liquidity_dollars || '0') || 0;
        return sum + liq;
      }, 0);

      // Use 24h volume if available, else lifetime volume
      const volumeForSorting = totalVolume24h > 0 ? totalVolume24h : totalVolume;

      eventRecords.push({
        id: eventTicker,
        event_ticker: eventTicker,
        title: headlineMarket.title || eventTicker,
        subtitle: headlineMarket.subtitle || null,
        category: headlineMarket.category || 'General',
        total_volume: volumeForSorting,
        total_liquidity: totalLiquidity,
        market_count: markets.length,
        event_data: {
          headlineMarket: {
            ticker: headlineMarket.ticker,
            yesPrice: headlineMarket.last_price || 50,
            endDate: headlineMarket.close_time || headlineMarket.expiration_time,
          },
          markets: markets.map(m => ({
            ticker: m.ticker,
            title: m.title,
            yesPrice: m.last_price || 50,
            volume24h: parseFloat(m.volume_24h_dollars || '0') || 0,
          }))
        },
        last_updated: new Date().toISOString(),
      });
    }

    console.log(`[SYNC] Built ${eventRecords.length} event records`);

    // Filter to only multi-outcome events (more than 1 market)
    const multiOutcomeEvents = eventRecords.filter(e => e.market_count > 1);
    console.log(`[SYNC] Filtered to ${multiOutcomeEvents.length} multi-outcome events`);

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
    for (let i = 0; i < multiOutcomeEvents.length; i += batchSize) {
      const batch = multiOutcomeEvents.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('kalshi_events')
        .insert(batch);

      if (insertError) {
        console.error(`[SYNC] Error inserting batch ${i / batchSize + 1}:`, insertError);
      } else {
        console.log(`[SYNC] Inserted batch ${i / batchSize + 1} (${batch.length} records)`);
      }
    }

    console.log(`[SYNC] Sync complete. Total events stored: ${multiOutcomeEvents.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        eventsStored: multiOutcomeEvents.length,
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
