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
    const { searchTerm } = await req.json().catch(() => ({}));

    console.log("Fetching Polymarket markets...", searchTerm ? `Searching for: ${searchTerm}` : "");

    // Fetch markets from Polymarket public API
    const response = await fetch("https://clob.polymarket.com/markets", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("Polymarket API response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Polymarket API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch markets from Polymarket", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let markets = await response.json();
    console.log("Fetched markets count:", markets.length);

    // Filter by search term if provided
    if (searchTerm && searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      markets = markets.filter((market: any) => {
        const titleMatch = market.question?.toLowerCase().includes(searchLower);
        const descMatch = market.description?.toLowerCase().includes(searchLower);
        return titleMatch || descMatch;
      });
    }

    // Format markets to match our UI structure
    const formattedMarkets = markets
      .filter((market: any) => market.active && !market.closed) // Only active markets
      .slice(0, 50) // Limit to 50 markets
      .map((market: any) => {
        const yesOutcome = market.outcomes?.find((o: any) => o.name === "Yes");
        const noOutcome = market.outcomes?.find((o: any) => o.name === "No");
        
        return {
          id: market.condition_id || market.id,
          title: market.question || "Unknown Market",
          description: market.description || "",
          yesPrice: yesOutcome?.price ? Math.round(yesOutcome.price * 100) : 50,
          noPrice: noOutcome?.price ? Math.round(noOutcome.price * 100) : 50,
          volume: market.volume ? `$${(market.volume / 1000000).toFixed(1)}M` : "$0",
          liquidity: market.liquidity ? `$${(market.liquidity / 1000).toFixed(0)}K` : "$0",
          endDate: market.end_date_iso ? new Date(market.end_date_iso).toLocaleDateString() : "TBD",
          status: market.closed ? "Closed" : market.active ? "Active" : "Inactive",
          category: market.category || market.tags?.[0] || "Other",
          provider: "polymarket",
        };
      });

    console.log(`Returning ${formattedMarkets.length} Polymarket markets`);

    return new Response(
      JSON.stringify({ markets: formattedMarkets }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in polymarket-markets function:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
