import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { marketId, timeRange = '1D' } = await req.json();

    if (!marketId) {
      return new Response(
        JSON.stringify({ error: "marketId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map timeRange to intervals and durations
    const rangeConfig: Record<string, { interval: string; duration: number }> = {
      '1H': { interval: '1m', duration: 3600 },
      '6H': { interval: '5m', duration: 21600 },
      '1D': { interval: '1h', duration: 86400 },
      '1W': { interval: '1h', duration: 604800 },
      '1M': { interval: '1d', duration: 2592000 },
      'ALL': { interval: '1d', duration: 31536000 }, // 1 year max
    };

    const config = rangeConfig[timeRange] || rangeConfig['1D'];
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - config.duration;

    console.log(`Fetching price history for market ${marketId}, range: ${timeRange}`);

    // Fetch from Polymarket price history API
    const url = `https://gamma-api.polymarket.com/prices-history?interval=${config.interval}&market=${marketId}&startTs=${startTime}&endTs=${endTime}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "LovableCloud/1.0 (+https://lovable.dev)",
      },
    });

    if (!response.ok) {
      console.error("Polymarket price history API error:", response.status);
      
      // If 404, return empty data instead of error (market may not have price history yet)
      if (response.status === 404) {
        console.log("No price history available for this market");
        return new Response(
          JSON.stringify({ data: [], message: "No price history available" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to fetch price history" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const history = data?.history || [];

    // Transform data for charting
    const chartData = history.map((point: any) => ({
      timestamp: point.t * 1000, // Convert to milliseconds
      date: new Date(point.t * 1000).toLocaleString(),
      price: Math.round((point.p || 0) * 100), // Convert to cents
    }));

    console.log(`Fetched ${chartData.length} price points`);

    return new Response(
      JSON.stringify({ data: chartData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching price history:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
