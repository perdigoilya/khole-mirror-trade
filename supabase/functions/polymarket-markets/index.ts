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
    const { searchTerm, offset = 0 } = await req.json().catch(() => ({}));
    
    console.log('[polymarket-markets] Reading from database cache', searchTerm ? `Search: ${searchTerm}` : '', `Offset: ${offset}`);
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build query
    let query = supabase
      .from('polymarket_markets')
      .select('*')
      .eq('status', 'active')
      .order('volume', { ascending: false })
      .range(offset, offset + 99);

    // Add search filter if provided
    if (searchTerm && searchTerm.trim()) {
      query = query.ilike('question', `%${searchTerm}%`);
    }

    const { data: markets, error } = await query;

    if (error) {
      console.error('[polymarket-markets] Database error:', error);
      throw error;
    }

    if (!markets || markets.length === 0) {
      console.log('[polymarket-markets] No markets in database, triggering sync...');
      
      // Trigger sync function if database is empty
      await supabase.functions.invoke('polymarket-sync');
      
      return new Response(
        JSON.stringify({ markets: [], message: 'Database syncing, please refresh' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[polymarket-markets] Found ${markets.length} markets in database`);

    // Transform database records to frontend format
    const normalizedMarkets = markets.map((market: any) => {
      const vol = market.volume || 0;
      const liq = market.liquidity || 0;
      
      const outcomes = Array.isArray(market.outcomes) ? market.outcomes : ['Yes', 'No'];
      const prices = Array.isArray(market.outcome_prices) ? market.outcome_prices : ['0.5', '0.5'];
      
      // Calculate yes/no prices
      let yesPrice = 50;
      let noPrice = 50;
      
      if (prices.length >= 2) {
        const yesStr = String(prices[0]);
        const noStr = String(prices[1]);
        const yes = parseFloat(yesStr);
        const no = parseFloat(noStr);
        
        if (!isNaN(yes)) {
          yesPrice = Math.round(yes <= 1 ? yes * 100 : yes);
          noPrice = 100 - yesPrice;
        } else if (!isNaN(no)) {
          noPrice = Math.round(no <= 1 ? no * 100 : no);
          yesPrice = 100 - noPrice;
        }
      }

      return {
        id: market.id,
        conditionId: market.condition_id || market.id,
        title: market.question,
        description: market.description || market.question,
        image: market.image || '',
        yesPrice,
        noPrice,
        outcomes,
        outcomePrices: prices,
        volume: vol > 0 ? `$${Math.round(vol).toLocaleString('en-US')}` : '$0',
        liquidity: liq > 0 ? `$${Math.round(liq).toLocaleString('en-US')}` : '$0',
        volumeRaw: vol,
        liquidityRaw: liq,
        endDate: market.end_date || new Date().toISOString(),
        status: market.status === 'closed' ? 'Closed' : 'Active',
        category: market.category || 'Other',
        provider: 'polymarket' as const,
        clobTokenId: market.condition_id || market.id,
        isMultiOutcome: outcomes.length > 2,
      };
    });

    console.log(`[polymarket-markets] Returning ${normalizedMarkets.length} markets`);
    
    return new Response(
      JSON.stringify({ markets: normalizedMarkets }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[polymarket-markets] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
