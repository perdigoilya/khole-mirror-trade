import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

async function determineKalshiBaseUrl(
  apiKeyId: string,
  privateKey: string
): Promise<string> {
  const bases = ['https://demo-api.kalshi.co', 'https://api.kalshi.com'];
  const testPath = '/trade-api/v2/portfolio/balance';

  for (const base of bases) {
    try {
      const timestamp = Date.now().toString();
      const sig = await createKalshiSignature(privateKey, timestamp, 'GET', testPath);
      const res = await fetch(`${base}${testPath}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'KALSHI-ACCESS-KEY': apiKeyId,
          'KALSHI-ACCESS-SIGNATURE': sig,
          'KALSHI-ACCESS-TIMESTAMP': timestamp,
        },
      });
      if (res.ok) {
        console.log(`Using Kalshi API: ${base}`);
        return base;
      } else {
        const txt = await res.text();
        console.log(`Kalshi balance probe failed on ${base}: ${res.status} ${txt}`);
      }
    } catch (e) {
      console.log(`Kalshi balance probe error on ${base}:`, e instanceof Error ? e.message : e);
    }
  }
  throw new Error('Could not connect to Kalshi API (Demo or Production)');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { apiKeyId, privateKey, ticker, action, side, count, type = 'limit', yesPrice, noPrice, environment } = await req.json();

    console.log('Kalshi trade request:', { ticker, action, side, count, type });

    if (!apiKeyId || !privateKey || !ticker || !action || !side || !count) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Route based on environment if provided
    const baseUrls = environment === 'demo'
      ? ['https://demo-api.kalshi.co']
      : environment === 'live'
        ? ['https://api.kalshi.com']
        : ['https://demo-api.kalshi.co', 'https://api.kalshi.com'];

    // Validate count
    if (count <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid count. Must be a positive number.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // For limit orders, validate price
    if (type === 'limit') {
      const price = side === 'yes' ? yesPrice : noPrice;
      if (!price || price <= 0 || price > 100) {
        return new Response(
          JSON.stringify({ error: 'Invalid price. Price must be between 1 and 100 cents.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    // Calculate required amount for the trade (USD)
    // Only needed for BUY orders (sells don't require available cash)
    let requiredAmount = 0;
    if (action === 'buy') {
      if (type === 'limit') {
        const price = side === 'yes' ? yesPrice : noPrice;
        requiredAmount = (count * price) / 100; // cents -> dollars
      } else {
        // Market buy worst-case (assume $1 per contract)
        requiredAmount = count;
      }
    }

    let lastError = '';
    for (const baseUrl of baseUrls) {
      try {
        // 1) Check balance on this environment
        const balanceTimestamp = Date.now().toString();
        const balancePath = '/trade-api/v2/portfolio/balance';
        const balanceSignature = await createKalshiSignature(privateKey, balanceTimestamp, 'GET', balancePath);

        console.log(`[kalshi-trade] Checking balance on ${baseUrl}`);
        const balanceResponse = await fetch(`${baseUrl}${balancePath}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'KALSHI-ACCESS-KEY': apiKeyId,
            'KALSHI-ACCESS-SIGNATURE': balanceSignature,
            'KALSHI-ACCESS-TIMESTAMP': balanceTimestamp,
          },
        });

        if (!balanceResponse.ok) {
          const txt = await balanceResponse.text();
          console.log(`[kalshi-trade] Balance check failed on ${baseUrl}: ${balanceResponse.status} ${txt}`);
          lastError = `Balance check failed on ${baseUrl}: ${balanceResponse.status}`;
          continue; // try next environment
        }

        const balanceData = await balanceResponse.json();
        const availableBalance = Number(balanceData.balance || 0) / 100;
        console.log(`[kalshi-trade] Balance on ${baseUrl}: $${availableBalance.toFixed(2)}`);

        if (availableBalance < requiredAmount) {
          lastError = `Insufficient funds on ${baseUrl}: need $${requiredAmount.toFixed(2)} have $${availableBalance.toFixed(2)}`;
          continue; // try next environment
        }

        // 2) Submit order on this environment
        const timestamp = Date.now().toString();
        const path = '/trade-api/v2/portfolio/orders';
        const signature = await createKalshiSignature(privateKey, timestamp, 'POST', path);

        const orderPayload: any = { ticker, action, side, count, type };

        if (type === 'market') {
          // True market behavior: do NOT include prices
          orderPayload.time_in_force = 'immediate_or_cancel';
          if (action === 'buy') {
            // Cap total spend in cents (FoK enforced by API when buy_max_cost is set)
            orderPayload.buy_max_cost = Math.round(count * 100);
          } else {
            // Prevent accidentally flipping position during market sells
            orderPayload.sell_position_capped = true;
          }
        } else {
          // Limit orders: attach exactly one of yes_price/no_price
          const priceYes = typeof yesPrice === 'number' ? Math.round(yesPrice) : undefined;
          const priceNo = typeof noPrice === 'number' ? Math.round(noPrice) : undefined;
          if (side === 'yes' && priceYes !== undefined) {
            orderPayload.yes_price = priceYes;
          } else if (side === 'no' && priceNo !== undefined) {
            orderPayload.no_price = priceNo;
          }
        }

        console.log(`[kalshi-trade] Submitting order on ${baseUrl}`, orderPayload);
        const orderResponse = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'KALSHI-ACCESS-KEY': apiKeyId,
            'KALSHI-ACCESS-SIGNATURE': signature,
            'KALSHI-ACCESS-TIMESTAMP': timestamp,
          },
          body: JSON.stringify(orderPayload),
        });

        const orderData = await orderResponse.json();
        if (!orderResponse.ok) {
          console.log(`[kalshi-trade] Order failed on ${baseUrl}: ${orderResponse.status}`, orderData);
          lastError = orderData?.error || orderData?.message || `HTTP ${orderResponse.status}`;
          continue; // try next environment
        }

        console.log('[kalshi-trade] Order submitted successfully:', orderData);
        return new Response(
          JSON.stringify({ success: true, order: orderData.order, message: 'Order submitted successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`[kalshi-trade] Error on ${baseUrl}:`, msg);
        lastError = msg;
        continue;
      }
    }

    // If we got here, both environments failed
    return new Response(
      JSON.stringify({ error: 'Order submission failed', details: lastError || 'Both environments failed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
    );

  } catch (error) {
    console.error('Kalshi trade error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: 'Trade failed',
        details: errorMessage 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
