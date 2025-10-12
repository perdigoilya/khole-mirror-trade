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

    // Map UI timeRange to CLOB params
    const intervalMap: Record<string, string> = {
      '1H': '1h',
      '6H': '6h',
      '1D': '1d',
      '1W': '1w',
      'ALL': 'max',
    };

    const now = Math.floor(Date.now() / 1000);

    // Determine token id (CLOB token ID). If a condition id was passed, map via simplified-markets
    let tokenId = marketId as string;

    const isDecimalId = /^[0-9]+$/.test(tokenId);
    if (!isDecimalId) {
      try {
        // Resolve condition_id -> CLOB token id by paginating simplified-markets
        let cursor = "";
        let foundTokenId: string | null = null;
        let safety = 0;

        while (safety < 50) {
          const url = cursor
            ? `https://clob.polymarket.com/simplified-markets?next_cursor=${encodeURIComponent(cursor)}`
            : 'https://clob.polymarket.com/simplified-markets';
          const simpRes = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'User-Agent': 'LovableCloud/1.0 (+https://lovable.dev)' },
          });
          if (!simpRes.ok) {
            console.warn('Simplified markets page fetch failed:', simpRes.status);
            break;
          }
          const simpPayload = await simpRes.json();
          const markets: any[] = Array.isArray(simpPayload) ? simpPayload : (simpPayload?.data || []);
          const match = markets.find((m: any) => {
            const cid = (m.condition_id || m.conditionId || '').toLowerCase();
            return cid === tokenId.toLowerCase();
          });
          if (match && Array.isArray(match.tokens) && match.tokens.length > 0) {
            // Pick token with highest volume or first as fallback
            const pick = match.tokens.reduce((best: any, t: any) => {
              const vBest = Number(best?.volume ?? best?.volume_24hr ?? 0) || 0;
              const v = Number(t?.volume ?? t?.volume_24hr ?? 0) || 0;
              return v > vBest ? t : best;
            }, match.tokens[0]);
            foundTokenId = String(pick.token_id || pick.tokenId || pick.id);
            break;
          }
          const next = (simpPayload?.next_cursor ?? simpPayload?.nextCursor ?? '');
          if (!next || next === 'LTE=') {
            break;
          }
          cursor = next;
          safety++;
        }

        if (foundTokenId) {
          tokenId = foundTokenId;
        } else {
          // Fallback: use Gamma API to resolve CLOB token IDs for the market
          const gammaRes = await fetch(`https://gamma-api.polymarket.com/markets/${tokenId}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'User-Agent': 'LovableCloud/1.0 (+https://lovable.dev)' },
          });
          if (gammaRes.ok) {
            const mkt = await gammaRes.json();
            const ids = Array.isArray(mkt?.clobTokenIds)
              ? mkt.clobTokenIds
              : (typeof mkt?.clobTokenIds === 'string' ? mkt.clobTokenIds.split(',') : []);
            if (ids.length > 0) {
              tokenId = String(ids[0]).trim();
            } else if (Array.isArray(mkt?.tokens) && mkt.tokens.length > 0) {
              tokenId = String(mkt.tokens[0]?.clobTokenId || mkt.tokens[0]?.token_id || mkt.tokens[0]?.id);
            } else {
              console.warn('No token ids on gamma market response, returning empty history');
              return new Response(
                JSON.stringify({ data: [], message: 'No price history available' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } else {
            console.warn('Gamma market lookup failed:', gammaRes.status);
            return new Response(
              JSON.stringify({ data: [], message: 'No price history available' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      } catch (e) {
        console.warn('Error resolving token id from condition id:', e);
        return new Response(
          JSON.stringify({ data: [], message: 'No price history available' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`Fetching price history for token ${tokenId}, range: ${timeRange}`);

    // Build query
    const params = new URLSearchParams();
    params.set('market', tokenId);

    if (timeRange === '1M') {
      const startTs = now - 30 * 24 * 60 * 60;
      params.set('startTs', String(startTs));
      params.set('endTs', String(now));
      params.set('fidelity', '60'); // 60 minutes
    } else {
      const interval = intervalMap[timeRange] || '1d';
      params.set('interval', interval);
      // Optional fidelity for shorter ranges
      if (interval === '1h' || interval === '6h') params.set('fidelity', '1');
      if (interval === '1d' || interval === '1w' || interval === 'max') params.set('fidelity', '60');
    }

    // Fetch from Polymarket CLOB price history API
    const url = `https://clob.polymarket.com/prices-history?${params.toString()}`;
    
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
