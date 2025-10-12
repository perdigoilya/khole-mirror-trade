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
    const { searchTerm, offset = 0, marketId } = await req.json().catch(() => ({}));

    console.log("Fetching Polymarket events...", searchTerm ? `Searching for: ${searchTerm}` : "", `Offset: ${offset}`);

    // Fetch active events from Polymarket Gamma API - events contain grouped markets
    const response = await fetch(`https://gamma-api.polymarket.com/events?closed=false&limit=100&offset=${offset}&order=volume24hr&ascending=false`, {
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
    let events: any[] = Array.isArray(payload)
      ? payload
      : (payload?.events || payload?.data || []);

    // If a specific marketId (conditionId) is provided, filter to only the event containing that market
    if (marketId) {
      const target = String(marketId).toLowerCase();
      events = events.filter((ev: any) => {
        const ms = Array.isArray(ev?.markets) ? ev.markets : [];
        return ms.some((m: any) => {
          const cid = String(m?.conditionId || m?.condition_id || '').toLowerCase();
          const mid = String(m?.id || '').toLowerCase();
          return cid === target || mid === target;
        });
      });
    }

    console.log("Fetched events count:", Array.isArray(events) ? events.length : 0);
    console.log("Sample event data:", JSON.stringify(events[0], null, 2).slice(0, 1000));

    // Filter by search term if provided
    if (searchTerm && searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      events = events.filter((event: any) => {
        const titleMatch = event.title?.toLowerCase().includes(searchLower);
        const descMatch = event.description?.toLowerCase().includes(searchLower);
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

    // Helper to format a single market into our UI structure
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

      // Extract CLOB token ids from Gamma when available
      const clobIds: string[] = Array.isArray(market?.clobTokenIds)
        ? market.clobTokenIds
        : (typeof market?.clobTokenIds === 'string'
            ? String(market.clobTokenIds)
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean)
            : []);

      const topClobId = String(
        topToken?.token_id ?? topToken?.tokenId ?? topToken?.id ?? clobIds[0] ?? ''
      );

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
        clobTokenId: topClobId || undefined,
        clobTokenIds: clobIds.length ? clobIds : undefined,
      };
    };
    // Format events - each event already contains its grouped markets
    const formattedMarkets = events.map((event: any) => {
      const eventMarkets = event.markets || [];
      
      // Use the event's main market (first market) as the display market
      const mainMarket = eventMarkets[0] || {};
      const cid = mainMarket.conditionId || mainMarket.condition_id;
      const simp = cid ? byConditionId.get(cid) : undefined;

      const formattedMain = formatMarket(mainMarket, simp);
      
      // Format all sub-markets if this is a multi-outcome event
      const subMarkets = eventMarkets.length > 1 
        ? eventMarkets.map((m: any) => {
            const mcid = m.conditionId || m.condition_id;
            const msimp = mcid ? byConditionId.get(mcid) : undefined;
            return formatMarket(m, msimp);
          })
        : [];

      // Use event-level metrics (already aggregated by Polymarket)
      // Fall back to summing individual markets if event-level data is missing
      let totalVolume = toNumber(event.volume || event.volume_usd) ?? 0;
      let totalLiquidity = toNumber(event.liquidity || event.liquidity_usd) ?? 0;
      
      // If event doesn't have aggregated data, sum from markets
      if (totalVolume === 0 && eventMarkets.length > 0) {
        totalVolume = eventMarkets.reduce((sum: number, m: any) => {
          const vol = toNumber(m.volume_usd || m.volume) ?? 0;
          return sum + vol;
        }, 0);
      }
      
      if (totalLiquidity === 0 && eventMarkets.length > 0) {
        totalLiquidity = eventMarkets.reduce((sum: number, m: any) => {
          const liq = toNumber(m.liquidity || m.liquidity_usd) ?? 0;
          return sum + liq;
        }, 0);
      }

      // Format aggregated metrics
      const volumeFormatted = totalVolume > 1_000_000 
        ? `$${(totalVolume / 1_000_000).toFixed(1)}M` 
        : totalVolume > 1_000 
        ? `$${(totalVolume / 1_000).toFixed(0)}K` 
        : `$${totalVolume.toFixed(0)}`;
      
      const liquidityFormatted = totalLiquidity > 1_000 
        ? `$${(totalLiquidity / 1_000).toFixed(0)}K` 
        : `$${totalLiquidity.toFixed(0)}`;

      return {
        ...formattedMain,
        title: event.title || formattedMain.title, // Use event title
        description: event.description || formattedMain.description,
        image: event.image || event.icon || formattedMain.image,
        volume: volumeFormatted,
        liquidity: liquidityFormatted,
        volumeRaw: totalVolume,
        liquidityRaw: totalLiquidity,
        // For multi-outcome events, set prices to undefined to indicate multiple outcomes
        yesPrice: eventMarkets.length > 1 ? undefined : formattedMain.yesPrice,
        noPrice: eventMarkets.length > 1 ? undefined : formattedMain.noPrice,
        subMarkets,
        isMultiOutcome: eventMarkets.length > 1,
      };
    });

    console.log(`Returning ${formattedMarkets.length} Polymarket events`);

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
