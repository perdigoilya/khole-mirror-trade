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
    const { searchTerm, offset = 0 } = await req.json().catch(() => ({}));

    console.log("Fetching Polymarket markets...", searchTerm ? `Searching for: ${searchTerm}` : "", `Offset: ${offset}`);

    // Fetch active markets from Polymarket Gamma API - sorted by volume for trending markets
    const response = await fetch(`https://gamma-api.polymarket.com/markets?closed=false&limit=100&offset=${offset}&order=volume24hr&ascending=false`, {
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
    console.log("Sample market data:", JSON.stringify(markets[0], null, 2).slice(0, 1000));

    // Filter by search term if provided
    if (searchTerm && searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      markets = markets.filter((market: any) => {
        const titleMatch = market.question?.toLowerCase().includes(searchLower);
        const descMatch = market.description?.toLowerCase().includes(searchLower);
        return titleMatch || descMatch;
      });
    }

    // Fetch simplified markets from CLOB to enrich with best bid/ask prices
    const simplifiedRes = await fetch("https://clob.polymarket.com/simplified-markets", {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "LovableCloud/1.0 (+https://lovable.dev)",
      },
    });
    let simplified: any[] = [];
    if (simplifiedRes.ok) {
      const simpPayload = await simplifiedRes.json();
      simplified = Array.isArray(simpPayload)
        ? simpPayload
        : (simpPayload?.data || simpPayload?.markets || []);
      console.log("Fetched simplified markets count:", simplified.length);
    } else {
      console.warn("Simplified markets fetch failed with status:", simplifiedRes.status);
    }

    const byConditionId = new Map<string, any>();
    for (const m of simplified) {
      const cid = m.condition_id || m.conditionId;
      if (cid) byConditionId.set(cid, m);
    }

    const toNumber = (v: any): number | undefined => {
      if (v === null || v === undefined) return undefined;
      const n = typeof v === 'string' ? parseFloat(v) : v;
      return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
    };

    const toCents = (v: any): number | undefined => {
      const n = toNumber(v);
      if (n === undefined) return undefined;
      return n <= 1 ? Math.round(n * 100) : Math.round(n);
    };

    // Group markets by condition ID to consolidate multi-outcome markets
    const marketGroups = new Map<string, any[]>();
    for (const market of markets) {
      const cid = market.conditionId || market.condition_id || market.id;
      if (!marketGroups.has(cid)) {
        marketGroups.set(cid, []);
      }
      marketGroups.get(cid)!.push(market);
    }

    console.log(`Grouped ${markets.length} markets into ${marketGroups.size} unique markets`);

    // Helper to format a single market
    const formatMarket = (market: any, simp: any) => {
      const tokens = Array.isArray(simp?.tokens) ? simp.tokens : [];
      
      const extractMid = (t: any): number | undefined => {
          if (!t) return undefined;
          const bid = toNumber(t.best_bid ?? t.bbo?.BUY ?? t.prices?.BUY ?? t.buy);
          const ask = toNumber(t.best_ask ?? t.bbo?.SELL ?? t.prices?.SELL ?? t.sell);
          if (bid !== undefined && ask !== undefined) return (bid + ask) / 2;
          if (ask !== undefined) return ask;
          if (bid !== undefined) return bid;
          const p = toNumber(t.price ?? t.last_price ?? t.last);
          return p;
        };

        // For multi-outcome markets (>2 tokens), find the highest volume token
        let topToken = tokens[0];
        if (tokens.length > 2) {
          topToken = tokens.reduce((max: any, token: any) => {
            const maxVol = toNumber(max?.volume ?? max?.volume_24hr ?? 0) ?? 0;
            const tokenVol = toNumber(token?.volume ?? token?.volume_24hr ?? 0) ?? 0;
            return tokenVol > maxVol ? token : max;
          }, tokens[0]);
        }

        // Extract price for the top outcome
        const topPrice = extractMid(topToken);
        let finalYes = toCents(topPrice);
        let finalNo: number | undefined;

        // For binary markets, try to get complementary NO price
        if (tokens.length === 2) {
          const otherToken = tokens[0] === topToken ? tokens[1] : tokens[0];
          const otherPrice = extractMid(otherToken);
          finalNo = toCents(otherPrice);
        }

        // Fallback to market-level data
        if (finalYes === undefined) {
          const rawPrice = market.lastTradePrice ?? market.price ?? market.outcomePrices?.[0];
          finalYes = toCents(rawPrice);
        }

        // Ensure complement for binary markets
        if (tokens.length <= 2) {
          if (typeof finalYes === 'number' && finalNo === undefined) {
            finalNo = 100 - finalYes;
          } else if (typeof finalNo === 'number' && finalYes === undefined) {
            finalYes = 100 - finalNo;
          }
        }

        // Default to 50/50 if no data
        if (finalYes === undefined) {
          finalYes = 50;
          finalNo = 50;
        }

      const liq = toNumber(market.liquidity || market.liquidity_usd) ?? 0;
      const vol = toNumber(market.volume_usd || market.volume) ?? 0;
      const end = market.end_date_iso || market.end_date || market.endDate;
      const cid = market.conditionId || market.condition_id;

      return {
        id: cid || market.id || market.slug || crypto.randomUUID(),
          title: market.question || market.title || "Unknown Market",
          description: market.description || "",
          image: market.image || market.icon || market.imageUrl || "",
          yesPrice: finalYes,
          noPrice: finalNo,
          volume: vol > 1_000_000 ? `$${(vol / 1_000_000).toFixed(1)}M` : vol > 1_000 ? `$${(vol / 1_000).toFixed(0)}K` : `$${vol.toFixed(0)}`,
          liquidity: liq > 1_000 ? `$${(liq / 1_000).toFixed(0)}K` : `$${liq.toFixed(0)}`,
          endDate: end ? new Date(end).toLocaleDateString() : "TBD",
          status: (market.closed || market.is_resolved) ? "Closed" : ((market.active || market.is_active || simp?.active) ? "Active" : "Inactive"),
          category: market.category || market.tags?.[0] || market.topic || "Other",
          provider: "polymarket",
        volumeRaw: vol,
        liquidityRaw: liq,
      };
    };

    // Format markets with grouping
    const formattedMarkets = Array.from(marketGroups.values())
      .map((marketGroup: any[]) => {
        // For multi-outcome markets, use the highest volume market as the main display
        const mainMarket = marketGroup.reduce((highest, current) => {
          const highestVol = toNumber(highest.volume_usd || highest.volume || 0) || 0;
          const currentVol = toNumber(current.volume_usd || current.volume || 0) || 0;
          return currentVol > highestVol ? current : highest;
        }, marketGroup[0]);

        const cid = mainMarket.conditionId || mainMarket.condition_id;
        const simp = cid ? byConditionId.get(cid) : undefined;

        const formattedMain = formatMarket(mainMarket, simp);
        
        // If this is a multi-outcome market, format all sub-markets
        const subMarkets = marketGroup.length > 1 
          ? marketGroup.map(m => formatMarket(m, simp))
          : [];

        return {
          ...formattedMain,
          subMarkets,
          isMultiOutcome: marketGroup.length > 1,
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
