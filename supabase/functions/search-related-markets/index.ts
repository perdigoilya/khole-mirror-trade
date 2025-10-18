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

    console.log(`Searching for markets semantically related to: "${text}"`);

    // Search both platforms
    const [polymarketMarkets, kalshiMarkets] = await Promise.all([
      searchPolymarketEvents(text),
      searchKalshiEvents(text)
    ]);

    // Combine all markets for AI ranking
    const allMarkets = [...polymarketMarkets, ...kalshiMarkets];
    
    if (allMarkets.length === 0) {
      return new Response(
        JSON.stringify({ markets: [], keywords: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use AI to rank markets by semantic relevance
    const rankedMarkets = await rankMarketsBySemantic(text, allMarkets);

    return new Response(
      JSON.stringify({ markets: rankedMarkets }),
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

async function rankMarketsBySemantic(tweetText: string, markets: any[]): Promise<any[]> {
  try {
    console.log(`Ranking ${markets.length} markets by semantic relevance to tweet`);
    
    // Prepare market summaries for AI analysis
    const marketSummaries = markets.map((m, idx) => ({
      index: idx,
      title: m.title,
      description: m.description || '',
      category: m.category
    }));

    // Use AI to score relevance with strict criteria
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: `You are analyzing prediction markets for STRICT relevance to a tweet/news item. Be VERY selective - most markets should score 0-3.

Tweet/News: "${tweetText}"

Markets to analyze:
${marketSummaries.map((m, i) => `${i}. ${m.title} - ${m.description.substring(0, 100)}`).join('\n')}

STRICT scoring criteria (0-10):
- 9-10: DIRECT match - market is specifically about the exact subject/person/event in the tweet
- 7-8: STRONG relation - market is about closely related concepts/consequences (e.g., Fed news → inflation markets, China policy → China-related markets)
- 5-6: MODERATE relation - same industry/domain but different topic (e.g., tech company news → different tech markets)
- 3-4: WEAK/TANGENTIAL - vaguely same category but different focus (e.g., US politics → unrelated US political markets)
- 0-2: NOT RELATED - different topic, industry, or geography

IMPORTANT RULES:
- If a tweet is about Person X, only markets directly about Person X should score 7+
- Entertainment/movie markets should NEVER score high for political/economic news
- Sports markets should NEVER score high for non-sports news
- Generic "2025" timing does NOT make markets related
- Markets must share specific subjects, not just broad categories

Return ONLY a JSON array of scores:
[{"index": 0, "score": 8}, {"index": 1, "score": 3}, ...]

Include ALL ${marketSummaries.length} markets. Be ruthless - most should be 0-3.`
        }],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!aiResponse.ok) {
      console.error('AI API error:', await aiResponse.text());
      // Fallback to volume-based sorting
      return markets.sort((a, b) => b.volumeRaw - a.volumeRaw).slice(0, 10);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Could not parse AI response, falling back to volume sort');
      return markets.sort((a, b) => b.volumeRaw - a.volumeRaw).slice(0, 10);
    }

    const scores = JSON.parse(jsonMatch[0]);
    console.log('AI relevance scores:', scores.slice(0, 10));

    // Combine scores with markets and sort by relevance
    const scoredMarkets = markets.map((market, idx) => {
      const scoreObj = scores.find((s: any) => s.index === idx);
      return {
        ...market,
        relevanceScore: scoreObj?.score || 0
      };
    });

    // Return top 10 markets with score >= 7 (strong relation or better)
    // Changed from 5 to 7 to only show strongly related markets
    // Sort purely by relevance - volume is ignored
    return scoredMarkets
      .filter(m => m.relevanceScore >= 7)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10);

  } catch (error) {
    console.error('Error in AI ranking, falling back to volume sort:', error);
    return markets.sort((a, b) => b.volumeRaw - a.volumeRaw).slice(0, 10);
  }
}

async function searchKalshiEvents(tweetText: string): Promise<any[]> {
  try {
    console.log("Fetching Kalshi events for semantic matching");
    
    const baseUrls = [
      'https://api.elections.kalshi.com',
      'https://api.kalshi.com'
    ];

    let events: any[] = [];
    
    // Try to fetch from Kalshi API
    for (const base of baseUrls) {
      try {
        const url = `${base}/trade-api/v2/events?status=open&limit=500&with_nested_markets=true`;
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

    // Return all markets for AI ranking (process more events for comprehensive matching)
    const allMarkets: any[] = [];
    
    for (const event of events.slice(0, 150)) {
      if (event.markets && event.markets.length > 0) {
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
        
        allMarkets.push(marketData);
      }
    }

    console.log(`Collected ${allMarkets.length} Kalshi markets for AI ranking`);
    return allMarkets;
  } catch (error) {
    console.error("Error fetching from Kalshi:", error);
    return [];
  }
}

async function searchPolymarketEvents(tweetText: string): Promise<any[]> {
  try {
    console.log("Fetching Polymarket events for semantic matching");
    
    const now = Date.now();
    let events: any[] = [];
    let simplified: any[] = [];
    
    // Check cache for events
    if (eventsCache && (now - eventsCache.timestamp) < CACHE_DURATION) {
      events = eventsCache.data;
      console.log(`Using cached ${events.length} events (age: ${Math.round((now - eventsCache.timestamp) / 1000)}s)`);
    } else {
      // Fetch events from Gamma API - fetch maximum available for comprehensive matching
      const eventsResponse = await fetch("https://gamma-api.polymarket.com/events?closed=false&limit=500", {
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

    // Return all markets for AI ranking (process more events for better matching)
    const allMarkets: any[] = [];
    
    for (const event of events.slice(0, 150)) {
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
          
          allMarkets.push(marketData);
        } else {
          console.warn(`Skipping market "${event.title}" - missing ${!cid ? 'condition ID' : 'token ID'}`);
        }
      }
    }

    console.log(`Collected ${allMarkets.length} Polymarket markets for AI ranking`);
    return allMarkets;
  } catch (error) {
    console.error("Error fetching from Polymarket:", error);
    return [];
  }
}
