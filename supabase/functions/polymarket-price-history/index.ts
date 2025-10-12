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

    // Normalize token id (handle cases like "123", ["123", "456"], or strings containing brackets)
    const normalizeTokenId = (input: any): string | null => {
      if (input === null || input === undefined) return null;
      let s = String(input).trim();
      // If it's a hex condition id like 0x..., do NOT try to extract digits
      if (/^0x[0-9a-fA-F]+$/.test(s)) return null;
      // Already numeric
      if (/^[0-9]+$/.test(s)) return s;
      // Try JSON parsing
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length) s = String(parsed[0]);
        else if (typeof parsed === 'string') s = parsed;
      } catch (_) {
        // ignore
      }
      if (/^[0-9]+$/.test(s)) return s;
      const match = s.match(/\d{6,}/);
      return match ? match[0] : null;
    };

    let tokenId = normalizeTokenId(marketId);
    // If a condition id (0x...) was provided, resolve to a token id via paginated simplified-markets
    if (!tokenId && typeof marketId === 'string' && /^0x[0-9a-fA-F]+$/.test(marketId)) {
      try {
        const target = String(marketId).toLowerCase();
        let nextCursor = '';
        let page = 0;
        const MAX_PAGES = 50; // safety cap
        const toNumber = (v: any) => {
          if (v === null || v === undefined) return 0;
          const n = typeof v === 'string' ? parseFloat(v) : v;
          return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
        };

        // First try: simplified-markets
        while (!tokenId && page < MAX_PAGES) {
          const url = `https://clob.polymarket.com/simplified-markets${nextCursor ? `?next_cursor=${encodeURIComponent(nextCursor)}` : ''}`;
          const simpRes = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'User-Agent': 'LovableCloud/1.0 (+https://lovable.dev)' },
          });
          if (!simpRes.ok) {
            console.warn('simplified-markets fetch failed with status', simpRes.status);
            break;
          }
          const simpPayload = await simpRes.json();
          const simpList: any[] = Array.isArray(simpPayload) ? simpPayload : (simpPayload?.data || simpPayload?.markets || []);

          const match = simpList.find((m: any) => String(m.condition_id || m.conditionId || '').toLowerCase() === target);
          if (match && Array.isArray(match.tokens) && match.tokens.length > 0) {
            // Pick token with highest volume if available
            const best = match.tokens.reduce((max: any, t: any) => {
              const maxVol = toNumber(max?.volume ?? max?.volume_24hr ?? 0);
              const tVol = toNumber(t?.volume ?? t?.volume_24hr ?? 0);
              return tVol > maxVol ? t : max;
            }, match.tokens[0]);
            tokenId = String(best?.token_id ?? best?.tokenId ?? best?.id ?? '');
            console.log('Resolved token id from simplified-markets:', tokenId);
            break;
          }

          // advance pagination
          nextCursor = (simpPayload?.next_cursor ?? simpPayload?.nextCursor ?? '') as string;
          if (!nextCursor || nextCursor === 'LTE=' || nextCursor === '-1') {
            break;
          }
          page += 1;
        }

        // Second try: full markets endpoint, prefer YES outcome
        if (!tokenId) {
          let next2 = '';
          let page2 = 0;
          while (!tokenId && page2 < MAX_PAGES) {
            const url2 = `https://clob.polymarket.com/markets${next2 ? `?next_cursor=${encodeURIComponent(next2)}` : ''}`;
            const mRes = await fetch(url2, {
              method: 'GET',
              headers: { 'Accept': 'application/json', 'User-Agent': 'LovableCloud/1.0 (+https://lovable.dev)' },
            });
            if (!mRes.ok) {
              console.warn('markets fetch failed with status', mRes.status);
              break;
            }
            const mPayload = await mRes.json();
            const mList: any[] = Array.isArray(mPayload) ? mPayload : (mPayload?.data || []);
            const m = mList.find((x: any) => String(x.condition_id || x.conditionId || '').toLowerCase() === target);
            if (m && Array.isArray(m.tokens) && m.tokens.length > 0) {
              const yes = m.tokens.find((t: any) => String(t.outcome || '').toLowerCase() === 'yes');
              const chosen = yes || m.tokens[0];
              tokenId = String(chosen?.token_id ?? chosen?.tokenId ?? chosen?.id ?? '');
              console.log('Resolved token id from markets endpoint:', tokenId);
              break;
            }
            next2 = (mPayload?.next_cursor ?? '') as string;
            if (!next2 || next2 === 'LTE=' || next2 === '-1') break;
            page2 += 1;
          }
        }
      } catch (e) {
        console.warn('Failed to resolve token id from condition id:', e);
      }
    }

    if (!tokenId) {
      console.warn('polymarket-price-history: could not resolve a valid token id. Returning empty history. id=', marketId);
      return new Response(
        JSON.stringify({ data: [], message: 'No price history available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
