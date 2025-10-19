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
    console.log('[kalshi-events] Reading from database cache');
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query events from database
    // Only get events with volume > 0
    const { data: events, error } = await supabase
      .from('kalshi_events')
      .select('*')
      .order('total_volume', { ascending: false, nullsFirst: false })
      .limit(200);

    if (error) {
      console.error('[kalshi-events] Database error:', error);
      throw error;
    }

    if (!events || events.length === 0) {
      // Double-check if table is truly empty before triggering sync
      const { count } = await supabase
        .from('kalshi_events')
        .select('event_ticker', { count: 'exact', head: true });

      if (!count || count === 0) {
        console.log('[kalshi-events] No events in database, triggering sync...');
        await supabase.functions.invoke('kalshi-sync');
        return new Response(
          JSON.stringify({ events: [], message: 'Database syncing, please refresh' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Table has data but current filters returned empty
      return new Response(
        JSON.stringify({ events: [], message: 'No results for current filters' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[kalshi-events] Found ${events.length} events in database`);

    // For each event, get headline market
    const eventsWithMarkets = await Promise.all(
      events.map(async (event: any) => {
        // Get markets for this event
        const { data: markets } = await supabase
          .from('kalshi_markets')
          .select('*')
          .eq('event_ticker', event.event_ticker)
          .order('volume_24h_dollars', { ascending: false, nullsFirst: false })
          .limit(5);

        const headlineMarket = markets && markets.length > 0 ? markets[0] : null;
        const yesPrice = headlineMarket?.yes_price || 50;
        const noPrice = headlineMarket?.no_price || 50;

        return {
          id: event.event_ticker,
          eventTicker: event.event_ticker,
          title: event.title,
          subtitle: event.subtitle,
          description: event.title,
          image: null,
          yesPrice,
          noPrice,
          volume: event.total_volume > 0 ? `$${Math.round(event.total_volume).toLocaleString('en-US')}` : '$0',
          liquidity: event.total_liquidity > 0 ? `$${event.total_liquidity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
          volumeRaw: event.total_volume || 0,
          liquidityRaw: event.total_liquidity || 0,
          endDate: headlineMarket?.close_time || new Date().toISOString(),
          status: 'Active',
          category: event.category || 'General',
          provider: 'kalshi' as const,
          marketCount: event.market_count || 0,
          markets: markets ? markets.slice(0, 5).map((m: any) => ({
            ticker: m.ticker,
            title: m.title,
            yesPrice: m.yes_price || 50,
            volume: m.volume_24h_dollars || m.volume_dollars || 0,
          })) : [],
        };
      })
    );

    console.log(`[kalshi-events] Returning ${eventsWithMarkets.length} events`);
    
    return new Response(
      JSON.stringify({ events: eventsWithMarkets }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[kalshi-events] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
