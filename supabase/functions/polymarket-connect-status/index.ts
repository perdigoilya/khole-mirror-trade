import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLOB = 'https://clob.polymarket.com';
const ENV = Deno.env.get('DENO_DEPLOYMENT_ID')?.slice(0, 8) || 'local';

async function hmacBase64(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  // Normalize base64url to standard base64
  let normalized = secret.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) normalized += '=';
  
  const isB64 = /^[A-Za-z0-9+/]+={0,2}$/.test(normalized);
  let secretBytes: Uint8Array;
  if (isB64) {
    const raw = atob(normalized);
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

    // Step 1: Validate credentials with GET /auth/api-keys (most reliable)
    let tradingEnabled = false;
    let closed_only = false;
    let apiKeysCheck = { ok: false, status: 0, body: null as any };
    let banStatusCheck = { ok: false, status: 0, body: null as any };

    const method1 = 'GET';
    const path1 = '/auth/api-keys';
    const ts1 = Math.floor(Date.now() / 1000);
    const preimage1 = `${method1}${path1}${ts1}`;
    const sig1 = await hmacBase64(secret, preimage1);
    
    const hdrs1: Record<string, string> = {
      'Accept': 'application/json',
      'POLY_ADDRESS': ownerAddress,
      'POLY_API_KEY': key,
      'POLY_PASSPHRASE': passphrase,
      'POLY_TIMESTAMP': ts1.toString(),
      'POLY_SIGNATURE': sig1,
    };

    console.log('[API-KEYS-CHECK] Validating credentials:', {
      eoa: ownerAddress,
      keySuffix: suffix(key),
      passSuffix: suffix(passphrase),
      ts: ts1,
      preimage: preimage1.slice(0, 120),
      sig: sig1.slice(0, 12),
    });

    try {
      const r1 = await fetch(`${CLOB}${path1}`, { method: method1, headers: hdrs1 });
      const text1 = await r1.text();
      const body1 = tryJson(text1);
      apiKeysCheck = { ok: r1.ok, status: r1.status, body: body1 };

      if (r1.ok) {
        console.log('[API-KEYS-CHECK] ✓ Credentials valid');
        tradingEnabled = true; // Key tuple is valid
      } else {
        console.error('[API-KEYS-CHECK] ✗ Invalid credentials:', r1.status, body1);
      }
    } catch (e: any) {
      console.error('[API-KEYS-CHECK] Request failed:', e.message);
    }

    // Step 2: Check ban-status (only if credentials are valid)
    if (tradingEnabled) {
      const method2 = 'GET';
      const path2 = '/auth/ban-status/closed-only';
      const ts2 = Math.floor(Date.now() / 1000);
      const preimage2 = `${method2}${path2}${ts2}`;
      const sig2 = await hmacBase64(secret, preimage2);
      
      const hdrs2: Record<string, string> = {
        'Accept': 'application/json',
        'POLY_ADDRESS': ownerAddress,
        'POLY_API_KEY': key,
        'POLY_PASSPHRASE': passphrase,
        'POLY_TIMESTAMP': ts2.toString(),
        'POLY_SIGNATURE': sig2,
      };

      console.log('[BAN-STATUS-CHECK] Checking account status:', {
        eoa: ownerAddress,
        ts: ts2,
      });

      try {
        const r2 = await fetch(`${CLOB}${path2}`, { method: method2, headers: hdrs2 });
        const text2 = await r2.text();
        const body2 = tryJson(text2);
        banStatusCheck = { ok: r2.ok, status: r2.status, body: body2 };

        if (r2.ok) {
          closed_only = body2?.closed_only === true || body2?.closedOnly === true;
          if (closed_only) {
            tradingEnabled = false; // Account restricted
            console.log('[BAN-STATUS-CHECK] ⚠️ Account in closed-only mode');
          } else {
            console.log('[BAN-STATUS-CHECK] ✓ Account unrestricted');
          }
        } else {
          // If ban-status fails but api-keys worked, keep tradingEnabled=true with warning
          console.warn('[BAN-STATUS-CHECK] ⚠️ Could not check ban status:', r2.status);
        }
      } catch (e: any) {
        console.error('[BAN-STATUS-CHECK] Request failed:', e.message);
      }
    }

    (globalThis as any).__PREIMAGE = apiKeysCheck.ok ? `${method1}${path1}${ts1}` : '';

    return out({
      hasKey,
      hasSecret,
      hasPassphrase,
      ownerAddress,
      connectedEOA: eoaLower,
      ownerMatch,
      closed_only,
      tradingEnabled,
      validation: {
        apiKeysCheck: {
          ok: apiKeysCheck.ok,
          status: apiKeysCheck.status,
          message: apiKeysCheck.ok ? 'Credentials valid' : 'Invalid credentials'
        },
        banStatusCheck: {
          ok: banStatusCheck.ok,
          status: banStatusCheck.status,
          closed_only,
          message: banStatusCheck.ok 
            ? (closed_only ? 'Account restricted' : 'Account unrestricted') 
            : 'Could not verify ban status'
        }
      }
    });

  } catch (e: any) {
    console.error('[ERROR] polymarket-connect-status crashed:', e);
    return out({ ok: false, error: 'EdgeCrash', message: e?.message, stack: e?.stack }, 500);
  }
});
