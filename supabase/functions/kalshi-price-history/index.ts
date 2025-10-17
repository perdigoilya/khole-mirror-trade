import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { marketId, timeRange } = await req.json();
    
    if (!marketId) {
      return new Response(
        JSON.stringify({ error: 'Market ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Kalshi Price History] Fetching for market: ${marketId}, timeRange: ${timeRange}`);

    // Map timeRange to Kalshi period_interval
    // Kalshi supports: 1m, 5m, 15m, 30m, 1h, 4h, 1d
    const periodMap: Record<string, string> = {
      '1H': '5m',
      '6H': '15m',
      '1D': '1h',
      '1W': '4h',
      '1M': '1d',
      'ALL': '1d'
    };
    
    const periodInterval = periodMap[timeRange] || '1h';
    
    // Try both Kalshi API endpoints
    const baseUrls = [
      'https://api.elections.kalshi.com',
      'https://api.kalshi.com'
    ];

    let candlestickData = null;
    let lastError = '';

    for (const base of baseUrls) {
      const url = `${base}/trade-api/v2/markets/${marketId}/candlesticks?period_interval=${periodInterval}`;
      console.log('[Kalshi Price History] Trying endpoint:', url);
      
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          candlestickData = await response.json();
          console.log(`[Kalshi Price History] Successfully fetched ${candlestickData.candlesticks?.length || 0} candlesticks from ${base}`);
          break;
        } else {
          lastError = await response.text();
          console.log(`[Kalshi Price History] Failed ${base}:`, response.status, lastError);
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'Unknown error';
        console.log(`[Kalshi Price History] DNS/Network error for ${base}:`, lastError);
      }
    }

    if (!candlestickData || !candlestickData.candlesticks) {
      console.error('[Kalshi Price History] Failed to fetch candlestick data:', lastError);
      return new Response(
        JSON.stringify({ data: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform candlestick data to chart format
    const chartData = candlestickData.candlesticks.map((candle: any) => {
      // Use close price from yes_bid as the primary price
      const price = candle.price?.close || 
                    (candle.yes_bid?.close !== undefined ? candle.yes_bid.close : 50);
      
      return {
        timestamp: candle.end_period_ts * 1000, // Convert to milliseconds
        date: new Date(candle.end_period_ts * 1000).toISOString(),
        price: Math.round(price) // Price is already in cents
      };
    }).filter((item: any) => item.price !== null);

    console.log(`[Kalshi Price History] Returning ${chartData.length} data points`);

    return new Response(
      JSON.stringify({ data: chartData }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Kalshi Price History] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
