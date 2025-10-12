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

    let markets = [];

    if (provider === 'polymarket') {
      markets = await searchPolymarketEvents(keywords);
    } else if (provider === 'kalshi') {
      // TODO: Implement Kalshi search
      markets = [];
    }

    return new Response(
      JSON.stringify({ markets, keywords }),
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

async function searchPolymarketEvents(keywords: string[]): Promise<any[]> {
  try {
    console.log("Searching Polymarket events with keywords:", keywords);
    
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
    const events = Array.isArray(eventsData) ? eventsData : [];
    console.log(`Fetched ${events.length} events from Polymarket`);

    // Fetch simplified markets for pricing
    const simplifiedRes = await fetch("https://clob.polymarket.com/simplified-markets", {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "LovableCloud/1.0 (+https://lovable.dev)",
      },
    });
    
    const simplifiedData = simplifiedRes.ok ? await simplifiedRes.json() : [];
    const simplified = Array.isArray(simplifiedData) ? simplifiedData : [];
    console.log(`Fetched ${simplified.length} simplified markets`);
    
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
          
          // Extract pricing
          let yesPrice = 50;
          let noPrice = 50;
          
          if (tokens.length >= 1) {
            const token = tokens[0];
            const bid = token.best_bid ?? token.bbo?.BUY ?? token.prices?.BUY;
            const ask = token.best_ask ?? token.bbo?.SELL ?? token.prices?.SELL;
            if (bid !== undefined && ask !== undefined) {
              const bidNum = typeof bid === 'string' ? parseFloat(bid) : bid;
              const askNum = typeof ask === 'string' ? parseFloat(ask) : ask;
              const mid = (bidNum + askNum) / 2;
              yesPrice = Math.round(mid <= 1 ? mid * 100 : mid);
              noPrice = 100 - yesPrice;
            }
          }
          
          const vol = parseFloat(event.volume || mainMarket.volume_usd || mainMarket.volume || 0);
          const liq = parseFloat(event.liquidity || mainMarket.liquidity || 0);
          
          // Get CLOB token ID for charts
          let clobTokenId = '';
          if (tokens.length > 0) {
            const token = tokens[0];
            clobTokenId = token.token_id || token.tokenId || '';
          }
          
          // Only add markets with valid condition IDs
          if (cid) {
            relevantMarkets.push({
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
            });
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
