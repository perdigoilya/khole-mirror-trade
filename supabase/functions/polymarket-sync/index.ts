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
    console.log('[polymarket-sync] Starting sync of Polymarket markets...');
    
    // Create Supabase client with service role for database writes
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let allMarkets: any[] = [];
    let nextCursor: string | null = null;
    const MAX_REQUESTS = 50; // Fetch up to 50 pages
    let requestCount = 0;

    // Fetch all markets from Polymarket API with pagination
    try {
      console.log('[polymarket-sync] Fetching from Polymarket API...');
      
      do {
        const limit = 1000;
        const url = `https://gamma-api.polymarket.com/markets?limit=${limit}${nextCursor ? `&next_cursor=${nextCursor}` : ''}`;
        
        const response: Response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          console.error(`[polymarket-sync] Failed to fetch: ${response.status}`);
          break;
        }

        const data: any = await response.json();
        const markets = Array.isArray(data) ? data : [];
        allMarkets = allMarkets.concat(markets);
        nextCursor = data.next_cursor || null;
        requestCount++;

        console.log(`[polymarket-sync] Fetched ${markets.length} markets (total: ${allMarkets.length})`);

        // Break if no more pages or reached max requests
        if (!nextCursor || requestCount >= MAX_REQUESTS) {
          break;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (nextCursor);

    } catch (error) {
      console.error('[polymarket-sync] Error fetching from Polymarket:', error);
    }

    if (allMarkets.length === 0) {
      throw new Error('No markets fetched from Polymarket API');
    }

    console.log(`[polymarket-sync] Total markets fetched: ${allMarkets.length}`);

    // Filter to only active markets
    const activeMarkets = allMarkets.filter((market: any) => 
      market.active === true || market.closed === false
    );
    
    console.log(`[polymarket-sync] Filtered to ${activeMarkets.length} active markets`);

    // Prepare market records for database
    const marketRecords = activeMarkets.map((market: any) => {
      // Parse volume and liquidity
      const volume = parseFloat(market.volume || '0');
      const liquidity = parseFloat(market.liquidity || '0');

      // Parse outcomes and prices
      const outcomes = market.outcomes || ['Yes', 'No'];
      const outcomePrices = market.outcomePrices || ['0.5', '0.5'];

      return {
        id: market.id || market.condition_id,
        condition_id: market.condition_id,
        question: market.question || market.title || 'Unknown',
        description: market.description || null,
        category: market.category || market.groupItemTitle || 'Other',
        outcomes: outcomes,
        outcome_prices: outcomePrices,
        volume: isNaN(volume) ? 0 : volume,
        liquidity: isNaN(liquidity) ? 0 : liquidity,
        end_date: market.endDate || market.end_date_iso || null,
        image: market.image || market.icon || null,
        status: market.closed ? 'closed' : 'active',
        market_data: market,
        last_updated: new Date().toISOString(),
      };
    });

    // Batch insert/upsert markets
    console.log(`[polymarket-sync] Upserting ${marketRecords.length} markets to database...`);
    
    const BATCH_SIZE = 1000;
    for (let i = 0; i < marketRecords.length; i += BATCH_SIZE) {
      const batch = marketRecords.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('polymarket_markets')
        .upsert(batch, { onConflict: 'id' });

      if (error) {
        console.error(`[polymarket-sync] Error upserting batch ${i / BATCH_SIZE + 1}:`, error);
        throw error;
      }
      
      console.log(`[polymarket-sync] Upserted batch ${i / BATCH_SIZE + 1} (${batch.length} markets)`);
    }

    console.log(`[polymarket-sync] Sync complete! Markets: ${marketRecords.length}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        markets_synced: marketRecords.length,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[polymarket-sync] Sync error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
