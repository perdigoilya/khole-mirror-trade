import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[PUBLIC] Fetching Kalshi market data from public API - no authentication required');

    // Use public unauthenticated endpoint for market data
    // No API key required for public market data
    const path = "/trade-api/v2/markets?status=open&limit=200";
    
    // Try production endpoints (public data doesn't require authentication)
    const baseUrls = [
      'https://api.elections.kalshi.com',
      'https://api.kalshi.com'
    ];

    let marketData = null;
    let lastError = '';

    for (const base of baseUrls) {
      const url = `${base}${path}`;
      console.log('[PUBLIC] Trying public endpoint:', url);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        marketData = await response.json();
        console.log(`[PUBLIC] Successfully fetched ${marketData.markets?.length || 0} public markets from ${base}`);
        break;
      } else {
        lastError = await response.text();
        console.log(`[PUBLIC] Failed ${base}:`, response.status, lastError);
      }
    }

    if (!marketData) {
      console.error('[PUBLIC] All Kalshi public API attempts failed:', lastError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch markets from Kalshi public API.', details: lastError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Normalize Kalshi markets to match our Market interface
    const normalizedMarkets = (marketData.markets?.map((market: any) => {
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

      // Use 24h contract volume if available, else fall back to lifetime volume
      const volume24h = typeof market.volume_24h === 'number' ? market.volume_24h : (typeof market.volume === 'number' ? market.volume : 0);
      const liquidityDollars = market.liquidity_dollars ? parseFloat(market.liquidity_dollars) : 0;

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
        volume: volume24h > 0 ? `${volume24h.toLocaleString('en-US')} contracts` : '$0',
        liquidity: liquidityDollars > 0 ? `$${liquidityDollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
        volumeRaw: volume24h,
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
    
    // Sort by trending (volume_24h DESC) first
    const sortedMarkets = normalizedMarkets.sort((a: any, b: any) => b.volumeRaw - a.volumeRaw);
    
    // Group markets by event_ticker for multi-outcome events
    const eventGroups = new Map<string, any[]>();
    const standaloneMarkets: any[] = [];
    
    for (const market of sortedMarkets) {
      if (market.eventTicker) {
        if (!eventGroups.has(market.eventTicker)) {
          eventGroups.set(market.eventTicker, []);
        }
        eventGroups.get(market.eventTicker)!.push(market);
      } else {
        standaloneMarkets.push(market);
      }
    }
    
    // Convert event groups to multi-outcome markets ONLY if multiple markets per event
    const groupedMarkets: any[] = [];
    
    for (const [eventTicker, markets] of eventGroups.entries()) {
      if (markets.length > 1) {
        // TRUE multi-outcome event - multiple markets under same event
        const mainMarket = markets[0]; // Already sorted by volume
        const subMarkets = markets.slice(1);
        
        // Extract event name from title (remove "Will X" part if present)
        let eventTitle = mainMarket.title;
        const match = eventTitle.match(/^Will .+ (win|be|have|reach|exceed|get) (.+)\?/i);
        if (match) {
          eventTitle = match[2];
        }
        
        groupedMarkets.push({
          ...mainMarket,
          id: eventTicker,
          title: eventTitle,
          isMultiOutcome: true,
          subMarkets: subMarkets,
        });
      } else {
        // Single market - NOT multi-outcome
        groupedMarkets.push({ ...markets[0], isMultiOutcome: false });
      }
    }
    
    const finalMarkets = [...groupedMarkets, ...standaloneMarkets]
      .sort((a: any, b: any) => (b.volumeRaw || 0) - (a.volumeRaw || 0) || (b.liquidityRaw || 0) - (a.liquidityRaw || 0));
    
    console.log(`[PUBLIC] Returning ${finalMarkets.length} formatted markets`);
    
    return new Response(
      JSON.stringify({ 
        markets: finalMarkets,
        cursor: marketData.cursor 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[PUBLIC] Markets fetch error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
