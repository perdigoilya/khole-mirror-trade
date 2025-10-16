import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLOB = 'https://clob.polymarket.com';
const ENV = Deno.env.get('DENO_DEPLOYMENT_ID')?.slice(0, 8) || 'local';

// Helper: HMAC-SHA256 -> standard base64
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
    const { walletAddress, signature, timestamp, nonce = 0 } = await req.json();

    if (!walletAddress || !signature || !timestamp) {
      return out({ problem: 'Missing required parameters', details: { walletAddress, signature, timestamp } }, 400);
    }

    const eoa = walletAddress;
    const now = Math.floor(Date.now() / 1000);
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || ts <= 0) {
      return out({ problem: 'Invalid timestamp format - must be epoch seconds', details: { ts } }, 400);
    }
    if (Math.abs(now - ts) > 60) {
      return out({ 
        problem: 'Timestamp drift too large',
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
    const ts2 = Math.floor(Date.now() / 1000);
    const method = 'GET';
    const path = '/auth/api-keys';
    const preimage = `${method}${path}${ts2}`;
    (globalThis as any).__PREIMAGE = preimage;

    const sig = await hmacBase64(secret, preimage);
    const hdrs = {
      'Accept': 'application/json',
      'POLY_ADDRESS': eoa,
      'POLY_API_KEY': key,
      'POLY_PASSPHRASE': passphrase,
      'POLY_TIMESTAMP': ts2.toString(),
      'POLY_SIGNATURE': sig,
    };

    console.log('[L2-VERIFY] Headers:', {
      eoa,
      keySuffix: suffix(hdrs.POLY_API_KEY),
      passSuffix: passphrase.slice(-4),
      ts: ts2,
      preimageFirst120: preimage.slice(0, 120),
      sigB64First12: sig.slice(0, 12),
    });

    const verifyResp = await fetch(`${CLOB}${path}`, { method, headers: hdrs });
    const verifyText = await verifyResp.text();
    const upstream = verifyText ? JSON.parse(verifyText) : null;

    if (!verifyResp.ok) {
      console.error('[L2-VERIFY] FAILED:', verifyResp.status, upstream);
      return out({
        error: 'Derived credentials verification failed',
        status: verifyResp.status,
        details: 'Derived credentials failed inline test. Do not save.',
        upstream
      }, 401);
    }

    console.log('[L2-VERIFY] ✓ Credentials verified, safe to persist');

    // Fetch proxy (funder) address
    let funderAddress = eoa;
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
