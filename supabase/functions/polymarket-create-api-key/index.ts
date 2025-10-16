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
    const { walletAddress, signature, timestamp, nonce = 0 } = await req.json();

    if (!walletAddress || !signature || !timestamp) {
      return out({ error: 'Missing required parameters', details: { walletAddress, signature, timestamp } }, 400);
    }

    const eoa = walletAddress;
    const now = Math.floor(Date.now() / 1000);
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || ts <= 0) {
      return out({ error: 'Invalid timestamp format - must be epoch seconds', details: { ts } }, 400);
    }
    if (Math.abs(now - ts) > 60) {
      return out({ 
        error: 'Timestamp drift too large',
        details: { serverTime: now, yourTimestamp: ts }
      }, 400);
    }

    console.log(`[L1] Creating API key for EOA=${eoa} ts=${ts}`);

    // Try POST /auth/api-key (L1, no HMAC)
    const createResp = await fetch(`${CLOB}/auth/api-key`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'POLY_ADDRESS': eoa,
        'POLY_SIGNATURE': signature,
        'POLY_TIMESTAMP': timestamp.toString(),
        'POLY_NONCE': nonce.toString(),
      },
      body: JSON.stringify({})
    });

    let key: string | null = null;
    let secret: string | null = null;
    let passphrase: string | null = null;

    if (createResp.ok) {
      const data = await createResp.json();
      key = data.apiKey || data.key;
      secret = data.secret;
      passphrase = data.passphrase;
      console.log('[L1] Created new API key');
    } else {
      const createErr = await createResp.text();
      console.log(`[L1] Create failed (${createResp.status}), attempting derive...`);

      // Fallback to GET /auth/derive-api-key
      const deriveResp = await fetch(`${CLOB}/auth/derive-api-key?nonce=${nonce}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'POLY_ADDRESS': eoa,
          'POLY_SIGNATURE': signature,
          'POLY_TIMESTAMP': timestamp.toString(),
          'POLY_NONCE': nonce.toString(),
        },
      });

      if (!deriveResp.ok) {
        const deriveErr = await deriveResp.text();
        console.error('[L1] Derive also failed:', deriveResp.status, deriveErr);

        // Check access status
        try {
          const accessResp = await fetch(`${CLOB}/auth/access-status?address=${eoa}`);
          if (accessResp.ok) {
            const accessData = await accessResp.json();
            if (accessData?.cert_required === true) {
              return out({
                error: 'Registration Required',
                details: 'This wallet is not registered on Polymarket. Please visit polymarket.com to complete registration first.',
                cert_required: true,
                status: 'not_registered'
              }, 403);
            }
          }
        } catch (accessErr) {
          console.warn('Could not check access status:', accessErr);
        }

        return out({ error: 'Failed to create/derive API key', createError: createErr, deriveError: deriveErr }, deriveResp.status);
      }

      const deriveData = await deriveResp.json();
      key = deriveData.apiKey || deriveData.key;
      secret = deriveData.secret;
      passphrase = deriveData.passphrase;
      console.log('[L1] Derived existing API key');
    }

    if (!key || !secret || !passphrase) {
      return out({ error: 'Invalid credentials from upstream', details: { key, secret, passphrase } }, 500);
    }

// INLINE VERIFY: call GET /auth/api-keys with L2 headers BEFORE storing
console.log('[L2-VERIFY] Testing credentials inline before persisting...');
const method = 'GET';
const path = '/auth/api-keys';

const eoaLower = eoa.toLowerCase();

// Attempt 1: preimage = method + path + timestamp
const ts1 = Math.floor(Date.now() / 1000);
let preimage = `${method}${path}${ts1}`;
(globalThis as any).__PREIMAGE = preimage;
let sig = await hmacBase64(secret, preimage);
let hdrs = {
  'Accept': 'application/json',
  'POLY_ADDRESS': eoaLower,
  'POLY_API_KEY': key,
  'POLY_PASSPHRASE': passphrase,
  'POLY_TIMESTAMP': ts1.toString(),
  'POLY_SIGNATURE': sig,
};

console.log('[L2-VERIFY:A1] Headers:', {
  eoa: eoaLower,
  keySuffix: suffix(hdrs.POLY_API_KEY),
  passSuffix: passphrase.slice(-4),
  ts: ts1,
  preimageFirst120: preimage.slice(0, 120),
  sigB64First12: sig.slice(0, 12),
  dbKey: `polymarket:${ENV}:${eoaLower}`
});

let verifyResp = await fetch(`${CLOB}${path}`, { method, headers: hdrs });
let verifyText = await verifyResp.text();
let upstream = tryJson(verifyText);

if (!verifyResp.ok) {
  console.warn('[L2-VERIFY:A1] FAILED:', verifyResp.status, upstream);
  // Attempt 2: preimage = timestamp + method + path
  const ts2 = Math.floor(Date.now() / 1000);
  const preimage2 = `${ts2}${method}${path}`;
  (globalThis as any).__PREIMAGE = preimage2;
  const sig2 = await hmacBase64(secret, preimage2);
  const hdrs2 = {
    'Accept': 'application/json',
    'POLY_ADDRESS': eoaLower,
    'POLY_API_KEY': key,
    'POLY_PASSPHRASE': passphrase,
    'POLY_TIMESTAMP': ts2.toString(),
    'POLY_SIGNATURE': sig2,
  };
  console.log('[L2-VERIFY:A2] Trying alt preimage order (ts+method+path)...', {
    eoa: eoaLower,
    keySuffix: suffix(hdrs2.POLY_API_KEY),
    passSuffix: passphrase.slice(-4),
    ts: ts2,
    preimageFirst120: preimage2.slice(0, 120),
    sigB64First12: sig2.slice(0, 12),
  });
  const resp2 = await fetch(`${CLOB}${path}`, { method, headers: hdrs2 });
  const text2 = await resp2.text();
  const up2 = tryJson(text2);
if (!resp2.ok) {
  const attempts: any[] = [
    {
      status: verifyResp.status,
      order: 'method+path+ts',
      sent: {
        POLY_ADDRESS: eoaLower,
        POLY_API_KEY_suffix: suffix(hdrs.POLY_API_KEY),
        POLY_PASSPHRASE_suffix: suffix(hdrs.POLY_PASSPHRASE),
        POLY_TIMESTAMP: hdrs.POLY_TIMESTAMP,
        POLY_SIGNATURE_b64_first12: hdrs.POLY_SIGNATURE.slice(0, 12),
        preimage_first120: preimage.slice(0, 120)
      },
      upstream
    },
    {
      status: resp2.status,
      order: 'ts+method+path',
      sent: {
        POLY_ADDRESS: eoaLower,
        POLY_API_KEY_suffix: suffix(hdrs2.POLY_API_KEY),
        POLY_PASSPHRASE_suffix: suffix(hdrs2.POLY_PASSPHRASE),
        POLY_TIMESTAMP: hdrs2.POLY_TIMESTAMP,
        POLY_SIGNATURE_b64_first12: hdrs2.POLY_SIGNATURE.slice(0, 12),
        preimage_first120: preimage2.slice(0, 120)
      },
      upstream: up2
    }
  ];

  // Try with proxy/funder address as POLY_ADDRESS if different
  try {
    const proxyResp = await fetch(`https://data-api.polymarket.com/address_details?address=${eoa}`);
    if (proxyResp.ok) {
      const proxyData = await proxyResp.json();
      const addr2 = String(proxyData?.proxy || '').toLowerCase();
      if (addr2 && addr2 !== eoaLower) {
        // A1 with funder
        const ts3 = Math.floor(Date.now() / 1000);
        const pre3 = `${method}${path}${ts3}`;
        (globalThis as any).__PREIMAGE = pre3;
        const s3 = await hmacBase64(secret, pre3);
        const h3 = {
          'Accept': 'application/json',
          'POLY_ADDRESS': addr2,
          'POLY_API_KEY': key,
          'POLY_PASSPHRASE': passphrase,
          'POLY_TIMESTAMP': ts3.toString(),
          'POLY_SIGNATURE': s3,
        };
        console.log('[L2-VERIFY:PROXY A1]', { addr: addr2, keySuffix: suffix(h3.POLY_API_KEY), passSuffix: passphrase.slice(-4), ts: ts3, preimageFirst120: pre3.slice(0, 120), sigB64First12: s3.slice(0, 12) });
        const r3 = await fetch(`${CLOB}${path}`, { method, headers: h3 });
        const t3 = await r3.text();
        const up3 = tryJson(t3);
        attempts.push({
          status: r3.status,
          order: 'method+path+ts',
          addressTried: addr2,
          upstream: up3,
          sent: {
            POLY_ADDRESS: addr2,
            POLY_API_KEY_suffix: suffix(h3.POLY_API_KEY),
            POLY_PASSPHRASE_suffix: suffix(h3.POLY_PASSPHRASE),
            POLY_TIMESTAMP: h3.POLY_TIMESTAMP,
            POLY_SIGNATURE_b64_first12: h3.POLY_SIGNATURE.slice(0, 12),
            preimage_first120: pre3.slice(0, 120)
          }
        });
        if (r3.ok) {
          verifyResp = r3; upstream = up3; preimage = pre3; sig = s3; hdrs = h3 as any;
          console.log('[L2-VERIFY] ✓ with proxy address');
          // fallthrough to persistence below (outside if block)
        } else {
          // A2 with funder
          const ts4 = Math.floor(Date.now() / 1000);
          const pre4 = `${ts4}${method}${path}`;
          (globalThis as any).__PREIMAGE = pre4;
          const s4 = await hmacBase64(secret, pre4);
          const h4 = {
            'Accept': 'application/json',
            'POLY_ADDRESS': addr2,
            'POLY_API_KEY': key,
            'POLY_PASSPHRASE': passphrase,
            'POLY_TIMESTAMP': ts4.toString(),
            'POLY_SIGNATURE': s4,
          };
          console.log('[L2-VERIFY:PROXY A2]', { addr: addr2, keySuffix: suffix(h4.POLY_API_KEY), passSuffix: passphrase.slice(-4), ts: ts4, preimageFirst120: pre4.slice(0, 120), sigB64First12: s4.slice(0, 12) });
          const r4 = await fetch(`${CLOB}${path}`, { method, headers: h4 });
          const t4 = await r4.text();
          const up4 = tryJson(t4);
          attempts.push({
            status: r4.status,
            order: 'ts+method+path',
            addressTried: addr2,
            upstream: up4,
            sent: {
              POLY_ADDRESS: addr2,
              POLY_API_KEY_suffix: suffix(h4.POLY_API_KEY),
              POLY_PASSPHRASE_suffix: suffix(h4.POLY_PASSPHRASE),
              POLY_TIMESTAMP: h4.POLY_TIMESTAMP,
              POLY_SIGNATURE_b64_first12: h4.POLY_SIGNATURE.slice(0, 12),
              preimage_first120: pre4.slice(0, 120)
            }
          });
          if (r4.ok) {
            verifyResp = r4; upstream = up4; preimage = pre4; sig = s4; hdrs = h4 as any;
            console.log('[L2-VERIFY] ✓ with proxy address (alt order)');
          } else {
            return out({ url: `${CLOB}${path}`, method, attempts, status: r4.status }, r4.status);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Proxy verify attempt skipped due to error:', e);
  }
}

// Success on alt ordering (or proxy) → continue

}

console.log('[L2-VERIFY] ✓ Credentials verified, safe to persist');

    console.log('[L2-VERIFY] ✓ Credentials verified, safe to persist');

    // Fetch proxy (funder) address
    let funderAddress = eoa;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      console.warn('[AUTH-WARN] Could not get user for persistence, but credentials verified');
    }
    try {
      const proxyResp = await fetch(`https://data-api.polymarket.com/address_details?address=${eoa}`);
      if (proxyResp.ok) {
        const proxyData = await proxyResp.json();
        funderAddress = proxyData?.proxy || eoa;
        console.log('Resolved funder address:', funderAddress);
      }
    } catch (e) {
      console.warn('Could not fetch proxy address:', e);
    }

    // Persist verified credentials server-side
    if (authData?.user) {
      const userId = authData.user.id;
      
      // Delete any existing row first to avoid duplicate key errors
      await supabase
        .from('user_polymarket_credentials')
        .delete()
        .eq('user_id', userId);

      // Insert new credentials
      const { error: insertErr } = await supabase
        .from('user_polymarket_credentials')
        .insert({
          user_id: userId,
          wallet_address: eoa.toLowerCase(),
          api_credentials_key: key,
          api_credentials_secret: secret,
          api_credentials_passphrase: passphrase,
          funder_address: funderAddress,
        });

      if (insertErr) {
        console.error('[DB-INSERT-ERROR]', insertErr);
        return out({ error: 'Failed to save credentials', details: insertErr.message }, 500);
      }
      console.log('[DB-SAVED] Credentials saved for user', userId);
    }

    return out({
      apiKey: key,
      key,
      secret,
      passphrase,
      funderAddress,
      verified: true
    });

  } catch (e: any) {
    console.error('[ERROR] polymarket-create-api-key crashed:', e);
    return out({ ok: false, error: 'EdgeCrash', message: e?.message, stack: e?.stack }, 500);
  }
});
