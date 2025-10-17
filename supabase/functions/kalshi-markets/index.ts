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
    // Request open markets with high limit, sorted by volume
    const path = "/trade-api/v2/markets?status=open&limit=200";
    
    const signature = await createKalshiSignature(privateKey, timestamp, method, path);

    console.log('Fetching markets from Kalshi API');

    // Try both Demo and Production environments
    const baseUrls = [
      'https://demo-api.kalshi.co',
      'https://api.kalshi.com',
      'https://api.elections.kalshi.com'
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
    const normalizedMarkets = (marketData.markets?.map((market: any) => {
      // Kalshi prices are in cents (0-100). Prefer last_price, fallback to midpoint of bid/ask
      const lastPrice = typeof market.last_price === 'number' ? market.last_price : null;
      const yesAsk = typeof market.yes_ask === 'number' ? market.yes_ask : null;
      const yesBid = typeof market.yes_bid === 'number' ? market.yes_bid : null;
      const noAsk = typeof market.no_ask === 'number' ? market.no_ask : null;
      const noBid = typeof market.no_bid === 'number' ? market.no_bid : null;
      
      // Calculate yes and no prices
      let yesPrice = lastPrice;
      if (yesPrice === null && yesAsk !== null && yesBid !== null) {
        yesPrice = Math.round((yesAsk + yesBid) / 2);
      } else if (yesPrice === null && yesAsk !== null) {
        yesPrice = yesAsk;
      } else if (yesPrice === null && yesBid !== null) {
        yesPrice = yesBid;
      }
      
      let noPrice = yesPrice !== null ? (100 - yesPrice) : null;
      if (noPrice === null && noAsk !== null && noBid !== null) {
        noPrice = Math.round((noAsk + noBid) / 2);
      } else if (noPrice === null && noAsk !== null) {
        noPrice = noAsk;
      } else if (noPrice === null && noBid !== null) {
        noPrice = noBid;
      }
      
      // Default to 50/50 if no pricing data
      if (yesPrice === null) yesPrice = 50;
      if (noPrice === null) noPrice = 50;
      
      // Volume is 24h contract count, liquidity_dollars is a string like "0.2300"
      const volume24h = typeof market.volume_24h === 'number' ? market.volume_24h : 0;
      const liquidityDollars = market.liquidity_dollars ? parseFloat(market.liquidity_dollars) : 0;
      
      return {
        id: market.ticker,
        title: market.title || market.ticker,
        subtitle: market.subtitle,
        description: market.subtitle || market.title || market.ticker,
        image: undefined,
        yesPrice,
        noPrice,
        volume: volume24h > 0 ? `${volume24h.toLocaleString('en-US')} contracts` : '$0',
        liquidity: liquidityDollars > 0 ? `$${liquidityDollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
        volumeRaw: volume24h,
        liquidityRaw: liquidityDollars,
        endDate: market.close_time || market.expiration_time || new Date().toISOString(),
        status: market.status === 'open' ? 'Active' : market.status === 'closed' ? 'Closed' : 'Active',
        category: market.category || 'General',
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
