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
    console.log('[kalshi-sync] Starting sync of Kalshi events and markets...');
    
    // Create Supabase client with service role for database writes
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const baseUrls = [
      'https://api.elections.kalshi.com',
      'https://api.kalshi.com'
    ];

    let allEvents: any[] = [];
    let allMarkets: any[] = [];
    let cursor: string | null = null;
    const MAX_REQUESTS = 50;
    let requestCount = 0;

    // Step 1: Fetch events from Kalshi API
    for (const base of baseUrls) {
      try {
        console.log(`[kalshi-sync] Fetching events from ${base}...`);
        cursor = null;
        requestCount = 0;
        
        do {
          const limit = 1000;
          const path: string = `/trade-api/v2/events?status=open&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
          const url: string = `${base}${path}`;
          
          const response: Response = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            console.error(`[kalshi-sync] Failed to fetch events from ${base}: ${response.status}`);
            break;
          }

          const data: any = await response.json();
          const events = data.events || [];
          allEvents = allEvents.concat(events);
          cursor = data.cursor || null;
          requestCount++;

          console.log(`[kalshi-sync] Fetched ${events.length} events (total: ${allEvents.length})`);

          if (!cursor || requestCount >= MAX_REQUESTS) {
            cursor = null;
            break;
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        } while (cursor);

        // Continue to next base to merge more events
      } catch (error) {
        console.error(`[kalshi-sync] Error fetching events from ${base}:`, error);
      }
    }

    // Deduplicate events by event_ticker
    const seenEvents = new Set<string>();
    allEvents = allEvents.filter((e) => {
      const key = e?.event_ticker;
      if (!key || seenEvents.has(key)) return false;
      seenEvents.add(key);
      return true;
    });

    console.log(`[kalshi-sync] Total unique events: ${allEvents.length}`);

    // Step 2: Fetch all markets
    for (const base of baseUrls) {
      try {
        console.log(`[kalshi-sync] Fetching markets from ${base}...`);
        cursor = null;
        requestCount = 0;
        
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
            console.error(`[kalshi-sync] Failed to fetch markets from ${base}: ${response.status}`);
            break;
          }

          const data: any = await response.json();
          const markets = data.markets || [];
          allMarkets = allMarkets.concat(markets);
          cursor = data.cursor || null;
          requestCount++;

          console.log(`[kalshi-sync] Fetched ${markets.length} markets (total: ${allMarkets.length})`);

          if (!cursor || requestCount >= MAX_REQUESTS) {
            cursor = null;
            break;
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        } while (cursor);

        // Continue to next base to merge more markets
      } catch (error) {
        console.error(`[kalshi-sync] Error fetching markets from ${base}:`, error);
      }
    }

    // Deduplicate markets by ticker
    const seenMarkets = new Set<string>();
    allMarkets = allMarkets.filter((m) => {
      const key = m?.ticker;
      if (!key || seenMarkets.has(key)) return false;
      seenMarkets.add(key);
      return true;
    });

    console.log(`[kalshi-sync] Total unique markets: ${allMarkets.length}`);

    // Filter markets to exclude parlays
    const isParlay = (m: any): boolean => {
      const ticker: string = m.ticker || '';
      const eventTicker: string = m.event_ticker || '';
      const title: string = (m.title || '').toString();
      // Flag parlays: explicit keywords or comma-separated multi-props
      const multiFlag = /MULTIGAME|PARLAY|BUNDLE|MVEN/i.test(ticker) || /MULTIGAME|PARLAY|BUNDLE|MVEN/i.test(eventTicker);
      const hasComma = title.includes(',');
      return multiFlag || hasComma;
    };

    const singleLegMarkets = allMarkets.filter(m => !isParlay(m));
    console.log(`[kalshi-sync] Filtered to ${singleLegMarkets.length} single-leg markets`);

    // Step 3: Prepare market records for database
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

    // Batch upsert markets
    console.log(`[kalshi-sync] Upserting ${marketRecords.length} markets to database...`);
    
    const BATCH_SIZE = 1000;
    for (let i = 0; i < marketRecords.length; i += BATCH_SIZE) {
      const batch = marketRecords.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('kalshi_markets')
        .upsert(batch, { onConflict: 'ticker' });

      if (error) {
        console.error(`[kalshi-sync] Error upserting market batch ${i / BATCH_SIZE + 1}:`, error);
        throw error;
      }
      
      console.log(`[kalshi-sync] Upserted market batch ${i / BATCH_SIZE + 1} (${batch.length} markets)`);
    }

    // Step 4: Build event records from fetched events + aggregate market data
    const eventRecordsMap = new Map<string, any>();

    for (const event of allEvents) {
      const eventTicker = event.event_ticker;
      if (!eventTicker) continue;

      eventRecordsMap.set(eventTicker, {
        id: eventTicker,
        event_ticker: eventTicker,
        title: event.title || eventTicker,
        subtitle: event.sub_title || event.subtitle || null,
        category: event.category || 'General',
        total_volume: 0,
        total_liquidity: 0,
        market_count: 0,
        event_data: event,
        last_updated: new Date().toISOString(),
      });
    }

    // Aggregate volume/liquidity from markets per event
    for (const market of singleLegMarkets) {
      const eventTicker = market.event_ticker;
      if (!eventTicker || !eventRecordsMap.has(eventTicker)) continue;

      const eventRecord = eventRecordsMap.get(eventTicker)!;
      const vol24h = Number(market.volume_24h_dollars) || 0;
      const vol = Number(market.volume_dollars) || 0;
      const liq = Number(market.liquidity_dollars) || 0;

      eventRecord.total_volume += (vol24h > 0 ? vol24h : vol);
      eventRecord.total_liquidity += liq;
      eventRecord.market_count += 1;
    }

    const eventRecords = Array.from(eventRecordsMap.values());

    // Batch upsert events
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
      
      console.log(`[kalshi-sync] Upserted event batch ${i / BATCH_SIZE + 1} (${batch.length} events)`);
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
