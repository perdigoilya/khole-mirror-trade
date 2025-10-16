import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLOB = 'https://clob.polymarket.com';

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
    const { data: credsRow, error: credsErr } = await supabase
      .from('user_polymarket_credentials')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsErr || !credsRow) {
      return out({ error: 'No credentials found', details: credsErr?.message }, 400);
    }

    const key = credsRow.api_credentials_key || credsRow.api_key;
    const secret = credsRow.api_credentials_secret;
    const passphrase = credsRow.api_credentials_passphrase;
    const ownerAddress = (credsRow.wallet_address || '').toLowerCase();

    if (!key || !secret || !passphrase) {
      return out({ error: 'Incomplete credentials', details: { key: !!key, secret: !!secret, passphrase: !!passphrase } }, 400);
    }

    console.log('[L2-KEYCHECK] Testing stored tuple for user', userId);

    const method = 'GET';
    const path = '/auth/api-keys';
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

    console.log('[L2-KEYCHECK] Headers:', {
      eoa: ownerAddress,
      keySuffix: suffix(key),
      passSuffix: suffix(passphrase),
      ts,
      preimageFirst120: preimage.slice(0, 120),
      sigB64First12: sig.slice(0, 12),
    });

    const r = await fetch(`${CLOB}${path}`, { method, headers: hdrs });
    const text = await r.text();
    const upstream = tryJson(text);
    const cf = {
      'cf-ray': r.headers.get('cf-ray') || '',
      'cf-cache-status': r.headers.get('cf-cache-status') || '',
      'server': r.headers.get('server') || '',
      'content-type': r.headers.get('content-type') || ''
    };

    console.log(`[L2-KEYCHECK] ${r.ok ? '✓' : '✗'} status=${r.status}`);

    return out({
      url: `${CLOB}${path}`,
      method,
      sent: {
        POLY_ADDRESS: ownerAddress,
        POLY_API_KEY_suffix: suffix(key),
        POLY_PASSPHRASE_suffix: suffix(passphrase),
        POLY_TIMESTAMP: hdrs.POLY_TIMESTAMP,
        POLY_SIGNATURE_b64_first12: sig.slice(0, 12),
        preimage_first120: preimage.slice(0, 120)
      },
      status: r.status,
      statusText: r.statusText,
      cf,
      upstream
    }, r.status);

  } catch (e: any) {
    console.error('[ERROR] polymarket-l2-keycheck crashed:', e);
    return out({ ok: false, error: 'EdgeCrash', message: e?.message, stack: e?.stack }, 500);
  }
});
