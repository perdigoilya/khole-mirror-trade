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

function suffix(v?: string): string {
  return v ? (v.length > 6 ? v.slice(-6) : v) : '';
}

function tryJson(t: string): any {
  try { return JSON.parse(t); } catch { return t; }
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

    console.log(`[TRADE] eoa=${eoaLower} tokenId=${tokenId} side=${side}`);

    if (!walletAddress || !tokenId || !side || !price || !size || !signedOrder) {
      return out({ error: 'Missing required parameters', details: { walletAddress, tokenId, side, price, size, signedOrder } }, 400);
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
      return out({ error: 'No Polymarket credentials found' }, 400);
    }

    let key = credsRow.api_credentials_key || credsRow.api_key;
    let secret = credsRow.api_credentials_secret;
    let passphrase = credsRow.api_credentials_passphrase;
    const ownerAddress = credsRow.wallet_address?.toLowerCase() || '';
    const dbKey = `polymarket:${ENV}:${ownerAddress}`;

    console.log('[TRADE] DB key used:', dbKey);

    if (!key || !secret || !passphrase) {
      return out({ error: 'Missing L2 header(s)', details: { key: !!key, secret: !!secret, passphrase: !!passphrase } }, 400);
    }

    if (ownerAddress !== eoaLower) {
      return out({ error: 'OwnerMismatch', details: { ownerAddress, eoaLower } }, 400);
    }

    if (price <= 0 || price > 1 || size <= 0) {
      return out({ error: 'Invalid price or size', details: { price, size } }, 400);
    }

    const orderPayload = {
      order: signedOrder,
      owner: key,
      orderType: 'GTC'
    };
    const rawBody = JSON.stringify(orderPayload);

    const method = 'POST';
    const path = '/order';
    const url = `${CLOB}${path}`;
    const ts = Math.floor(Date.now() / 1000);
    const preimage = `${method}${path}${ts}${rawBody}`;
    (globalThis as any).__PREIMAGE = preimage;

    const sig = await hmacBase64(secret, preimage);
    const hdrs: Record<string, string> = {
      'content-type': 'application/json',
      'accept': 'application/json',
      'POLY_ADDRESS': ownerAddress,
      'POLY_API_KEY': key,
      'POLY_PASSPHRASE': passphrase,
      'POLY_TIMESTAMP': ts.toString(),
      'POLY_SIGNATURE': sig,
    };

    console.log('[TRADE] Before fetch:', {
      eoa: ownerAddress,
      keySuffix: suffix(key),
      passSuffix: suffix(passphrase),
      ts,
      preimageFirst120: preimage.slice(0, 120),
      sigB64First12: sig.slice(0, 12),
      dbKey
    });

    let r = await fetch(url, { method, headers: hdrs, body: rawBody });
    const text = await r.text();
    let upstream = tryJson(text);
    const cf = {
      'cf-ray': r.headers.get('cf-ray') || '',
      'cf-cache-status': r.headers.get('cf-cache-status') || '',
      'server': r.headers.get('server') || '',
      'content-type': r.headers.get('content-type') || ''
    };

    // On 401: derive → REBIND → retry ONCE
    if (r.status === 401) {
      console.log('[TRADE-401] Attempting derive → rebind → retry...');
      const d = await fetch(`${CLOB}/auth/derive-api-key`, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'POLY_ADDRESS': ownerAddress },
      });
      const dUp = await d.json();
      if (!d.ok || !dUp.apiKey || !dUp.secret || !dUp.passphrase) {
        console.error('[DERIVE-FAILED]', d.status, dUp);
        return out({
          url,
          method,
          sent: {
            POLY_ADDRESS: ownerAddress,
            POLY_API_KEY_suffix: suffix(key),
            POLY_PASSPHRASE_suffix: suffix(passphrase),
            POLY_TIMESTAMP: hdrs.POLY_TIMESTAMP,
            POLY_SIGNATURE_b64_first12: hdrs.POLY_SIGNATURE.slice(0, 12),
            preimage_first120: ((globalThis as any).__PREIMAGE || '').slice(0, 120)
          },
          status: r.status,
          statusText: r.statusText,
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
      const sig2 = await hmacBase64(secret, pre2);

      hdrs['POLY_API_KEY'] = key;
      hdrs['POLY_PASSPHRASE'] = passphrase;
      hdrs['POLY_TIMESTAMP'] = ts2.toString();
      hdrs['POLY_SIGNATURE'] = sig2;

      console.log('[TRADE-RETRY] After derive:', {
        eoa: ownerAddress,
        keySuffix: suffix(key),
        passSuffix: suffix(passphrase),
        ts: ts2,
        preimageFirst120: pre2.slice(0, 120),
        sigB64First12: sig2.slice(0, 12),
      });

      r = await fetch(url, { method, headers: hdrs, body: rawBody });
      const text2 = await r.text();
      upstream = tryJson(text2);

      if (r.ok) {
        // Persist new tuple atomically
        await supabase
          .from('user_polymarket_credentials')
          .update({
            api_credentials_key: key,
            api_credentials_secret: secret,
            api_credentials_passphrase: passphrase,
            wallet_address: ownerAddress,
          })
          .eq('user_id', userId);
        console.log('[DB-UPDATED] Persisted derived credentials');
      }
    }

    if (!r.ok) {
      console.error('[TRADE] FAILED:', r.status, upstream);
    } else {
      console.log('[TRADE] ✓ Success:', upstream);
    }

    return out({
      success: r.ok,
      url,
      method,
      sent: {
        POLY_ADDRESS: ownerAddress,
        POLY_API_KEY_suffix: suffix(key),
        POLY_PASSPHRASE_suffix: suffix(passphrase),
        POLY_TIMESTAMP: hdrs.POLY_TIMESTAMP,
        POLY_SIGNATURE_b64_first12: hdrs.POLY_SIGNATURE.slice(0, 12),
        preimage_first120: ((globalThis as any).__PREIMAGE || '').slice(0, 120)
      },
      status: r.status,
      statusText: r.statusText,
      cf,
      upstream
    });

  } catch (e: any) {
    console.error('[ERROR] polymarket-trade crashed:', e);
    return out({ ok: false, error: 'EdgeCrash', message: e?.message, stack: e?.stack }, 500);
  }
});
