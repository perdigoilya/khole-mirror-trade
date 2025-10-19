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
    console.log('[kalshi-markets] Reading from database cache');
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read optional pagination from request
    const { offset = 0 } = await req.json().catch(() => ({ offset: 0 }));

    // Query markets from database (broad pool; UI applies filters)
    const { data: markets, error } = await supabase
      .from('kalshi_markets')
      .select('*')
      .order('volume_24h_dollars', { ascending: false, nullsFirst: false })
      .range(offset, offset + 199);

    if (error) {
      console.error('[kalshi-markets] Database error:', error);
      throw error;
    }

    if (!markets || markets.length === 0) {
      // Double-check if table truly empty before triggering sync
      const { count } = await supabase
        .from('kalshi_markets')
        .select('ticker', { count: 'exact', head: true });

      if (!count || count === 0) {
        console.log('[kalshi-markets] No markets in database, triggering sync...');
        await supabase.functions.invoke('kalshi-sync');
        return new Response(
          JSON.stringify({ markets: [], message: 'Database syncing, please refresh' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Table has data but this page/search returned empty
      return new Response(
        JSON.stringify({ markets: [], message: 'No results for current filters' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[kalshi-markets] Found ${markets.length} markets in database`);

    // Transform database records to frontend format
    const normalizedMarkets = markets.map((market: any) => {
      const vol24h = market.volume_24h_dollars || 0;
      const vol = market.volume_dollars || 0;
      const volumeDollars = vol24h > 0 ? vol24h : vol;
      const liq = market.liquidity_dollars || 0;

      return {
        id: market.ticker,
        ticker: market.ticker,
        eventTicker: market.event_ticker,
        title: market.title,
        subtitle: market.subtitle,
        description: market.subtitle || market.title,
        image: undefined,
        yesPrice: (typeof market.yes_price === 'number') ? market.yes_price : 50,
        noPrice: (typeof market.no_price === 'number') ? market.no_price : 50,
        volume: volumeDollars > 0 ? `$${Math.round(volumeDollars).toLocaleString('en-US')}` : '$0',
        liquidity: liq > 0 ? `$${liq.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
        volumeRaw: volumeDollars,
        liquidityRaw: liq,
        endDate: market.close_time || new Date().toISOString(),
        status: market.status || 'Active',
        category: market.category || 'General',
        provider: 'kalshi' as const,
        clobTokenId: market.ticker,
        isMultiOutcome: false,
      };
    });

    console.log(`[kalshi-markets] Returning ${normalizedMarkets.length} markets`);
    
    return new Response(
      JSON.stringify({ markets: normalizedMarkets }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[kalshi-markets] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
