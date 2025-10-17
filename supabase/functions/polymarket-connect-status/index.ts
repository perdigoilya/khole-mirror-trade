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
    const funderAddress = (credsRow?.funder_address || '').toLowerCase();

    if (!key || !secret || !passphrase) {
      return out({ error: 'Missing L2 credentials', details: { key: !!key, secret: !!secret, passphrase: !!passphrase } }, 400);
    }

    if (ownerAddress !== eoaLower) {
      return out({ error: 'OwnerMismatch', details: { ownerAddress, eoaLower } }, 400);
    }

    // Step 1: Prepare credential checks (do not gate trading on /auth/api-keys)
    let tradingEnabled = false;
    let closed_only = false;
    let apiKeysCheck = { ok: false, status: 0, body: null as any };
    let banStatusCheck = { ok: false, status: 0, body: null as any };
    let usedAddress = '';

    const method1 = 'GET';
    const path1 = '/auth/api-keys';
    const ts1 = Math.floor(Date.now() / 1000);

    const tryApiKeys = async (addr: string) => {
      // Standard format: method+path+timestamp
      const preimageA1 = `${method1}${path1}${ts1}`;
      const sigA1 = await hmacBase64(secret, preimageA1);
      const hdrsA1: Record<string, string> = {
        'Accept': 'application/json',
        'POLY_ADDRESS': addr,
        'POLY_API_KEY': key,
        'POLY_PASSPHRASE': passphrase,
        'POLY_TIMESTAMP': ts1.toString(),
        'POLY_SIGNATURE': sigA1,
      };
      console.log('[API-KEYS-CHECK:A1]', { addr, ts: ts1, preimage: preimageA1.slice(0,120), sig: sigA1.slice(0,12) });
      const r1 = await fetch(`${CLOB}${path1}`, { method: method1, headers: hdrsA1 });
      const t1 = await r1.text();
      const b1 = tryJson(t1);
      if (r1.ok) {
        apiKeysCheck = { ok: true, status: r1.status, body: b1 };
        usedAddress = addr; // prefer this address for ban-status
        return true;
      }
      console.warn('[API-KEYS-CHECK:A1] Failed', r1.status, b1);

      // Alt format: timestamp+method+path
      const preimageA2 = `${ts1}${method1}${path1}`;
      const sigA2 = await hmacBase64(secret, preimageA2);
      const hdrsA2: Record<string, string> = {
        'Accept': 'application/json',
        'POLY_ADDRESS': addr,
        'POLY_API_KEY': key,
        'POLY_PASSPHRASE': passphrase,
        'POLY_TIMESTAMP': ts1.toString(),
        'POLY_SIGNATURE': sigA2,
      };
      console.log('[API-KEYS-CHECK:A2]', { addr, ts: ts1, preimage: preimageA2.slice(0,120), sig: sigA2.slice(0,12) });
      const r2 = await fetch(`${CLOB}${path1}`, { method: method1, headers: hdrsA2 });
      const t2 = await r2.text();
      const b2 = tryJson(t2);
      apiKeysCheck = { ok: r2.ok, status: r2.status, body: b2 };
      if (r2.ok) {
        usedAddress = addr;
        return true;
      }
      console.error('[API-KEYS-CHECK] Both formats failed for', addr, r2.status, b2);
      return false;
    };

    // Try API keys with owner first, then funder (advisory only)
    await tryApiKeys(ownerAddress);
    if (!apiKeysCheck.ok && funderAddress && funderAddress !== ownerAddress) {
      await tryApiKeys(funderAddress);
    }

    // Step 2: Authoritative ban-status check (determines tradingEnabled)
    const method2 = 'GET';
    const path2 = '/auth/ban-status/closed-only';

    const tryBanStatus = async (addr: string) => {
      const ts2 = Math.floor(Date.now() / 1000);

      // Standard ban-status
      const preimageB1 = `${method2}${path2}${ts2}`;
      const sigB1 = await hmacBase64(secret, preimageB1);
      const hdrsB1: Record<string, string> = {
        'Accept': 'application/json',
        'POLY_ADDRESS': addr,
        'POLY_API_KEY': key,
        'POLY_PASSPHRASE': passphrase,
        'POLY_TIMESTAMP': ts2.toString(),
        'POLY_SIGNATURE': sigB1,
      };
      console.log('[BAN-STATUS-CHECK:B1]', { addr, ts: ts2 });
      try {
        let rB1 = await fetch(`${CLOB}${path2}`, { method: method2, headers: hdrsB1 });
        let txtB1 = await rB1.text();
        let bodyB1 = tryJson(txtB1);
        if (rB1.ok) {
          banStatusCheck = { ok: true, status: rB1.status, body: bodyB1 };
          closed_only = bodyB1?.closed_only === true || bodyB1?.closedOnly === true;
          usedAddress = addr;
          return true;
        }
        // Alt ban-status
        const preimageB2 = `${ts2}${method2}${path2}`;
        const sigB2 = await hmacBase64(secret, preimageB2);
        const hdrsB2: Record<string, string> = { ...hdrsB1, POLY_SIGNATURE: sigB2 };
        console.warn('[BAN-STATUS-CHECK:B1] Failed', rB1.status, bodyB1, 'retrying alt');
        let rB2 = await fetch(`${CLOB}${path2}`, { method: method2, headers: hdrsB2 });
        let txtB2 = await rB2.text();
        let bodyB2 = tryJson(txtB2);
        banStatusCheck = { ok: rB2.ok, status: rB2.status, body: bodyB2 };
        if (rB2.ok) {
          closed_only = bodyB2?.closed_only === true || bodyB2?.closedOnly === true;
          usedAddress = addr;
          return true;
        }
      } catch (e: any) {
        console.error('[BAN-STATUS-CHECK] Request failed:', e.message);
      }
      return false;
    };

    // Determine preferred order for ban-status attempts
    const addressCandidates: string[] = [];
    if (usedAddress) addressCandidates.push(usedAddress);
    if (!addressCandidates.includes(ownerAddress)) addressCandidates.push(ownerAddress);
    if (funderAddress && funderAddress !== ownerAddress && !addressCandidates.includes(funderAddress)) addressCandidates.push(funderAddress);

    for (const addr of addressCandidates) {
      const ok = await tryBanStatus(addr);
      if (ok) break;
    }

    tradingEnabled = banStatusCheck.ok && !closed_only;

    (globalThis as any).__PREIMAGE = `${method1}${path1}${ts1}`;

    return out({
      hasKey,
      hasSecret,
      hasPassphrase,
      ownerAddress,
      connectedEOA: eoaLower,
      ownerMatch,
      closed_only,
      tradingEnabled,
      usedAddress,
      funderAddress,
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
