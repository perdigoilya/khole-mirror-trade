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

    // Query markets from database
    // Only get markets with volume > 0 and liquidity >= $100
    const { data: markets, error } = await supabase
      .from('kalshi_markets')
      .select('*')
      .in('status', ['open', 'active'])
      .or('volume_24h_dollars.gt.0,volume_dollars.gt.0')
      .gte('liquidity_dollars', 100)
      .not('event_ticker', 'ilike', '%SINGLEGAME%')
      .not('event_ticker', 'ilike', '%MVEN%')
      .not('event_ticker', 'ilike', '%PARLAY%')
      .not('event_ticker', 'ilike', '%BUNDLE%')
      .not('event_ticker', 'ilike', '%MULTIGAME%')
      .order('volume_24h_dollars', { ascending: false, nullsFirst: false })
      .limit(1000);

    if (error) {
      console.error('[kalshi-markets] Database error:', error);
      throw error;
    }

    if (!markets || markets.length === 0) {
      console.log('[kalshi-markets] No markets in database, triggering sync...');
      
      // Trigger sync function if database is empty
      await supabase.functions.invoke('kalshi-sync');
      
      return new Response(
        JSON.stringify({ markets: [], message: 'Database syncing, please refresh' }),
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
        yesPrice: market.yes_price ?? 50,
        noPrice: market.no_price ?? 50,
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
