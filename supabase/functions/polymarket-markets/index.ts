import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

// In-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60000; // 1 minute

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { searchTerm, offset = 0, marketId } = await req.json().catch(() => ({}));
    
    // Generate cache key
    const cacheKey = `${marketId || 'all'}-${searchTerm || ''}-${offset}`;
    const cached = cache.get(cacheKey);
    
    // Return cached data if fresh
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('Returning cached Polymarket data');
      return new Response(
        JSON.stringify(cached.data),
        { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } }
      );
    }

    console.log("Fetching Polymarket events...", searchTerm ? `Searching for: ${searchTerm}` : "", marketId ? `Market ID: ${marketId}` : "", `Offset: ${offset}`);

    // When fetching a specific market, remove the closed filter and increase limit
    const closedFilter = marketId ? '' : 'closed=false&';
    const limitParam = marketId ? 1000 : 100;
    
    // Fetch active events from Polymarket Gamma API - events contain grouped markets
    const response = await fetch(`https://gamma-api.polymarket.com/events?${closedFilter}limit=${limitParam}&offset=${offset}&order=volume24hr&ascending=false`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "LovableCloud/1.0 (+https://lovable.dev)",
      },
    });

    console.log("Polymarket API response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text().catch(() => undefined);
      console.error("Polymarket API error:", response.status, errorText?.slice?.(0, 500));

      // Fallback: if a specific marketId was requested, try to serve minimal data
      // using the CLOB simplified markets so the page can still load.
      if (marketId) {
        try {
          const simpRes = await fetch("https://clob.polymarket.com/simplified-markets", {
            method: "GET",
            headers: { "Accept": "application/json", "User-Agent": "LovableCloud/1.0 (+https://lovable.dev)" },
          });
          if (simpRes.ok) {
            const simpPayload = await simpRes.json();
            const simpList: any[] = Array.isArray(simpPayload)
              ? simpPayload
              : (simpPayload?.data || simpPayload?.markets || []);

            const cidLower = String(marketId).toLowerCase();
            const simp = simpList.find((m: any) => String(m.condition_id || m.conditionId || '').toLowerCase() === cidLower);

            if (simp) {
              const tokens: any[] = Array.isArray(simp.tokens) ? simp.tokens : [];
              // Pick a token (highest volume if possible)
              const toNumber = (v: any) => {
                if (v === null || v === undefined) return undefined;
                const n = typeof v === 'string' ? parseFloat(v) : v;
                return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
              };
              const pick = tokens.reduce((max: any, t: any) => {
                const maxVol = toNumber(max?.volume ?? max?.volume_24hr ?? 0) ?? 0;
                const tVol = toNumber(t?.volume ?? t?.volume_24hr ?? 0) ?? 0;
                return tVol > maxVol ? t : max;
              }, tokens[0]);
              const bid = toNumber(pick?.best_bid ?? pick?.bbo?.BUY ?? pick?.prices?.BUY ?? pick?.buy);
              const ask = toNumber(pick?.best_ask ?? pick?.bbo?.SELL ?? pick?.prices?.SELL ?? pick?.sell);
              let yes = 50;
              if (bid !== undefined && ask !== undefined) {
                const mid = (bid + ask) / 2;
                yes = Math.round(mid <= 1 ? mid * 100 : mid);
              }

              const minimal = {
                id: String(marketId),
                title: simp.title || simp.question || 'Market',
                description: simp.description || '',
                image: simp.image || '',
                yesPrice: yes,
                noPrice: 100 - yes,
                volume: '$0',
                liquidity: '$0',
                endDate: 'TBD',
                status: 'Active',
                category: simp.category || 'Other',
                provider: 'polymarket',
                volumeRaw: 0,
                liquidityRaw: 0,
                clobTokenId: String(pick?.token_id ?? pick?.tokenId ?? pick?.id ?? ''),
              };

              return new Response(
                JSON.stringify({ markets: [minimal] }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        } catch (e) {
          console.warn('Fallback via simplified-markets failed:', e);
        }
      }

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
      const tokenIdCandidate = (() => {
        let s = target;
        if (/^[0-9]+$/.test(s)) return s;
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed) && parsed.length) s = String(parsed[0]);
          else if (typeof parsed === 'string') s = parsed;
        } catch (_) {}
        if (/^[0-9]+$/.test(s)) return s;
        const match = s.match(/\d{6,}/);
        return match ? match[0] : undefined;
      })();
      events = events.filter((ev: any) => {
        const ms = Array.isArray(ev?.markets) ? ev.markets : [];
        return ms.some((m: any) => {
          const cid = String(m?.conditionId || m?.condition_id || '').toLowerCase();
          const mid = String(m?.id || '').toLowerCase();
          if (cid === target || mid === target) return true;
          // Also try to match by CLOB token id if present on the Gamma payload
          if (tokenIdCandidate) {
            const clobIds: string[] = Array.isArray(m?.clobTokenIds)
              ? m.clobTokenIds.map((x: any) => String(x))
              : (typeof m?.clobTokenIds === 'string'
                  ? String(m.clobTokenIds).split(',').map((s: string) => s.trim())
                  : []);
            if (clobIds.includes(String(tokenIdCandidate))) return true;
          }
          return false;
        });
      });
    }

    console.log("Fetched events count:", Array.isArray(events) ? events.length : 0);
    console.log("Sample event data:", String(JSON.stringify(events?.[0], null, 2) || '').slice(0, 1000));

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
    // Use Promise to allow for parallel processing
    const simplifiedPromise = fetch("https://clob.polymarket.com/simplified-markets", {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "LovableCloud/1.0 (+https://lovable.dev)",
      },
    }).then(async (res) => {
      if (res.ok) {
        const simpPayload = await res.json();
        return Array.isArray(simpPayload)
          ? simpPayload
          : (simpPayload?.data || simpPayload?.markets || []);
      }
      console.warn("Simplified markets fetch failed with status:", res.status);
      return [];
    }).catch(() => []);
    
    const simplified = await simplifiedPromise;
    console.log("Fetched simplified markets count:", simplified.length);

    const byConditionId = new Map<string, any>();
    for (const m of simplified) {
      const cid = m.condition_id || m.conditionId;
      if (cid) byConditionId.set(cid, m);
    }

    // If a specific marketId is requested but its simplified market is not in the first page,
    // paginate simplified-markets to find it so that we can price it accurately.
    if (marketId) {
      const targetLower = String(marketId).toLowerCase();
      const hasTarget = Array.from(byConditionId.keys()).some(k => String(k).toLowerCase() === targetLower);
      if (!hasTarget) {
        try {
          let nextCursor = '';
          let page = 0;
          const MAX_PAGES = 30;
          while (page < MAX_PAGES) {
            const url = `https://clob.polymarket.com/simplified-markets${nextCursor ? `?next_cursor=${encodeURIComponent(nextCursor)}` : ''}`;
            const simpRes2 = await fetch(url, {
              method: 'GET',
              headers: { 'Accept': 'application/json', 'User-Agent': 'LovableCloud/1.0 (+https://lovable.dev)' },
            });
            if (!simpRes2.ok) break;
            const simpPayload2 = await simpRes2.json();
            const simpList2: any[] = Array.isArray(simpPayload2)
              ? simpPayload2
              : (simpPayload2?.data || simpPayload2?.markets || []);

            const match = simpList2.find((m: any) => String(m.condition_id || m.conditionId || '').toLowerCase() === targetLower);
            if (match) {
              const cid = match.condition_id || match.conditionId;
              if (cid) byConditionId.set(cid, match);
              console.log('Resolved simplified market via pagination for target condition id');
              break;
            }

            nextCursor = (simpPayload2?.next_cursor ?? simpPayload2?.nextCursor ?? '') as string;
            if (!nextCursor || nextCursor === 'LTE=' || nextCursor === '-1') break;
            page += 1;
          }
        } catch (e) {
          console.warn('Failed paginated lookup for simplified market:', e);
        }
      }
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

    // Normalize/clean incoming token ids that may be stringified arrays
    const normalizeTokenId = (id: any): string | undefined => {
      if (id === null || id === undefined) return undefined;
      let s = String(id);
      // Already numeric
      if (/^[0-9]+$/.test(s)) return s;
      // Try JSON parsing
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length) {
          s = String(parsed[0]);
        } else if (typeof parsed === 'string') {
          s = parsed;
        }
        if (/^[0-9]+$/.test(s)) return s;
      } catch (_) {
        // ignore parse errors
      }
      // Extract first long run of digits
      const match = s.match(/\d{6,}/);
      return match ? match[0] : undefined;
    };

    // Helper to format a single market into our UI structure
    const formatMarket = (market: any, simp: any) => {
      const tokens = Array.isArray(simp?.tokens) ? simp.tokens : [];
      
      const extractMid = (t: any): number | undefined => {
        if (!t) return undefined;
        
        // Try to extract bid/ask from various possible field names in CLOB API
        const bid = toNumber(
          t.bid ?? t.best_bid ?? t.bestBid ?? 
          t.bbo?.BUY ?? t.bbo?.buy ?? 
          t.prices?.buy ?? t.prices?.BUY ?? 
          t.buy
        );
        const ask = toNumber(
          t.ask ?? t.best_ask ?? t.bestAsk ?? 
          t.bbo?.SELL ?? t.bbo?.sell ?? 
          t.prices?.sell ?? t.prices?.SELL ?? 
          t.sell
        );
        
        // Log what we found for debugging
        if (bid !== undefined || ask !== undefined) {
          console.log(`Token price data: bid=${bid}, ask=${ask}, outcome=${t.outcome}`);
        }
        
        if (bid !== undefined && ask !== undefined) return (bid + ask) / 2;
        if (ask !== undefined) return ask;
        if (bid !== undefined) return bid;
        
        // Try last trade price as fallback
        const p = toNumber(
          t.price ?? t.last_price ?? t.lastPrice ?? 
          t.last_trade_price ?? t.lastTradePrice ?? 
          t.last
        );
        if (p !== undefined) {
          console.log(`Using last trade price: ${p}, outcome=${t.outcome}`);
        }
        return p;
      };

      // Log token structure for debugging
      if (tokens.length > 0) {
        console.log(`Token structure sample for market ${market.question || market.title}:`, JSON.stringify(tokens[0], null, 2).slice(0, 500));
      }
      
      // Try to identify YES/NO tokens explicitly
      const toLower = (v: any) => String(v ?? '').toLowerCase();
      const labelOf = (t: any) => toLower(t?.outcome ?? t?.label ?? t?.name ?? t?.ticker ?? t?.symbol ?? '');

      const yesToken = tokens.find((t: any) => labelOf(t) === 'yes' || labelOf(t).includes('yes'));
      const noToken = tokens.find((t: any) => labelOf(t) === 'no' || labelOf(t).includes('no')) || (tokens.length === 2 ? tokens.find((t: any) => t !== yesToken) : undefined);

      // If we couldn't identify explicit YES/NO and there are many outcomes, fall back to highest-volume token for display
      let topToken = tokens[0];
      if (!yesToken && tokens.length > 2) {
        topToken = tokens.reduce((max: any, token: any) => {
          const maxVol = toNumber(max?.volume ?? max?.volume_24hr ?? 0) ?? 0;
          const tokenVol = toNumber(token?.volume ?? token?.volume_24hr ?? 0) ?? 0;
          return tokenVol > maxVol ? token : max;
        }, tokens[0]);
      }

      // Prices
      let finalYes = toCents(extractMid(yesToken || (tokens.length > 2 ? topToken : tokens[0])));
      let finalNo: number | undefined = toCents(extractMid(noToken));

      console.log(`Price extraction: yesTokenMid=${extractMid(yesToken)}, noTokenMid=${extractMid(noToken)}, fallbackTopMid=${extractMid(topToken)}`);

      // Fallback to market-level data if still missing
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

      // Extract CLOB token ids from simplified markets or fallback to Gamma
      let topClobId = '';
      
      if (simp && Array.isArray(simp.tokens) && simp.tokens.length > 0) {
        if (yesToken) {
          topClobId = String(yesToken?.token_id ?? yesToken?.tokenId ?? yesToken?.id ?? '');
        } else {
          // Prefer token with highest volume
          const bestToken = simp.tokens.reduce((max: any, token: any) => {
            const maxVol = toNumber(max?.volume ?? max?.volume_24hr ?? 0) ?? 0;
            const tokenVol = toNumber(token?.volume ?? token?.volume_24hr ?? 0) ?? 0;
            return tokenVol > maxVol ? token : max;
          }, simp.tokens[0]);
          topClobId = String(bestToken?.token_id ?? bestToken?.tokenId ?? bestToken?.id ?? '');
        }
      } else {
        // Fallback to Gamma data
        const clobIds: string[] = Array.isArray(market?.clobTokenIds)
          ? market.clobTokenIds
          : (typeof market?.clobTokenIds === 'string'
              ? String(market.clobTokenIds)
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean)
              : []);
        
        topClobId = String(
          (yesToken?.token_id ?? yesToken?.tokenId ?? yesToken?.id) ??
          (topToken?.token_id ?? topToken?.tokenId ?? topToken?.id) ??
          clobIds[0] ?? ''
        );
      }

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
            const formatted = formatMarket(m, msimp);
            
            // Ensure submarket has a proper CLOB token ID
            if (!formatted.clobTokenId && msimp && Array.isArray(msimp.tokens) && msimp.tokens.length > 0) {
              const token = msimp.tokens[0];
              formatted.clobTokenId = String(token?.token_id ?? token?.tokenId ?? token?.id ?? '');
            }
            
            return formatted;
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

    // If no events matched but a marketId was provided, try simplified fallback
    if (marketId && formattedMarkets.length === 0) {
      const target = String(marketId);
      let simp = byConditionId.get(target) as any | undefined;
      if (!simp) {
        const tLower = target.toLowerCase();
        simp = simplified.find((m: any) =>
          String(m.condition_id || m.conditionId || '').toLowerCase() === tLower
        );
      }
      // If still not found, try matching by CLOB token id extracted from the provided id
      let tokenIdCandidate: string | undefined;
      if (!simp) {
        tokenIdCandidate = normalizeTokenId(target);
        if (tokenIdCandidate) {
          simp = simplified.find((m: any) =>
            Array.isArray(m.tokens) && m.tokens.some((t: any) =>
              String(t.token_id ?? t.tokenId ?? t.id ?? '') === String(tokenIdCandidate)
            )
          );
        }
      }
      if (simp) {
        const fakeMarket = {
          conditionId: String(marketId),
          question: simp.title || simp.question || 'Market',
          description: simp.description || '',
          image: simp.image || '',
          liquidity_usd: 0,
          volume_usd: 0,
          end_date: undefined,
          active: simp.active ?? true,
          closed: false,
          is_resolved: false,
        };
        const formattedOne: any = formatMarket(fakeMarket, simp);
        // Ensure the clobTokenId matches the requested token when applicable
        if (tokenIdCandidate && String(formattedOne.clobTokenId || '') !== String(tokenIdCandidate)) {
          formattedOne.clobTokenId = String(tokenIdCandidate);
        }
        const eventLike = {
          ...formattedOne,
          subMarkets: [],
          isMultiOutcome: Array.isArray(simp.tokens) && simp.tokens.length > 2,
        };
        console.log('Returning 1 Polymarket event via simplified fallback');
        return new Response(
          JSON.stringify({ markets: [eventLike] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Returning ${formattedMarkets.length} Polymarket events`);

    const responseData = { markets: formattedMarkets };
    
    // Cache the response
    cache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    
    // Limit cache size
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } }
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
