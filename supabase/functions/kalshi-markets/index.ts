import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.203.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function createKalshiSignature(
  privateKeyPem: string,
  timestamp: string,
  method: string,
  path: string
): Promise<string> {
  // Import the private key
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKeyPem
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSA-PSS",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  // Create message to sign: timestamp + method + path
  const message = `${timestamp}${method}${path}`;
  const msgBuffer = new TextEncoder().encode(message);

  // Sign with RSA-PSS
  const signature = await crypto.subtle.sign(
    {
      name: "RSA-PSS",
      saltLength: 32, // SHA-256 digest length
    },
    key,
    msgBuffer
  );

  // Convert to base64
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { apiKeyId, privateKey } = await req.json();

    if (!apiKeyId || !privateKey) {
      return new Response(
        JSON.stringify({ error: 'API credentials are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Kalshi authentication headers
    const timestamp = Date.now().toString();
    const method = "GET";
    const path = "/trade-api/v2/markets";
    
    const signature = await createKalshiSignature(privateKey, timestamp, method, path);

    console.log('Fetching markets from Kalshi API');

    // Try both Demo and Production environments
    const baseUrls = [
      'https://demo-api.kalshi.co',
      'https://api.kalshi.com'
    ];

    let marketData = null;
    let lastError = '';

    for (const base of baseUrls) {
      const url = `${base}${path}`;
      console.log('Trying', url);
      
      const response = await fetch(url, {
        headers: {
          'KALSHI-ACCESS-KEY': apiKeyId,
          'KALSHI-ACCESS-SIGNATURE': signature,
          'KALSHI-ACCESS-TIMESTAMP': timestamp,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        marketData = await response.json();
        console.log(`Successfully fetched ${marketData.markets?.length || 0} markets from ${base}`);
        break;
      } else {
        lastError = await response.text();
        console.log(`Failed ${base}:`, response.status, lastError);
      }
    }

    if (!marketData) {
      console.error('All Kalshi API attempts failed:', lastError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch markets from Demo or Production.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Normalize Kalshi markets to match our Market interface
    const normalizedMarkets = marketData.markets?.map((market: any) => {
      // Kalshi returns prices in cents (0-100), we need to match that format
      const yesPrice = market.yes_bid || market.last_price || 50; // Default to 50 if no price
      const noPrice = 100 - yesPrice;
      
      // Calculate volume and liquidity from Kalshi fields
      const volume = market.volume || market.open_interest || 0;
      const liquidity = market.liquidity || 0;
      
      return {
        id: market.ticker, // Use ticker as unique ID
        title: market.title,
        description: market.subtitle || market.title,
        image: market.image_url || undefined,
        yesPrice: yesPrice,
        noPrice: noPrice,
        volume: volume > 0 ? `$${(volume / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
        liquidity: liquidity > 0 ? `$${(liquidity / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
        volumeRaw: volume / 100, // Convert cents to dollars
        liquidityRaw: liquidity / 100,
        endDate: market.close_time || market.expiration_time || new Date().toISOString(),
        status: market.status === 'active' ? 'open' : market.status === 'closed' ? 'closed' : market.status || 'open',
        category: market.category || market.series_ticker || 'General',
        provider: 'kalshi' as const,
        ticker: market.ticker,
        clobTokenId: market.ticker, // Use ticker as token ID for Kalshi
        isMultiOutcome: false, // Kalshi markets are typically binary
      };
    }) || [];
    
    return new Response(
      JSON.stringify({ 
        markets: normalizedMarkets,
        cursor: marketData.cursor 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Markets fetch error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
