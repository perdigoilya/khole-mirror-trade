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

    const toCents = (v: any): number => {
      const n = toNumber(v);
      if (n === undefined) return 50;
      return n <= 1 ? Math.round(n * 100) : Math.round(n);
    };

    // Format markets to match our UI structure (enriched with BBO where available)
    const formattedMarkets = (markets as any[])
      .map((market: any) => {
        const cid = market.conditionId || market.condition_id;
        const simp = cid ? byConditionId.get(cid) : undefined;

        // Try to extract YES/NO prices from simplified tokens
        let yesPriceCents: number | undefined;
        let noPriceCents: number | undefined;

        const tokens = Array.isArray(simp?.tokens) ? simp.tokens : [];
        const findToken = (predicate: (t: any) => boolean) => tokens.find((t: any) => {
          try {
            return predicate(t);
          } catch { return false; }
        });

        const isYes = (t: any) => {
          const s = (t?.symbol || t?.outcome || t?.name || '').toString().toLowerCase();
          return s === 'yes' || s === 'up' || s === 'true';
        };
        const isNo = (t: any) => {
          const s = (t?.symbol || t?.outcome || t?.name || '').toString().toLowerCase();
          return s === 'no' || s === 'down' || s === 'false';
        };

        const yesToken = findToken(isYes) || tokens[0];
        const noToken = findToken(isNo) || tokens[1];

        const extractMid = (t: any): number | undefined => {
          if (!t) return undefined;
          const bid = toNumber(t.best_bid ?? t.bbo?.BUY ?? t.prices?.BUY ?? t.buy);
          const ask = toNumber(t.best_ask ?? t.bbo?.SELL ?? t.prices?.SELL ?? t.sell);
          if (bid !== undefined && ask !== undefined) return (bid + ask) / 2;
          if (ask !== undefined) return ask; // buy at ask
          if (bid !== undefined) return bid; // approx
          const p = toNumber(t.price ?? t.last_price ?? t.last);
          return p;
        };

        const y = extractMid(yesToken);
        const n = extractMid(noToken);
        if (y !== undefined) yesPriceCents = toCents(y);
        if (n !== undefined) noPriceCents = toCents(n);
        if (yesPriceCents !== undefined && noPriceCents === undefined) {
          noPriceCents = 100 - yesPriceCents;
        } else if (noPriceCents !== undefined && yesPriceCents === undefined) {
          yesPriceCents = 100 - noPriceCents;
        }

        // Fallbacks to original payload if simplified not available
        const outcomesArr = Array.isArray(market.outcomes) ? market.outcomes : undefined;
        const yesOutcome = outcomesArr?.find((o: any) => (typeof o === 'string' ? o : (o.name || o.ticker || '')).toString().toLowerCase() === 'yes');
        const noOutcome = outcomesArr?.find((o: any) => (typeof o === 'string' ? o : (o.name || o.ticker || '')).toString().toLowerCase() === 'no');

        // Try to get prices from various sources in the market data
        const rawYes = yesOutcome?.price ?? market.yesPrice ?? market.lastTradePrice ?? market.price ?? market.best_buy_yes_cost ?? market.best_bid_yes ?? market.best_bid?.yes ?? market.best_bid?.YES;
        const rawNo  = noOutcome?.price  ?? market.noPrice  ?? market.best_buy_no_cost  ?? market.best_bid_no  ?? market.best_bid?.no  ?? market.best_bid?.NO;

        // Use the prices from simplified markets if available, otherwise from gamma API
        let finalYes = yesPriceCents ?? toCents(rawYes);
        let finalNo  = noPriceCents  ?? toCents(rawNo);
        
        // If we still don't have good prices, try to extract from the market outcomes
        if (finalYes === 50 && finalNo === 50 && market.outcomePrices) {
          const prices = market.outcomePrices;
          if (Array.isArray(prices) && prices.length >= 2) {
            finalYes = toCents(prices[0]);
            finalNo = toCents(prices[1]);
          }
        }

        const liq = toNumber(market.liquidity || market.liquidity_usd) ?? 0;
        const vol = toNumber(market.volume_usd || market.volume) ?? 0;
        const end = market.end_date_iso || market.end_date || market.endDate;

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
