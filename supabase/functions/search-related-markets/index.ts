import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-memory cache for Polymarket data
let eventsCache: { data: any[], timestamp: number } | null = null;
let simplifiedCache: { data: any[], timestamp: number } | null = null;
const CACHE_DURATION = 120000; // 2 minutes

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, provider = 'polymarket' } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Tweet text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Searching for markets related to: "${text}" on ${provider}`);

    // Extract keywords from tweet (simple implementation)
    const keywords = extractKeywords(text);
    console.log("Extracted keywords:", keywords);

    // Search both platforms
    const [polymarketMarkets, kalshiMarkets] = await Promise.all([
      searchPolymarketEvents(keywords),
      searchKalshiEvents(keywords)
    ]);

    // Combine and sort by volume
    const allMarkets = [...polymarketMarkets, ...kalshiMarkets]
      .sort((a, b) => b.volumeRaw - a.volumeRaw)
      .slice(0, 10);

    return new Response(
      JSON.stringify({ markets: allMarkets, keywords }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error searching markets:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to search markets" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractKeywords(text: string): string[] {
  // Remove URLs, mentions, hashtags special chars
  const cleanText = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\w+/g, "")
    .replace(/#/g, "")
    .toLowerCase();

  // Split into words and filter common words
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "should", "could", "may", "might", "can", "this", "that",
    "these", "those", "i", "you", "he", "she", "it", "we", "they"
  ]);

  const words = cleanText
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));

  // Return unique keywords (top 5)
  return [...new Set(words)].slice(0, 5);
}

async function searchKalshiEvents(keywords: string[]): Promise<any[]> {
  try {
    console.log("Searching Kalshi events with keywords:", keywords);
    
    const baseUrls = [
      'https://api.elections.kalshi.com',
      'https://api.kalshi.com'
    ];

    let events: any[] = [];
    
    // Try to fetch from Kalshi API
    for (const base of baseUrls) {
      try {
        const url = `${base}/trade-api/v2/events?status=open&limit=100&with_nested_markets=true`;
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          events = data.events || [];
          console.log(`Fetched ${events.length} Kalshi events from ${base}`);
          break;
        }
      } catch (e) {
        console.log(`Failed to fetch from ${base}:`, e);
      }
    }

    if (events.length === 0) {
      console.log('No Kalshi events fetched');
      return [];
    }

    // Filter and format events based on keywords
    const relevantMarkets: any[] = [];
    
    for (const event of events) {
      const eventText = `${event.title || ''} ${event.subtitle || ''} ${event.category || ''}`.toLowerCase();
      const hasMatch = keywords.some(keyword => eventText.includes(keyword.toLowerCase()));
      
      if (hasMatch && event.markets && event.markets.length > 0) {
        const market = event.markets[0]; // Use first market as representative
        
        const toCents = (num: any, dollars: any) => {
          if (typeof num === 'number' && !isNaN(num)) return Math.round(num);
          if (typeof dollars === 'string') {
            const f = parseFloat(dollars);
            if (!isNaN(f)) return Math.round(f * 100);
          }
          return 50;
        };

        const yesPrice = toCents(market.yes_bid, market.yes_bid_dollars) || toCents(market.last_price, market.last_price_dollars) || 50;
        const noPrice = toCents(market.no_bid, market.no_bid_dollars) || (100 - yesPrice);
        
        const vol = parseFloat(market.volume || event.volume || 0);
        const liq = parseFloat(market.open_interest || event.open_interest || 0);
        
        const marketData = {
          id: market.ticker,
          title: market.title || event.title || 'Unknown Market',
          description: event.subtitle || market.subtitle || '',
          yesPrice,
          noPrice,
          volume: vol > 1_000_000 ? `${(vol / 1_000_000).toFixed(1)}M contracts` : vol > 1_000 ? `${(vol / 1_000).toFixed(0)}K contracts` : `${vol.toFixed(0)} contracts`,
          liquidity: liq > 1_000_000 ? `$${(liq / 1_000_000).toFixed(1)}M` : liq > 1_000 ? `$${(liq / 1_000).toFixed(0)}K` : `$${liq.toFixed(0)}`,
          endDate: event.close_time || market.close_time || market.expiration_time || 'TBD',
          status: event.status === 'open' ? 'Active' : 'Closed',
          category: event.category || 'Other',
          provider: 'kalshi',
          volumeRaw: vol,
          liquidityRaw: liq,
          clobTokenId: market.ticker,
          ticker: market.ticker,
          image: event.series_image || null,
        };
        
        console.log(`Adding Kalshi market: ${marketData.title.substring(0, 50)}...`);
        relevantMarkets.push(marketData);
      }
      
      if (relevantMarkets.length >= 5) break; // Limit Kalshi results
    }

    console.log(`Found ${relevantMarkets.length} relevant Kalshi markets`);
    return relevantMarkets;
  } catch (error) {
    console.error("Error fetching from Kalshi:", error);
    return [];
  }
}

async function searchPolymarketEvents(keywords: string[]): Promise<any[]> {
  try {
    console.log("Searching Polymarket events with keywords:", keywords);
    
    const now = Date.now();
    let events: any[] = [];
    let simplified: any[] = [];
    
    // Check cache for events
    if (eventsCache && (now - eventsCache.timestamp) < CACHE_DURATION) {
      events = eventsCache.data;
      console.log(`Using cached ${events.length} events (age: ${Math.round((now - eventsCache.timestamp) / 1000)}s)`);
    } else {
      // Fetch events from Gamma API
      const eventsResponse = await fetch("https://gamma-api.polymarket.com/events?closed=false&limit=100", {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "LovableCloud/1.0 (+https://lovable.dev)",
        },
      });

      if (!eventsResponse.ok) {
        console.error("Polymarket Events API error:", eventsResponse.status);
        return [];
      }

      const eventsData = await eventsResponse.json();
      events = Array.isArray(eventsData) ? eventsData : [];
      eventsCache = { data: events, timestamp: now };
      console.log(`Fetched ${events.length} events from Polymarket`);
    }

    // Check cache for simplified markets
    if (simplifiedCache && (now - simplifiedCache.timestamp) < CACHE_DURATION) {
      simplified = simplifiedCache.data;
      console.log(`Using cached ${simplified.length} simplified markets (age: ${Math.round((now - simplifiedCache.timestamp) / 1000)}s)`);
    } else {
      // Fetch simplified markets for pricing
      const simplifiedRes = await fetch("https://clob.polymarket.com/simplified-markets", {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "LovableCloud/1.0 (+https://lovable.dev)",
        },
      });
      
      const simplifiedData = simplifiedRes.ok ? await simplifiedRes.json() : [];
      simplified = Array.isArray(simplifiedData) ? simplifiedData : [];
      simplifiedCache = { data: simplified, timestamp: now };
      console.log(`Fetched ${simplified.length} simplified markets`);
    }
    
    const byConditionId = new Map();
    for (const m of simplified) {
      const cid = m.condition_id || m.conditionId;
      if (cid) byConditionId.set(cid, m);
    }

    // Filter and format events based on keywords
    const relevantMarkets: any[] = [];
    
    for (const event of events) {
      const eventText = `${event.title || ''} ${event.description || ''}`.toLowerCase();
      const hasMatch = keywords.some(keyword => eventText.includes(keyword.toLowerCase()));
      
      if (hasMatch) {
        const markets = Array.isArray(event.markets) ? event.markets : [];
        const mainMarket = markets[0];
        
        if (mainMarket) {
          const cid = mainMarket.conditionId || mainMarket.condition_id;
          const simp = cid ? byConditionId.get(cid) : undefined;
          const tokens = Array.isArray(simp?.tokens) ? simp.tokens : [];
          
          // Extract pricing - identify YES/NO tokens explicitly
          let yesPrice = 50;
          let noPrice = 50;
          
          const toNumber = (v: any) => {
            if (v === null || v === undefined) return undefined;
            const n = typeof v === 'string' ? parseFloat(v) : v;
            return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
          };
          
          const extractMid = (t: any) => {
            if (!t) return undefined;
            const bid = toNumber(t.bid ?? t.best_bid ?? t.bestBid ?? t.bbo?.BUY ?? t.bbo?.buy ?? t.prices?.buy ?? t.prices?.BUY ?? t.buy);
            const ask = toNumber(t.ask ?? t.best_ask ?? t.bestAsk ?? t.bbo?.SELL ?? t.bbo?.sell ?? t.prices?.sell ?? t.prices?.SELL ?? t.sell);
            if (bid !== undefined && ask !== undefined) return (bid + ask) / 2;
            if (ask !== undefined) return ask;
            if (bid !== undefined) return bid;
            const p = toNumber(t.price ?? t.last_price ?? t.lastPrice ?? t.last_trade_price ?? t.lastTradePrice ?? t.last);
            return p;
          };
          
          const toCents = (v: any) => {
            const n = toNumber(v);
            if (n === undefined) return undefined;
            return n <= 1 ? Math.round(n * 100) : Math.round(n);
          };
          
          if (tokens.length >= 1) {
            // Try to identify YES/NO tokens explicitly
            const toLower = (v: any) => String(v ?? '').toLowerCase();
            const labelOf = (t: any) => toLower(t?.outcome ?? t?.label ?? t?.name ?? t?.ticker ?? t?.symbol ?? '');
            
            const yesToken = tokens.find((t: any) => labelOf(t) === 'yes' || labelOf(t).includes('yes'));
            const noToken = tokens.find((t: any) => labelOf(t) === 'no' || labelOf(t).includes('no')) || (tokens.length === 2 ? tokens.find((t: any) => t !== yesToken) : undefined);
            
            const yesPrice_raw = toCents(extractMid(yesToken || tokens[0]));
            const noPrice_raw = toCents(extractMid(noToken));
            
            if (yesPrice_raw !== undefined) yesPrice = yesPrice_raw;
            if (noPrice_raw !== undefined) {
              noPrice = noPrice_raw;
            } else if (tokens.length <= 2 && yesPrice !== undefined) {
              noPrice = 100 - yesPrice;
            }
          }
          
          const vol = parseFloat(event.volume || mainMarket.volume_usd || mainMarket.volume || 0);
          const liq = parseFloat(event.liquidity || mainMarket.liquidity || 0);
          
          // Get CLOB token ID for charts - try multiple sources
          let clobTokenId = '';
          
          // First, try to get from the main market directly
          clobTokenId = mainMarket.clobTokenIds?.[0] || mainMarket.clob_token_ids?.[0] || '';
          
          // If not found, try from tokens array - prioritize YES token for binary markets
          if (!clobTokenId && tokens.length > 0) {
            // Look for YES token first
            let yesToken = tokens.find((t: any) => {
              const outcome = String(t?.outcome ?? t?.label ?? t?.name ?? '').toLowerCase();
              return outcome === 'yes' || outcome.includes('yes');
            });
            
            // If no YES token found, use first token
            const targetToken = yesToken || tokens[0];
            
            // Extract token ID from various possible field names
            clobTokenId = String(
              targetToken?.token_id || 
              targetToken?.tokenId || 
              targetToken?.id || 
              ''
            );
            
            console.log(`Extracted token ID from tokens array: ${clobTokenId}`);
          }
          
          // If still no token ID, try from simplified market data
          if (!clobTokenId && simp) {
            const simpTokens = Array.isArray(simp.tokens) ? simp.tokens : [];
            if (simpTokens.length > 0) {
              const yesToken = simpTokens.find((t: any) => 
                String(t?.outcome ?? '').toLowerCase() === 'yes'
              ) || simpTokens[0];
              clobTokenId = String(yesToken?.token_id || yesToken?.tokenId || '');
              console.log(`Extracted token ID from simplified market: ${clobTokenId}`);
            }
          }
          
          // Fallback: use condition ID (will be resolved by price-history function)
          if (!clobTokenId && cid) {
            clobTokenId = cid;
            console.log(`Using condition ID as fallback: ${clobTokenId}`);
          }
          
          // Only add markets with valid condition IDs and token IDs for pricing
          if (cid && clobTokenId) {
            const marketData = {
              id: cid,
              title: event.title || mainMarket.question || mainMarket.title || 'Unknown Market',
              description: event.description || mainMarket.description || '',
              yesPrice,
              noPrice,
              volume: vol > 1_000_000 ? `$${(vol / 1_000_000).toFixed(1)}M` : vol > 1_000 ? `$${(vol / 1_000).toFixed(0)}K` : `$${vol.toFixed(0)}`,
              liquidity: liq > 1_000_000 ? `$${(liq / 1_000_000).toFixed(1)}M` : liq > 1_000 ? `$${(liq / 1_000).toFixed(0)}K` : `$${liq.toFixed(0)}`,
              endDate: event.end_date_iso || event.end_date || mainMarket.end_date_iso || mainMarket.end_date || 'TBD',
              status: event.active === false || event.closed === true ? 'Closed' : 'Active',
              category: event.category || 'Other',
              provider: 'polymarket',
              volumeRaw: vol,
              liquidityRaw: liq,
              clobTokenId: clobTokenId,
              image: event.image || event.icon || mainMarket.image,
            };
            
            console.log(`Adding market: ${marketData.title.substring(0, 50)}... with tokenId: ${clobTokenId}`);
            relevantMarkets.push(marketData);
          } else {
            console.warn(`Skipping market "${event.title}" - missing ${!cid ? 'condition ID' : 'token ID'}`);
          }
        }
      }
      
      if (relevantMarkets.length >= 10) break;
    }

    console.log(`Found ${relevantMarkets.length} relevant markets`);
    return relevantMarkets;
  } catch (error) {
    console.error("Error fetching from Polymarket:", error);
    return [];
  }
}
