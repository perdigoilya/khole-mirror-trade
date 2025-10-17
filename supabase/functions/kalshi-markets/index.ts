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
  // Reject encrypted keys
  if (/Proc-Type:|ENCRYPTED/i.test(privateKeyPem)) {
    throw new Error('Encrypted private keys are not supported. Please use an unencrypted key.');
  }

  const base64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  const derLen = (n: number) => {
    if (n < 128) return new Uint8Array([n]);
    const bytes: number[] = [];
    while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
    return new Uint8Array([0x80 | bytes.length, ...bytes]);
  };
  const concat = (...arrs: Uint8Array[]) => {
    const total = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrs) { out.set(a, off); off += a.length; }
    return out;
  };

  const stripPem = (pem: string, label: string) =>
    pem
      .replace(new RegExp(`-----BEGIN ${label}-----`, 'g'), '')
      .replace(new RegExp(`-----END ${label}-----`, 'g'), '')
      .replace(/\s+/g, '');

  let pkcs8Der: Uint8Array;

  if (/BEGIN PRIVATE KEY/.test(privateKeyPem)) {
    // PKCS#8
    const pem = stripPem(privateKeyPem, 'PRIVATE KEY');
    pkcs8Der = base64ToBytes(pem);
  } else if (/BEGIN RSA PRIVATE KEY/.test(privateKeyPem)) {
    // PKCS#1 -> wrap into PKCS#8
    const pem = stripPem(privateKeyPem, 'RSA PRIVATE KEY');
    const pkcs1Der = base64ToBytes(pem);

    // Build: SEQUENCE { version(0), algId(rsaEncryption,NULL), OCTET STRING(pkcs1Der) }
    const oidRsa = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);
    const nullParams = new Uint8Array([0x05, 0x00]);
    const algSeqContent = concat(oidRsa, nullParams);
    const algSeq = concat(new Uint8Array([0x30]), derLen(algSeqContent.length), algSeqContent);
    const version = new Uint8Array([0x02, 0x01, 0x00]);
    const pkOctet = concat(new Uint8Array([0x04]), derLen(pkcs1Der.length), pkcs1Der);
    const p8Content = concat(version, algSeq, pkOctet);
    pkcs8Der = concat(new Uint8Array([0x30]), derLen(p8Content.length), p8Content);
  } else {
    throw new Error('Unsupported key format. Provide PKCS#8 (BEGIN PRIVATE KEY) or PKCS#1 (BEGIN RSA PRIVATE KEY).');
  }

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Der.buffer as ArrayBuffer,
    { name: 'RSA-PSS', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const message = `${timestamp}${method}${path}`;
  const msgBuffer = new TextEncoder().encode(message);

  const signature = await crypto.subtle.sign({ name: 'RSA-PSS', saltLength: 32 }, key, msgBuffer);
  return bytesToBase64(new Uint8Array(signature));
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
      // Kalshi returns prices as percentages (0-100), not cents
      // yes_bid is the current bid price for YES outcome as a percentage
      const yesPrice = market.yes_bid ?? market.last_price ?? 50;
      const noPrice = 100 - yesPrice;
      
      // Volume and liquidity are in cents, convert to dollars
      const volumeCents = market.volume_24h || market.volume || 0;
      const liquidityCents = market.liquidity || market.open_interest || 0;
      
      return {
        id: market.ticker,
        title: market.title,
        subtitle: market.subtitle,
        description: market.subtitle || market.title,
        image: undefined, // Kalshi doesn't provide market images
        yesPrice: yesPrice,
        noPrice: noPrice,
        volume: volumeCents > 0 ? `$${(volumeCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
        liquidity: liquidityCents > 0 ? `$${(liquidityCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
        volumeRaw: volumeCents / 100,
        liquidityRaw: liquidityCents / 100,
        endDate: market.close_time || market.expiration_time || new Date().toISOString(),
        status: market.status === 'active' ? 'Active' : market.status === 'closed' ? 'Closed' : market.status || 'Active',
        category: market.category || 'General',
        provider: 'kalshi' as const,
        ticker: market.ticker,
        eventTicker: market.event_ticker, // For event grouping
        clobTokenId: market.ticker,
        isMultiOutcome: false,
      };
    }) || [];
    
    // Group markets by event_ticker (similar to Polymarket's multi-outcome markets)
    const eventGroups = new Map<string, any[]>();
    const standaloneMarkets: any[] = [];
    
    for (const market of normalizedMarkets) {
      if (market.eventTicker) {
        if (!eventGroups.has(market.eventTicker)) {
          eventGroups.set(market.eventTicker, []);
        }
        eventGroups.get(market.eventTicker)!.push(market);
      } else {
        standaloneMarkets.push(market);
      }
    }
    
    // Convert event groups to multi-outcome markets
    const groupedMarkets: any[] = [];
    
    for (const [eventTicker, markets] of eventGroups.entries()) {
      if (markets.length > 1) {
        // Multi-outcome event - pick the highest volume market as main
        const sortedByVolume = [...markets].sort((a, b) => b.volumeRaw - a.volumeRaw);
        const mainMarket = sortedByVolume[0];
        const subMarkets = sortedByVolume.slice(1);
        
        groupedMarkets.push({
          ...mainMarket,
          id: eventTicker, // Use event ticker as ID for the group
          title: mainMarket.title.replace(/Will .+ /, ''), // Extract event name
          isMultiOutcome: true,
          subMarkets: subMarkets,
        });
      } else {
        // Single market in event
        groupedMarkets.push(markets[0]);
      }
    }
    
    const finalMarkets = [...groupedMarkets, ...standaloneMarkets];
    
    return new Response(
      JSON.stringify({ 
        markets: finalMarkets,
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
