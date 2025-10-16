import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLOB = 'https://clob.polymarket.com';
const ENV = Deno.env.get('DENO_DEPLOYMENT_ID')?.slice(0, 8) || 'local';

async function hmacBase64(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const isB64 = /^[A-Za-z0-9+/]+={0,2}$/.test(secret);
  let secretBytes: Uint8Array;
  if (isB64) {
    const raw = atob(secret);
    secretBytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      secretBytes[i] = raw.charCodeAt(i);
    }
  } else {
    secretBytes = encoder.encode(secret);
  }
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    secretBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  const arr = Array.from(new Uint8Array(sig));
  return btoa(String.fromCharCode(...arr));
}

function suffix(v: any): string {
  return typeof v === 'string' && v.length > 6 ? v.slice(-6) : v || '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const out = (obj: any, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  try {
    const {
      walletAddress,
      tokenId,
      side,
      price,
      size,
      signedOrder,
      funderAddress,
    } = await req.json();

    const eoaLower = String(walletAddress).toLowerCase();
    const dbKey = `polymarket:${ENV}:${eoaLower}`;

    console.log(`[TRADE] eoa=${eoaLower} tokenId=${tokenId} side=${side} dbKey=${dbKey}`);

    if (!walletAddress || !tokenId || !side || !price || !size || !signedOrder) {
      return out({ problem: 'Missing required parameters', details: { walletAddress, tokenId, side, price, size, signedOrder } }, 400);
    }

    // Load L2 API credentials securely from the backend for the authenticated user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return out({ error: 'Unauthorized', details: authErr?.message || 'No user' }, 401);
    }

    const userId = authData.user.id;
    const { data: credsRow, error: credsErr } = await supabase
      .from('user_polymarket_credentials')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsErr || !credsRow) {
      return out({ error: 'Missing L2 credentials', details: 'No Polymarket credentials stored for this user', action: 'create_api_key' }, 400);
    }

    const storedWallet = credsRow.wallet_address?.toLowerCase();
    if (storedWallet !== eoaLower) {
      console.error('[WALLET-MISMATCH]', { storedWallet, eoaLower });
      return out({
        error: 'Wallet mismatch',
        details: `POLY_ADDRESS (${eoaLower}) must match stored wallet (${storedWallet}). Switch wallets or reconnect.`
      }, 400);
    }

    let key: string | null = credsRow.api_credentials_key || credsRow.api_key || null;
    let secret: string | null = credsRow.api_credentials_secret || null;
    let passphrase: string | null = credsRow.api_credentials_passphrase || null;

    if (!key || !secret || !passphrase) {
      return out({ problem: 'Missing L2 credentials', details: { key: !!key, secret: !!secret, passphrase: !!passphrase }, action: 'create_api_key' }, 400);
    }

    if (price <= 0 || price > 1 || size <= 0) {
      return out({ problem: 'Invalid price or size', details: { price, size } }, 400);
    }

    const orderPayload = {
      order: signedOrder,
      owner: key,
      orderType: 'GTC'
    };
    const rawBody = JSON.stringify(orderPayload);

    const method = 'POST';
    const path = '/order';
    const ts = Math.floor(Date.now() / 1000);
    const preimage = `${method}${path}${ts}${rawBody}`;
    (globalThis as any).__PREIMAGE = preimage;

    const sig = await hmacBase64(secret, preimage);
    const hdrs: Record<string, string> = {
      'content-type': 'application/json',
      'accept': 'application/json',
      'POLY_ADDRESS': eoaLower,
      'POLY_API_KEY': key,
      'POLY_PASSPHRASE': passphrase,
      'POLY_TIMESTAMP': ts.toString(),
      'POLY_SIGNATURE': sig,
    };

    console.log('[L2-ORDER] Before fetch:', {
      eoa: eoaLower,
      keySuffix: suffix(key),
      passSuffix: passphrase.slice(-4),
      ts,
      preimageFirst120: preimage.slice(0, 120),
      sigB64First12: sig.slice(0, 12),
      funderAddress: funderAddress || 'not_specified',
      bodyLength: rawBody.length,
      dbKey
    });

    let r = await fetch(`${CLOB}${path}`, { method, headers: hdrs, body: rawBody });
    const text = await r.text();
    let upstream = text ? JSON.parse(text) : null;
    const cf = {
      'cf-ray': r.headers.get('cf-ray') || '',
      'cf-cache-status': r.headers.get('cf-cache-status') || '',
      'server': r.headers.get('server') || '',
      'content-type': r.headers.get('content-type') || ''
    };

    // On 401: derive → REBIND → retry ONCE
    if (r.status === 401) {
      console.log('[L2-401] Attempting derive → rebind → retry...');
      const d = await fetch(`${CLOB}/auth/derive-api-key`, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'POLY_ADDRESS': eoaLower },
      });
      const dUp = await d.json();
      if (!d.ok || !dUp.apiKey || !dUp.secret || !dUp.passphrase) {
        console.error('[DERIVE-FAILED]', d.status, dUp);
        return out({
          error: 'Order Submission Failed',
          status: r.status,
          cf,
          upstream,
          attempts: [{ status: r.status, upstream, cf }, { deriveError: dUp }]
        }, r.status);
      }

      // REBIND locals
      key = dUp.apiKey;
      secret = dUp.secret;
      passphrase = dUp.passphrase;

      const ts2 = Math.floor(Date.now() / 1000);
      const pre2 = `${method}${path}${ts2}${rawBody}`;
      (globalThis as any).__PREIMAGE = pre2;
      const sig2 = await hmacBase64(secret!, pre2);

      hdrs['POLY_API_KEY'] = key!;
      hdrs['POLY_PASSPHRASE'] = passphrase!;
      hdrs['POLY_TIMESTAMP'] = ts2.toString();
      hdrs['POLY_SIGNATURE'] = sig2;

      console.log('[L2-RETRY] After derive:', {
        eoa: eoaLower,
        keySuffix: suffix(key),
        passSuffix: passphrase!.slice(-4),
        ts: ts2,
        preimageFirst120: pre2.slice(0, 120),
        sigB64First12: sig2.slice(0, 12),
      });

      r = await fetch(`${CLOB}${path}`, { method, headers: hdrs, body: rawBody });
      const text2 = await r.text();
      upstream = text2 ? JSON.parse(text2) : null;

      if (r.ok) {
        // Persist new tuple atomically
        await supabase
          .from('user_polymarket_credentials')
          .update({
            api_credentials_key: key,
            api_credentials_secret: secret,
            api_credentials_passphrase: passphrase,
            wallet_address: eoaLower,
          })
          .eq('user_id', userId);
        console.log('[DB-UPDATED] Persisted derived credentials');
      }
    }

    if (!r.ok) {
      console.error('[L2-ORDER] FAILED:', r.status, upstream);
      return out({
        error: 'Order Submission Failed',
        status: r.status,
        cf,
        upstream
      }, r.status);
    }

    console.log('[L2-ORDER] ✓ Success:', upstream);
    return out({
      success: true,
      orderId: upstream.orderID,
      order: upstream
    });

  } catch (e: any) {
    console.error('[ERROR] polymarket-trade crashed:', e);
    return out({ ok: false, error: 'EdgeCrash', message: e?.message, stack: e?.stack }, 500);
  }
});
