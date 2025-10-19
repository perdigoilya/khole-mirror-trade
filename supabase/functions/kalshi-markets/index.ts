import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'public, s-maxage=45, stale-while-revalidate=90',
};

// In-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 45000; // 45 seconds

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse JSON body (may be empty)
    let body: any = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }
    const includeParlays = !!body.includeParlays;
    const diagnostics = !!body.diagnostics;
    
    // Generate cache key
    const cacheKey = `kalshi-${includeParlays}`;
    const cached = cache.get(cacheKey);
    
    // Return cached data if fresh
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('[PUBLIC] Returning cached Kalshi data');
      return new Response(
        JSON.stringify(cached.data),
        { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } }
      );
    }

    console.log('[PUBLIC] Fetching Kalshi market data from public API - no authentication required');

    // Use public unauthenticated endpoint for market data
    // Fetch more markets per batch to find single-leg ones (Kalshi max is 1000)
    const limit = 1000;
    const path = `/trade-api/v2/markets?status=open&limit=${limit}`;
    
    // Try production endpoints (public data doesn't require authentication)
    const baseUrls = [
      'https://api.elections.kalshi.com',
      'https://api.kalshi.com'
    ];

    let marketData = null;
    let lastError = '';

    // Retry logic with exponential backoff
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    for (const base of baseUrls) {
      const url = `${base}${path}`;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[PUBLIC] Attempt ${attempt}/${maxRetries} - Trying endpoint: ${url}`);
          
          const response = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(10000), // 10 second timeout
          });

          if (response.ok) {
            marketData = await response.json();
    console.log(`[PUBLIC] Successfully fetched ${marketData.markets?.length || 0} public markets from ${base}`);
    
    // Debug: Check first few markets for volume data
    if (marketData.markets?.length > 0) {
      const sample = marketData.markets.slice(0, 3);
      console.log(`[PUBLIC] Sample volume data:`, sample.map((m: any) => ({
        ticker: m.ticker,
        volume_24h_dollars: m.volume_24h_dollars,
        volume_dollars: m.volume_dollars,
        volume_24h: m.volume_24h,
        volume: m.volume
      })));
    }
            break;
          } else {
            lastError = await response.text();
            console.log(`[PUBLIC] Failed ${base} (attempt ${attempt}):`, response.status, lastError);
          }
        } catch (fetchError) {
          lastError = fetchError instanceof Error ? fetchError.message : String(fetchError);
          console.error(`[PUBLIC] Network error on ${base} (attempt ${attempt}):`, lastError);
          
          // Wait before retry (exponential backoff)
          if (attempt < maxRetries) {
            const delay = retryDelay * Math.pow(2, attempt - 1);
            console.log(`[PUBLIC] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      if (marketData) break;
    }

    if (!marketData) {
      console.error('[PUBLIC] All Kalshi public API attempts failed:', lastError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch markets from Kalshi public API.', details: lastError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const marketsRaw: any[] = Array.isArray(marketData.markets) ? marketData.markets : [];

    // Diagnostics summary
    const hasCommaCount = marketsRaw.filter((m: any) => ((m.title || '').toString().includes(','))).length;
    const multiFlagCount = marketsRaw.filter((m: any) => /MULTIGAME|PARLAY|BUNDLE/i.test(m.ticker || '') || /MULTIGAME|PARLAY|BUNDLE/i.test(m.event_ticker || '')).length;
    const singleGameFlagCount = marketsRaw.filter((m: any) => /SINGLEGAME/i.test(m.ticker || '') || /SINGLEGAME/i.test(m.event_ticker || '')).length;
    const noCommaNoFlagCount = marketsRaw.filter((m: any) => !((m.title || '').toString().includes(',')) && !(/MULTIGAME|PARLAY|BUNDLE/i.test(m.ticker || '') || /MULTIGAME|PARLAY|BUNDLE/i.test(m.event_ticker || ''))).length;
    console.log(`[PUBLIC][diag] total=${marketsRaw.length} hasComma=${hasCommaCount} multiFlags=${multiFlagCount} singleGameFlag=${singleGameFlagCount} noCommaNoFlag=${noCommaNoFlagCount}`);

    // Filter out parlay markets - only show single-leg markets
    const isParlay = (m: any): boolean => {
      const ticker: string = m.ticker || '';
      const eventTicker: string = m.event_ticker || '';
      const title: string = (m.title || '').toString();
      
      // Check for explicit parlay/bundle flags in ticker
      const multiFlag = /MULTIGAME|PARLAY|BUNDLE/i.test(ticker) || /MULTIGAME|PARLAY|BUNDLE/i.test(eventTicker);
      if (multiFlag) return true;
      
      // More sophisticated comma check - look for parlay patterns like "X and Y" or "X, Y, and Z"
      // Exclude markets that are just using commas for normal punctuation
      const parlayPattern = /,\s*(and|&)\s*[A-Z]/;  // "Team A, and Team B"
      const multipleOutcomePattern = /,\s*[A-Z][^,]+,/;  // "X, Y, and Z" with multiple commas
      const hasParlayCommas = parlayPattern.test(title) || multipleOutcomePattern.test(title);
      
      return hasParlayCommas;
    };

    const sourceList = includeParlays ? marketsRaw : marketsRaw.filter((market: any) => !isParlay(market));
    
    console.log(`[PUBLIC] Filtered to ${sourceList.length} single-leg markets (parlays ${includeParlays ? 'included' : 'removed'})`);
    
    // Normalize Kalshi markets to match our Market interface
    const normalizedMarkets = (sourceList.map((market: any) => {
      // Helpers to convert price from number or *_dollars string to integer cents
      const toCents = (num: unknown, dollars: unknown): number | null => {
        if (typeof num === 'number' && !isNaN(num)) return Math.round(num);
        if (typeof dollars === 'string') {
          const f = parseFloat(dollars);
          if (!isNaN(f)) return Math.round(f * 100);
        }
        return null;
      };

      const lastPrice = toCents(market.last_price, market.last_price_dollars);
      const yesAsk = toCents(market.yes_ask, market.yes_ask_dollars);
      const yesBid = toCents(market.yes_bid, market.yes_bid_dollars);
      const noAsk  = toCents(market.no_ask, market.no_ask_dollars);
      const noBid  = toCents(market.no_bid, market.no_bid_dollars);

      // Calculate yes and no prices with sensible fallbacks
      let yesPrice = lastPrice;
      if (yesPrice === null && yesAsk !== null && yesBid !== null) yesPrice = Math.round((yesAsk + yesBid) / 2);
      if (yesPrice === null && yesAsk !== null) yesPrice = yesAsk;
      if (yesPrice === null && yesBid !== null) yesPrice = yesBid;

      let noPrice: number | null = yesPrice !== null ? (100 - yesPrice) : null;
      if (noPrice === null && noAsk !== null && noBid !== null) noPrice = Math.round((noAsk + noBid) / 2);
      if (noPrice === null && noAsk !== null) noPrice = noAsk;
      if (noPrice === null && noBid !== null) noPrice = noBid;

      // Default to 50/50 if no pricing data
      if (yesPrice === null) yesPrice = 50;
      if (noPrice === null) noPrice = 50;

      // Parse dollar volume with fallbacks
      let volumeDollars = 0;
      
      // Try 24h dollar volume first
      const vol24hDollarStr = market.volume_24h_dollars || null;
      if (typeof vol24hDollarStr === 'string') {
        const parsed = parseFloat(vol24hDollarStr);
        if (!isNaN(parsed)) volumeDollars = parsed;
      } else if (typeof vol24hDollarStr === 'number' && !isNaN(vol24hDollarStr)) {
        volumeDollars = vol24hDollarStr;
      }
      
      // Fallback to lifetime volume_dollars if no 24h volume
      if (volumeDollars === 0) {
        const volDollarStr = market.volume_dollars || null;
        if (typeof volDollarStr === 'string') {
          const parsed = parseFloat(volDollarStr);
          if (!isNaN(parsed)) volumeDollars = parsed;
        } else if (typeof volDollarStr === 'number' && !isNaN(volDollarStr)) {
          volumeDollars = volDollarStr;
        }
      }
      
      const liquidityDollars = market.liquidity_dollars ? parseFloat(market.liquidity_dollars) : 0;

      // Use dollar volume for raw value
      const volumeRaw = volumeDollars;

      // Map category to image (will be resolved in frontend)
      const category = market.category || 'General';

      return {
        id: market.ticker,
        title: market.title || market.ticker,
        subtitle: market.subtitle,
        description: market.subtitle || market.title || market.ticker,
        image: undefined, // Will be set in frontend based on category
        yesPrice,
        noPrice,
        volume: volumeDollars > 0 ? `$${Math.round(volumeDollars).toLocaleString('en-US')}` : '$0',
        liquidity: liquidityDollars > 0 ? `$${liquidityDollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
        volumeRaw,
        liquidityRaw: liquidityDollars,
        endDate: market.close_time || market.expiration_time || new Date().toISOString(),
        status: (market.status || '').toLowerCase() === 'open' ? 'Active' : (market.status || 'open'),
        category,
        provider: 'kalshi' as const,
        ticker: market.ticker,
        eventTicker: market.event_ticker,
        clobTokenId: market.ticker,
        isMultiOutcome: false,
      };
    }) || []);
    
    // Filter out markets with low liquidity only (keep markets even with zero volume)
    const MIN_LIQUIDITY = 0;
    const activeMarkets = normalizedMarkets.filter((m: any) => 
      (m.liquidityRaw || 0) >= MIN_LIQUIDITY
    );
    
    // Sort by dollar volume (highest first), then by liquidity
    const sortedMarkets = activeMarkets.sort((a: any, b: any) => 
      (b.volumeRaw || 0) - (a.volumeRaw || 0) || (b.liquidityRaw || 0) - (a.liquidityRaw || 0)
    );
    
    // Debug: Log top markets by volume
    if (sortedMarkets.length > 0) {
      console.log(`[PUBLIC] Top 5 markets by volume:`, sortedMarkets.slice(0, 5).map((m: any) => ({
        ticker: m.ticker,
        title: m.title?.substring(0, 50),
        volume: m.volume,
        volumeRaw: m.volumeRaw,
        liquidity: m.liquidity
      })));
    }
    
    console.log(`[PUBLIC] Filtered to ${sortedMarkets.length} active markets (liquidity >= $${MIN_LIQUIDITY})`);
    
    const responseData = { 
      markets: sortedMarkets,
      cursor: marketData.cursor 
    };
    
    // Cache the response
    cache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    
    // Limit cache size
    if (cache.size > 50) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    
    return new Response(
      JSON.stringify(responseData),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', "X-Cache": "MISS" } }
    );
  } catch (error) {
    console.error('[PUBLIC] Markets fetch error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
