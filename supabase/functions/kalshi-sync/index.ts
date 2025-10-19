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

    // First fetch events to get accurate titles/categories
    let allEvents: any[] = [];
    for (const base of baseUrls) {
      try {
        console.log(`[kalshi-sync] Fetching events from ${base}...`);
        let eCursor: string | null = null;
        let eCount = 0;
        do {
          const limit = 1000;
          const ePath: string = `/trade-api/v2/events?status=open&limit=${limit}${eCursor ? `&cursor=${eCursor}` : ''}`;
          const eUrl: string = `${base}${ePath}`;
          const eResp: Response = await fetch(eUrl, {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(15000),
          });
          if (!eResp.ok) {
            console.error(`[kalshi-sync] Failed to fetch events from ${base}: ${eResp.status}`);
            break;
          }
          const eData: any = await eResp.json();
          const events = eData.events || [];
          allEvents = allEvents.concat(events);
          eCursor = eData.cursor || null;
          eCount++;
          console.log(`[kalshi-sync] Fetched ${events.length} events (total: ${allEvents.length})`);
          if (!eCursor || eCount >= MAX_REQUESTS) {
            eCursor = null;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        } while (eCursor);
        if (allEvents.length > 0) {
          break;
        }
      } catch (error) {
        console.error(`[kalshi-sync] Error fetching events from ${base}:`, error);
      }
    }

    if (allEvents.length === 0) {
      console.warn('[kalshi-sync] No events fetched; will derive titles from markets as fallback');
    }

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
      const pattern = /MULTIGAME|PARLAY|BUNDLE|SINGLEGAME|MVEN/i;
      const multiFlag = pattern.test(ticker) || pattern.test(eventTicker);
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

    // Cleanup any previously stored single-game/parlay noise
    const badPatterns = ['%SINGLEGAME%', '%MVEN%', '%PARLAY%', '%BUNDLE%', '%MULTIGAME%'];
    for (const p of badPatterns) {
      await supabase.from('kalshi_markets').delete().ilike('event_ticker', p);
      await supabase.from('kalshi_events').delete().ilike('event_ticker', p);
    }


    // Build event info map from fetched events
    const eventInfo = new Map<string, { title: string; subtitle: string | null; category: string | null }>();
    for (const ev of allEvents) {
      const et = ev.event_ticker || ev.ticker || ev.id;
      if (!et) continue;
      if (/SINGLEGAME|MVEN|PARLAY|BUNDLE|MULTIGAME/i.test(et)) continue;
      eventInfo.set(et, {
        title: ev.title || ev.name || et,
        subtitle: ev.subtitle || null,
        category: ev.category || null,
      });
    }

    // Group markets by event_ticker
    const grouped = new Map<string, any[]>();
    for (const m of singleLegMarkets) {
      const et = m.event_ticker;
      if (!et || /SINGLEGAME|MVEN|PARLAY|BUNDLE|MULTIGAME/i.test(et)) continue;
      if (!grouped.has(et)) grouped.set(et, []);
      grouped.get(et)!.push(m);
    }

    // Prepare event records
    const eventRecords = Array.from(grouped.entries()).map(([et, mkts]) => {
      const info = eventInfo.get(et);
      const totalVol24h = mkts.reduce((s: number, m: any) => s + (m.volume_24h_dollars ? parseFloat(m.volume_24h_dollars) : 0), 0);
      const totalVol = mkts.reduce((s: number, m: any) => s + (m.volume_dollars ? parseFloat(m.volume_dollars) : 0), 0);
      const totalLiq = mkts.reduce((s: number, m: any) => s + (m.liquidity_dollars ? parseFloat(m.liquidity_dollars) : 0), 0);
      return {
        id: et,
        event_ticker: et,
        title: info?.title || (mkts[0]?.title?.split('?')[0] || et),
        subtitle: info?.subtitle || null,
        category: info?.category || (mkts[0]?.category || 'General'),
        total_volume: totalVol24h > 0 ? totalVol24h : totalVol,
        total_liquidity: totalLiq,
        market_count: mkts.length,
        event_data: { markets: mkts.map((m: any) => ({ ticker: m.ticker, title: m.title })) },
        last_updated: new Date().toISOString(),
      };
    }).filter(r => r.market_count > 0);

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
