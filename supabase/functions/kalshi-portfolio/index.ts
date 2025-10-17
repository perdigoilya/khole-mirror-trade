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
    const path = "/trade-api/v2/portfolio/positions";
    
    const signature = await createKalshiSignature(privateKey, timestamp, method, path);

    console.log('Fetching portfolio from Kalshi API');

    // Try both Demo and Production environments
    const baseUrls = [
      'https://demo-api.kalshi.co',
      'https://api.kalshi.com'
    ];

    let portfolioData = null;
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
        portfolioData = await response.json();
        console.log(`Successfully fetched portfolio from ${base} with ${portfolioData.market_positions?.length || 0} positions`);
        break;
      } else {
        lastError = await response.text();
        console.log(`Failed ${base}:`, response.status, lastError);
      }
    }

    if (!portfolioData) {
      console.error('All Kalshi API attempts failed:', lastError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch portfolio from Demo or Production. Wrong credentials or environment?' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Transform Kalshi portfolio data to match our expected format
    const marketPositions = portfolioData.market_positions || [];
    const eventPositions = portfolioData.event_positions || [];
    
    // Normalize Kalshi positions to match Portfolio interface
    const positions = marketPositions.map((pos: any) => {
      const contracts = pos.market_result?.market_outcome === 'yes' ? pos.position : -pos.position;
      const avgPrice = pos.total_cost / Math.abs(contracts) / 100; // Kalshi uses cents
      const currentPrice = pos.market_result?.yes_price || pos.position > 0 ? 50 : 50; // fallback to 50 if no price
      const currentValue = Math.abs(contracts) * currentPrice / 100;
      const cashPnl = currentValue - (pos.total_cost / 100);
      const percentPnl = pos.total_cost > 0 ? (cashPnl / (pos.total_cost / 100)) * 100 : 0;
      
      return {
        title: pos.market_ticker || 'Unknown Market',
        outcome: contracts > 0 ? 'Yes' : 'No',
        size: Math.abs(contracts),
        avgPrice: avgPrice,
        currentValue: currentValue,
        cashPnl: cashPnl,
        percentPnl: percentPnl,
        curPrice: currentPrice / 100,
        slug: pos.market_ticker || '',
        icon: undefined,
      };
    });
    
    // Calculate summary
    const totalInvested = marketPositions.reduce((sum: number, pos: any) => sum + (pos.total_cost / 100), 0);
    const totalValue = positions.reduce((sum: number, pos: any) => sum + pos.currentValue, 0);
    const totalPnl = positions.reduce((sum: number, pos: any) => sum + pos.cashPnl, 0);
    const totalRealizedPnl = portfolioData.realized_pnl ? portfolioData.realized_pnl / 100 : 0;
    
    const summary = {
      totalValue,
      totalPnl,
      totalRealizedPnl,
      activePositions: positions.length,
      totalInvested,
    };
    
    return new Response(
      JSON.stringify({ positions, summary }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Portfolio fetch error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
