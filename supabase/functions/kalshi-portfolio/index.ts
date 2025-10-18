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

    // Fetch both positions and balance from Kalshi API
    console.log('Fetching portfolio from Kalshi API');

    // Try both Demo and Production environments
    const baseUrls = [
      'https://demo-api.kalshi.co',
      'https://api.kalshi.com'
    ];

    let portfolioData: any = null;
    let balanceData: any = null;
    let successfulBase = '';
    let lastError = '';
    const candidates: Array<{ base: string; portfolioData: any; balanceData: any }> = [];

    for (const base of baseUrls) {
      try {
        // Fetch positions
        const timestamp1 = Date.now().toString();
        const positionsPath = "/trade-api/v2/portfolio/positions";
        const positionsSignature = await createKalshiSignature(privateKey, timestamp1, "GET", positionsPath);
        
        console.log('Trying', `${base}${positionsPath}`);
        
        const positionsResponse = await fetch(`${base}${positionsPath}`, {
          headers: {
            'KALSHI-ACCESS-KEY': apiKeyId,
            'KALSHI-ACCESS-SIGNATURE': positionsSignature,
            'KALSHI-ACCESS-TIMESTAMP': timestamp1,
            'Content-Type': 'application/json',
          },
        });
  
        if (positionsResponse.ok) {
          const pd = await positionsResponse.json();
          console.log(`Fetched positions from ${base}: ${pd.market_positions?.length || 0}`);
          // Also fetch balance for this base
          const timestamp2 = Date.now().toString();
          const balancePath = "/trade-api/v2/portfolio/balance";
          const balanceSignature = await createKalshiSignature(privateKey, timestamp2, "GET", balancePath);
          let bd: any = null;
          const balanceResponse = await fetch(`${base}${balancePath}`, {
            headers: {
              'KALSHI-ACCESS-KEY': apiKeyId,
              'KALSHI-ACCESS-SIGNATURE': balanceSignature,
              'KALSHI-ACCESS-TIMESTAMP': timestamp2,
              'Content-Type': 'application/json',
            },
          });
          if (balanceResponse.ok) {
            bd = await balanceResponse.json();
            console.log(`Fetched balance from ${base}: ${JSON.stringify(bd)}`);
          } else {
            const balanceError = await balanceResponse.text();
            console.log(`Balance fetch failed on ${base}: ${balanceResponse.status} - ${balanceError}`);
          }
          candidates.push({ base, portfolioData: pd, balanceData: bd });
          continue;
        } else {
          lastError = await positionsResponse.text();
          console.log(`Failed ${base}:`, positionsResponse.status, lastError);
        }
      } catch (err) {
        console.error(`Error contacting ${base}:`, err);
      }
    }

    // Choose best environment among candidates (prefer non-zero positions or balance)
    if (candidates.length > 0) {
      const withData = candidates.find(c => ((c.portfolioData?.market_positions?.length || 0) > 0) || (c.balanceData && parseFloat((c.balanceData.balance ?? '0')) > 0));
      const chosen = withData || candidates[0];
      portfolioData = chosen.portfolioData;
      balanceData = chosen.balanceData;
      successfulBase = chosen.base;
      console.log(`Using base ${successfulBase} positions=${portfolioData.market_positions?.length || 0} balance=${balanceData?.balance ?? 'n/a'}`);
    }

    if (!portfolioData) {
      console.error('All Kalshi API attempts failed:', lastError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch portfolio from Demo or Production. Wrong credentials or environment?' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Fetch market quotes per ticker to compute current prices
    const marketPositions = portfolioData.market_positions || [];
    const tickers: string[] = Array.from(new Set(marketPositions.map((p: any) => p.ticker || p.market_ticker).filter(Boolean)));
    const priceMap: Record<string, any> = {};
    for (const t of tickers) {
      try {
        const ts = Date.now().toString();
        const mpath = `/trade-api/v2/markets/${encodeURIComponent(t)}`;
        const sig = await createKalshiSignature(privateKey, ts, 'GET', mpath);
        const r = await fetch(`${successfulBase}${mpath}`, {
          headers: {
            'KALSHI-ACCESS-KEY': apiKeyId,
            'KALSHI-ACCESS-SIGNATURE': sig,
            'KALSHI-ACCESS-TIMESTAMP': ts,
            'Content-Type': 'application/json',
          },
        });
        if (r.ok) {
          const md = await r.json();
          priceMap[t] = md.market || md;
        }
      } catch (_) {}
    }

    // Fetch resting (open) buy orders to surface pending counts/prices
    const pendingAgg: Record<string, { count: number; totalCents: number; side?: string }> = {};
    try {
      const tsOrders = Date.now().toString();
      const ordersPath = `/trade-api/v2/orders?status=resting&limit=200`;
      const ordersSig = await createKalshiSignature(privateKey, tsOrders, 'GET', ordersPath);
      const or = await fetch(`${successfulBase}${ordersPath}`, {
        headers: {
          'KALSHI-ACCESS-KEY': apiKeyId,
          'KALSHI-ACCESS-SIGNATURE': ordersSig,
          'KALSHI-ACCESS-TIMESTAMP': tsOrders,
          'Content-Type': 'application/json',
        },
      });
      if (or.ok) {
        const od = await or.json();
        const orders = od.orders || od.open_orders || od || [];
        for (const o of orders) {
          try {
            if (!o) continue;
            if (o.action !== 'buy') continue; // only show pending buys as potential new shares
            const ticker = o.ticker || o.market_ticker;
            if (!ticker) continue;
            const remaining = Number(o.remaining_count ?? o.initial_count ?? 0);
            if (!(remaining > 0)) continue;
            const yesCents = typeof o.yes_price === 'number'
              ? o.yes_price
              : (o.yes_price_dollars ? Math.round(parseFloat(String(o.yes_price_dollars)) * 100) : undefined);
            const noCents = typeof o.no_price === 'number'
              ? o.no_price
              : (o.no_price_dollars ? Math.round(parseFloat(String(o.no_price_dollars)) * 100) : undefined);
            let priceCents: number | undefined;
            if (o.side === 'yes') priceCents = yesCents;
            else if (o.side === 'no') priceCents = noCents !== undefined ? (100 - noCents) : undefined;

            if (!pendingAgg[ticker]) pendingAgg[ticker] = { count: 0, totalCents: 0, side: o.side };
            pendingAgg[ticker].count += remaining;
            if (typeof priceCents === 'number') pendingAgg[ticker].totalCents += priceCents * remaining;
          } catch (_) { /* ignore order parse errors */ }
        }
      } else {
        const txt = await or.text();
        console.log('Open orders fetch failed:', or.status, txt);
      }
    } catch (e) {
      console.log('Failed to fetch resting orders:', e);
    }


    // Normalize positions
    const positions = marketPositions.map((pos: any) => {
      const ticker = pos.ticker || pos.market_ticker || '';
      const size = Math.abs(Number(pos.position) || 0);
      const totalTradedCents = Number(pos.total_traded ?? 0);
      const avgPrice = size > 0 ? (totalTradedCents / size) / 100 : 0;
      const m = priceMap[ticker] || {};
      const yesAsk = typeof m.yes_ask === 'number' ? m.yes_ask : undefined;
      const yesBid = typeof m.yes_bid === 'number' ? m.yes_bid : undefined;
      const noAsk = typeof m.no_ask === 'number' ? m.no_ask : undefined;
      const last = typeof m.last_price === 'number' ? m.last_price : undefined;
      const curPriceCents = yesAsk ?? last ?? yesBid ?? (typeof noAsk === 'number' ? (100 - noAsk) : 50);
      const currentValue = size * (curPriceCents / 100);
      const invested = totalTradedCents / 100;
      const cashPnl = currentValue - invested;
      const percentPnl = invested > 0 ? (cashPnl / invested) * 100 : 0;

      // Use the market title if available, otherwise fall back to ticker
      const marketTitle = m.title || m.market_title || ticker;

      // Attach pending order info if any
      const pend = pendingAgg[ticker];
      const pendingCount = pend?.count || 0;
      const pendingPrice = pend && pend.count > 0 ? (pend.totalCents / pend.count) / 100 : undefined;

      return {
        title: marketTitle,
        outcome: (Number(pos.position) || 0) >= 0 ? 'Yes' : 'No',
        size,
        avgPrice,
        currentValue,
        cashPnl,
        percentPnl,
        curPrice: curPriceCents / 100,
        slug: ticker,
        icon: undefined,
        pendingCount,
        pendingPrice,
      };
    });

    // Summary
    const totalInvested = marketPositions.reduce((sum: number, pos: any) => sum + (Number(pos.total_traded ?? 0) / 100), 0);
    const totalValue = positions.reduce((sum: number, pos: any) => sum + pos.currentValue, 0);
    const totalPnl = positions.reduce((sum: number, pos: any) => sum + pos.cashPnl, 0);
    const totalRealizedPnl = marketPositions.reduce((sum: number, pos: any) => sum + (Number(pos.realized_pnl ?? 0) / 100), 0);

    const summary = {
      totalValue,
      totalPnl,
      totalRealizedPnl,
      activePositions: positions.length,
      totalInvested,
    };
    
    // Parse Kalshi balance (in cents)
    const balance = balanceData?.balance ? parseFloat(balanceData.balance) / 100 : 0;
    
    console.log(`Final balance value: ${balance}, Raw balanceData:`, JSON.stringify(balanceData));
    
    return new Response(
      JSON.stringify({ 
        positions, 
        summary, 
        balance,
        balanceFormatted: `$${balance.toFixed(2)}`,
      }),
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
