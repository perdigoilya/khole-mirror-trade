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
    const { connectedEOA } = await req.json().catch(() => ({ connectedEOA: null }));
    const eoaLower = (connectedEOA || '').toLowerCase();
    const dbKey = `polymarket:${ENV}:${eoaLower}`;

    console.log(`[CONNECT-STATUS] user=${userId} eoa=${eoaLower} dbKey=${dbKey}`);

    const { data: credsRow, error: credsErr } = await supabase
      .from('user_polymarket_credentials')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsErr) {
      console.error(`[DB-ERROR] user=${userId} reason=error details=${credsErr.message}`);
      return out({
        hasKey: false,
        hasSecret: false,
        hasPassphrase: false,
        ownerAddress: '',
        connectedEOA: eoaLower,
        ownerMatch: false,
        closed_only: false,
        tradingEnabled: false,
        error: 'Database error',
        details: credsErr.message
      });
    }

    const hasKey = !!(credsRow?.api_credentials_key || credsRow?.api_key);
    const hasSecret = !!credsRow?.api_credentials_secret;
    const hasPassphrase = !!credsRow?.api_credentials_passphrase;
    const ownerAddress = (credsRow?.wallet_address || '').toLowerCase();
    const ownerMatch = !!(ownerAddress && eoaLower && ownerAddress === eoaLower);

    if (!credsRow) {
      console.log(`[CREDS-MISSING] user=${userId} reason=no_row`);
    } else {
      console.log(`[CREDS-READ] user=${userId} hasKey=${hasKey} hasSecret=${hasSecret} hasPassphrase=${hasPassphrase} ownerAddress=${ownerAddress} eoaLower=${eoaLower} ownerMatch=${ownerMatch}`);
    }

    if (!hasKey || !hasSecret || !hasPassphrase) {
      return out({
        hasKey,
        hasSecret,
        hasPassphrase,
        ownerAddress,
        connectedEOA: eoaLower,
        ownerMatch,
        closed_only: false,
        tradingEnabled: false,
      });
    }

    let key = credsRow.api_credentials_key || credsRow.api_key;
    let secret = credsRow.api_credentials_secret;
    let passphrase = credsRow.api_credentials_passphrase;

    if (!key || !secret || !passphrase) {
      return out({ error: 'Missing L2 credentials', details: { key: !!key, secret: !!secret, passphrase: !!passphrase } }, 400);
    }

    if (ownerAddress !== eoaLower) {
      return out({ error: 'OwnerMismatch', details: { ownerAddress, eoaLower } }, 400);
    }

    // L2 sanity check: GET /auth/ban-status/closed-only
    const method = 'GET';
    const path = '/auth/ban-status/closed-only';
    const ts = Math.floor(Date.now() / 1000);
    const preimage = `${method}${path}${ts}`;
    (globalThis as any).__PREIMAGE = preimage;

    const sig = await hmacBase64(secret, preimage);
    const hdrs: Record<string, string> = {
      'Accept': 'application/json',
      'POLY_ADDRESS': ownerAddress,
      'POLY_API_KEY': key,
      'POLY_PASSPHRASE': passphrase,
      'POLY_TIMESTAMP': ts.toString(),
      'POLY_SIGNATURE': sig,
    };

    console.log('[L2-SANITY] Before fetch:', {
      eoa: ownerAddress,
      keySuffix: suffix(key),
      passSuffix: suffix(passphrase),
      ts,
      preimageFirst120: preimage.slice(0, 120),
      sigB64First12: sig.slice(0, 12),
      dbKey
    });

    let r = await fetch(`${CLOB}${path}`, { method, headers: hdrs });
    const text = await r.text();
    let upstream = tryJson(text);
    const cf = {
      'cf-ray': r.headers.get('cf-ray') || '',
      'cf-cache-status': r.headers.get('cf-cache-status') || '',
      'server': r.headers.get('server') || '',
      'content-type': r.headers.get('content-type') || ''
    };

    let closed_only = false;
    let tradingEnabled = false;

    // On 401: derive → REBIND → retry ONCE
    if (r.status === 401) {
      console.log('[L2-401] Attempting derive → rebind → retry...');
      const d = await fetch(`${CLOB}/auth/derive-api-key`, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'POLY_ADDRESS': ownerAddress },
      });
      const dUp = await d.json();
      if (!d.ok || !dUp.apiKey || !dUp.secret || !dUp.passphrase) {
        console.error('[DERIVE-FAILED]', d.status, dUp);
        return out({
          hasKey,
          hasSecret,
          hasPassphrase,
          ownerAddress,
          connectedEOA: eoaLower,
          ownerMatch,
          closed_only: false,
          tradingEnabled: false,
          attempts: [{ status: r.status, upstream, cf }, { deriveError: dUp }]
        });
      }

      // REBIND locals
      key = dUp.apiKey;
      secret = dUp.secret;
      passphrase = dUp.passphrase;

      const ts2 = Math.floor(Date.now() / 1000);
      const pre2 = `${method}${path}${ts2}`;
      (globalThis as any).__PREIMAGE = pre2;
      const sig2 = await hmacBase64(secret, pre2);

      hdrs['POLY_API_KEY'] = key;
      hdrs['POLY_PASSPHRASE'] = passphrase;
      hdrs['POLY_TIMESTAMP'] = ts2.toString();
      hdrs['POLY_SIGNATURE'] = sig2;

      console.log('[L2-RETRY] After derive:', {
        eoa: ownerAddress,
        keySuffix: suffix(key),
        passSuffix: suffix(passphrase),
        ts: ts2,
        preimageFirst120: pre2.slice(0, 120),
        sigB64First12: sig2.slice(0, 12),
      });

      r = await fetch(`${CLOB}${path}`, { method, headers: hdrs });
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

    if (r.ok) {
      closed_only = upstream?.closed_only === true || upstream?.closedOnly === true;
      tradingEnabled = hasKey && hasSecret && hasPassphrase && ownerMatch && !closed_only;
      console.log('[L2-SANITY] ✓ Success:', { closed_only, tradingEnabled });
    } else {
      console.error('[L2-SANITY] FAILED:', r.status, upstream);
    }

    return out({
      hasKey,
      hasSecret,
      hasPassphrase,
      ownerAddress,
      connectedEOA: eoaLower,
      ownerMatch,
      closed_only,
      tradingEnabled,
      url: `${CLOB}${path}`,
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
    console.error('[ERROR] polymarket-connect-status crashed:', e);
    return out({ ok: false, error: 'EdgeCrash', message: e?.message, stack: e?.stack }, 500);
  }
});
