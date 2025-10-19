import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[kalshi-sync] Starting sync of Kalshi markets...');
    
    // Create Supabase client with service role for database writes
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const baseUrls = [
      'https://api.elections.kalshi.com',
      'https://api.kalshi.com'
    ];

    let allMarkets: any[] = [];
    let cursor: string | null = null;
    const MAX_REQUESTS = 50; // Fetch up to 50 pages (50,000 markets max)
    let requestCount = 0;

    // Fetch all markets from Kalshi API with pagination
    for (const base of baseUrls) {
      try {
        console.log(`[kalshi-sync] Fetching from ${base}...`);
        
        do {
          const limit = 1000;
          const path: string = `/trade-api/v2/markets?status=open&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
          const url: string = `${base}${path}`;
          
          const response: Response = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            console.error(`[kalshi-sync] Failed to fetch from ${base}: ${response.status}`);
            break;
          }

          const data: any = await response.json();
          const markets = data.markets || [];
          allMarkets = allMarkets.concat(markets);
          cursor = data.cursor || null;
          requestCount++;

          console.log(`[kalshi-sync] Fetched ${markets.length} markets (total: ${allMarkets.length})`);

          // Break if no more pages or reached max requests
          if (!cursor || requestCount >= MAX_REQUESTS) {
            cursor = null;
            break;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } while (cursor);

        // If we successfully fetched markets, break from baseUrls loop
        if (allMarkets.length > 0) {
          break;
        }
      } catch (error) {
        console.error(`[kalshi-sync] Error fetching from ${base}:`, error);
      }
    }

    if (allMarkets.length === 0) {
      throw new Error('No markets fetched from Kalshi API');
    }

    console.log(`[kalshi-sync] Total markets fetched: ${allMarkets.length}`);

    // Filter to only single-leg markets (no parlays)
    const isParlay = (m: any): boolean => {
      const ticker: string = m.ticker || '';
      const eventTicker: string = m.event_ticker || '';
      const title: string = (m.title || '').toString();
      const hasComma = title.includes(',');
      const multiFlag = /MULTIGAME|PARLAY|BUNDLE/i.test(ticker) || /MULTIGAME|PARLAY|BUNDLE/i.test(eventTicker);
      return hasComma || multiFlag;
    };

    const singleLegMarkets = allMarkets.filter(m => !isParlay(m));
    console.log(`[kalshi-sync] Filtered to ${singleLegMarkets.length} single-leg markets`);

    // Prepare market records for database
    const marketRecords = singleLegMarkets.map((market: any) => {
      const vol24h = market.volume_24h_dollars ? parseFloat(market.volume_24h_dollars) : null;
      const vol = market.volume_dollars ? parseFloat(market.volume_dollars) : null;
      const liq = market.liquidity_dollars ? parseFloat(market.liquidity_dollars) : null;

      return {
        id: market.ticker,
        ticker: market.ticker,
        event_ticker: market.event_ticker || null,
        title: market.title || market.ticker,
        subtitle: market.subtitle || null,
        category: market.category || 'General',
        yes_price: typeof market.last_price === 'number' ? Math.round(market.last_price) : null,
        no_price: typeof market.last_price === 'number' ? 100 - Math.round(market.last_price) : null,
        volume_24h_dollars: vol24h,
        volume_dollars: vol,
        liquidity_dollars: liq,
        close_time: market.close_time || market.expiration_time || null,
        status: market.status || 'open',
        market_data: market,
        last_updated: new Date().toISOString(),
      };
    });

    // Batch insert/upsert markets
    console.log(`[kalshi-sync] Upserting ${marketRecords.length} markets to database...`);
    
    const BATCH_SIZE = 1000;
    for (let i = 0; i < marketRecords.length; i += BATCH_SIZE) {
      const batch = marketRecords.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('kalshi_markets')
        .upsert(batch, { onConflict: 'ticker' });

      if (error) {
        console.error(`[kalshi-sync] Error upserting batch ${i / BATCH_SIZE + 1}:`, error);
        throw error;
      }
      
      console.log(`[kalshi-sync] Upserted batch ${i / BATCH_SIZE + 1} (${batch.length} markets)`);
    }

    // Aggregate events from markets
    const eventsMap = new Map<string, any>();
    
    for (const market of singleLegMarkets) {
      const eventTicker = market.event_ticker;
      if (!eventTicker) continue;

      if (!eventsMap.has(eventTicker)) {
        eventsMap.set(eventTicker, {
          markets: [],
          title: market.title?.split('?')[0] || eventTicker,
          subtitle: market.subtitle || null,
          category: market.category || 'General',
        });
      }

      eventsMap.get(eventTicker)!.markets.push(market);
    }

    // Prepare event records
    const eventRecords = Array.from(eventsMap.entries()).map(([eventTicker, eventData]) => {
      const markets = eventData.markets;
      const totalVol24h = markets.reduce((sum: number, m: any) => {
        const v = typeof m.volume_24h_dollars === 'string' ? parseFloat(m.volume_24h_dollars) : 0;
        return sum + (isNaN(v) ? 0 : v);
      }, 0);
      const totalVol = markets.reduce((sum: number, m: any) => {
        const v = typeof m.volume_dollars === 'string' ? parseFloat(m.volume_dollars) : 0;
        return sum + (isNaN(v) ? 0 : v);
      }, 0);
      const totalLiq = markets.reduce((sum: number, m: any) => {
        const liq = m.liquidity_dollars ? parseFloat(m.liquidity_dollars) : 0;
        return sum + liq;
      }, 0);

      return {
        id: eventTicker,
        event_ticker: eventTicker,
        title: eventData.title,
        subtitle: eventData.subtitle,
        category: eventData.category,
        total_volume: totalVol24h > 0 ? totalVol24h : totalVol,
        total_liquidity: totalLiq,
        market_count: markets.length,
        event_data: { markets: markets.map((m: any) => ({ ticker: m.ticker, title: m.title })) },
        last_updated: new Date().toISOString(),
      };
    });

    // Batch insert/upsert events
    console.log(`[kalshi-sync] Upserting ${eventRecords.length} events to database...`);
    
    for (let i = 0; i < eventRecords.length; i += BATCH_SIZE) {
      const batch = eventRecords.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('kalshi_events')
        .upsert(batch, { onConflict: 'event_ticker' });

      if (error) {
        console.error(`[kalshi-sync] Error upserting event batch:`, error);
        throw error;
      }
    }

    console.log(`[kalshi-sync] Sync complete! Markets: ${marketRecords.length}, Events: ${eventRecords.length}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        markets_synced: marketRecords.length,
        events_synced: eventRecords.length,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[kalshi-sync] Sync error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
