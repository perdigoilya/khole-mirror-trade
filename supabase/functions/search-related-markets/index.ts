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
      markets = await searchPolymarketPublic(keywords);
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

async function searchPolymarketPublic(keywords: string[]): Promise<any[]> {
  try {
    // Use Polymarket's public API
    const response = await fetch("https://clob.polymarket.com/markets", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error("Polymarket API error:", response.status);
      return [];
    }

    const allMarkets = await response.json();
    
    // Filter markets based on keywords
    const relevantMarkets = allMarkets
      .filter((market: any) => {
        const marketText = `${market.question} ${market.description}`.toLowerCase();
        return keywords.some(keyword => marketText.includes(keyword));
      })
      .slice(0, 10) // Limit to 10 results
      .map((market: any) => ({
        id: market.condition_id,
        title: market.question,
        description: market.description,
        yesPrice: market.outcomes?.[0]?.price ? Math.round(market.outcomes[0].price * 100) : 50,
        noPrice: market.outcomes?.[1]?.price ? Math.round(market.outcomes[1].price * 100) : 50,
        volume: market.volume ? `$${(market.volume / 1000000).toFixed(1)}M` : "$0",
        provider: 'polymarket',
      }));

    return relevantMarkets;
  } catch (error) {
    console.error("Error fetching from Polymarket:", error);
    return [];
  }
}
