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

    // Fetch active markets from Polymarket Gamma API (public, no auth required)
    const response = await fetch("https://gamma-api.polymarket.com/markets?closed=false&limit=50&offset=0&order=id&ascending=false", {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "LovableCloud/1.0 (+https://lovable.dev)",
      },
    });

    console.log("Polymarket API response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Polymarket API error:", response.status, errorText?.slice(0, 500));
      return new Response(
        JSON.stringify({ error: "Failed to fetch markets from Polymarket", details: errorText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await response.json();
    let markets: any[] = Array.isArray(payload)
      ? payload
      : (payload?.markets || payload?.data || []);
    console.log("Fetched markets count:", Array.isArray(markets) ? markets.length : 0);

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
    const formattedMarkets = (markets as any[])
      .slice(0, 50)
      .map((market: any) => {
        const yesOutcome = market.outcomes?.find((o: any) => (o.name || o.ticker)?.toLowerCase() === "yes");
        const noOutcome = market.outcomes?.find((o: any) => (o.name || o.ticker)?.toLowerCase() === "no");

        const rawYes = yesOutcome?.price ?? market.yesPrice ?? market.best_buy_yes_cost ?? market.best_bid_yes ?? market.best_bid?.yes;
        const rawNo  = noOutcome?.price  ?? market.noPrice  ?? market.best_buy_no_cost  ?? market.best_bid_no  ?? market.best_bid?.no;
        const toCents = (v: any) => typeof v === 'number' ? (v <= 1 ? Math.round(v * 100) : Math.round(v)) : 50;

        return {
          id: market.condition_id || market.id || market.slug || crypto.randomUUID(),
          title: market.question || market.title || "Unknown Market",
          description: market.description || "",
          yesPrice: toCents(rawYes),
          noPrice: toCents(rawNo),
          volume: market.volume ? `$${(market.volume / 1_000_000).toFixed(1)}M` : market.volume_usd ? `$${(market.volume_usd / 1_000_000).toFixed(1)}M` : "$0",
          liquidity: market.liquidity ? `$${(market.liquidity / 1_000).toFixed(0)}K` : market.liquidity_usd ? `$${(market.liquidity_usd / 1_000).toFixed(0)}K` : "$0",
          endDate: market.end_date_iso ? new Date(market.end_date_iso).toLocaleDateString() : market.end_date ? new Date(market.end_date).toLocaleDateString() : "TBD",
          status: (market.closed || market.is_resolved) ? "Closed" : ((market.active || market.is_active) ? "Active" : "Inactive"),
          category: market.category || market.tags?.[0] || market.topic || "Other",
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
