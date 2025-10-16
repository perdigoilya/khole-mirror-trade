import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const out = (obj: any, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(obj), { 
    status, 
    headers: { "content-type": "application/json", ...corsHeaders, ...extra }
  });

const safeJson = (t: string) => { try { return JSON.parse(t); } catch { return t; } };
const suffix = (v: any) => typeof v === "string" && v.length > 6 ? v.slice(-6) : v || "";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get authenticated user
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return out({ problem: 'Unauthorized', details: authErr?.message || 'No user' }, 401);
    }

    const userId = authData.user.id;

    // Get the connectedEOA from request body or derive from wallet connection
    const { connectedEOA } = await req.json().catch(() => ({ connectedEOA: null }));

    // Read credentials from DB
    const dbKey = `polymarket:${Deno.env.get('DENO_REGION') || 'unknown'}:${userId}`;
    console.log('DB key for creds:', dbKey);
    
    const { data: credsRow, error: credsErr } = await supabase
      .from('user_polymarket_credentials')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsErr) {
      console.error('CREDS_MISSING user_id=' + userId + ' reason=error details=' + credsErr.message);
      return new Response(
        JSON.stringify({ 
          hasKey: false,
          hasSecret: false,
          hasPassphrase: false,
          ownerAddress: '',
          connectedEOA: (connectedEOA || '').toLowerCase(),
          ownerMatch: false,
          closed_only: false,
          banStatusRaw: {},
          tradingEnabled: false,
          error: 'Database error',
          details: credsErr.message
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Compute booleans from DB (explicit false for nulls, don't expose raw secrets)
    const hasKey = !!(credsRow?.api_credentials_key || credsRow?.api_key);
    const hasSecret = !!credsRow?.api_credentials_secret;
    const hasPassphrase = !!credsRow?.api_credentials_passphrase;
    const ownerAddress = (credsRow?.wallet_address || '').toLowerCase();
    const eoaAddress = (connectedEOA || '').toLowerCase();
    const ownerMatch = !!(ownerAddress && eoaAddress && ownerAddress === eoaAddress);
    
    if (!credsRow) {
      console.log('CREDS_MISSING user_id=' + userId + ' reason=no_row');
    } else {
      console.log('CREDS_READ user_id=' + userId + ' hasKey=' + hasKey + ' hasSecret=' + hasSecret + ' hasPassphrase=' + hasPassphrase + ' ownerAddress=' + ownerAddress + ' eoaAddress=' + eoaAddress + ' ownerMatch=' + ownerMatch);
    }

    console.log('Connect status computed:', { 
      hasKey, 
      hasSecret, 
      hasPassphrase, 
      ownerAddress, 
      eoaAddress, 
      ownerMatch 
    });

    // If no credentials, return early with explicit false values
    if (!hasKey || !hasSecret || !hasPassphrase) {
      return new Response(
        JSON.stringify({
          hasKey: hasKey,
          hasSecret: hasSecret,
          hasPassphrase: hasPassphrase,
          ownerAddress: ownerAddress,
          connectedEOA: eoaAddress,
          ownerMatch: ownerMatch,
          closed_only: false,
          banStatusRaw: {},
          tradingEnabled: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Call CLOB /auth/ban-status/closed-only with L2 auth
    let apiKey = credsRow.api_credentials_key || credsRow.api_key;
    let apiSecret = credsRow.api_credentials_secret;
    let apiPassphrase = credsRow.api_credentials_passphrase;

    // Assert all 3 credentials present
    if (!apiKey || !apiSecret || !apiPassphrase) {
      throw new Error('Missing L2 credentials (key, secret, or passphrase)');
    }

    // Assert owner match
    if (ownerAddress !== eoaAddress) {
      console.error('Owner mismatch:', { ownerAddress, eoaAddress });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'GET';
    const requestPath = '/auth/ban-status/closed-only';
    const preimage = `${method}${requestPath}${timestamp}`;

    let banStatusBody: any = {};
    let closed_only = false;
    let l2SanityPassed = false;
    let l2Debug: any = null;

    const attemptBanStatusCheck = async (key: string, secret: string, pass: string): Promise<{ ok: boolean; diag: any }> => {
      try {
        // Detect if secret is base64 (Polymarket returns base64 secrets)
        const isB64 = /^[A-Za-z0-9+/]+={0,2}$/.test(secret);
        const encoder = new TextEncoder();
        
        let secretBytes: Uint8Array;
        if (isB64) {
          const secretRaw = atob(secret);
          secretBytes = new Uint8Array(secretRaw.length);
          for (let i = 0; i < secretRaw.length; i++) {
            secretBytes[i] = secretRaw.charCodeAt(i);
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

        const ts = Math.floor(Date.now() / 1000);
        const method = 'GET';
        const requestPath = '/auth/ban-status/closed-only';
        const preimage = `${method}${requestPath}${ts}`;
        
        // Store preimage in globalThis for diagnostics
        (globalThis as any).__PREIMAGE = preimage;

        const messageData = encoder.encode(preimage);
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
        const signatureArray = Array.from(new Uint8Array(signature));
        const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureBase64) || (signatureBase64.length % 4) !== 0) {
          return { 
            ok: false, 
            diag: { problem: 'Invalid POLY_SIGNATURE format', details: 'Not standard base64' } 
          };
        }

        const headers = {
          'Accept': 'application/json',
          'POLY_ADDRESS': ownerAddress,
          'POLY_SIGNATURE': signatureBase64,
          'POLY_TIMESTAMP': ts.toString(),
          'POLY_API_KEY': key,
          'POLY_PASSPHRASE': pass,
        };

        const url = 'https://clob.polymarket.com/auth/ban-status/closed-only';

        console.log('L2 ban-status attempt:', {
          eoa: ownerAddress,
          keySuffix: suffix(key),
          passSuffix: suffix(pass),
          ts,
          preimageFirst120: preimage.slice(0, 120),
          sigB64First12: signatureBase64.slice(0, 12),
        });

        const r = await fetch(url, { method, headers });
        const text = await r.text();
        const upstream = safeJson(text);
        
        const cf = {
          "cf-ray": r.headers.get("cf-ray") || "",
          "cf-cache-status": r.headers.get("cf-cache-status") || "",
          "server": r.headers.get("server") || "",
          "content-type": r.headers.get("content-type") || ""
        };

        const diag = {
          url, method,
          sent: {
            POLY_ADDRESS: headers?.POLY_ADDRESS,
            POLY_API_KEY_suffix: suffix(key),
            POLY_PASSPHRASE_suffix: suffix(pass),
            POLY_TIMESTAMP: headers?.POLY_TIMESTAMP,
            POLY_SIGNATURE_b64_first12: signatureBase64.slice(0, 12),
            preimage_first120: preimage.slice(0, 120)
          },
          status: r.status, 
          statusText: r.statusText, 
          cf, 
          upstream
        };

        if (r.ok) {
          banStatusBody = upstream;
          console.log('✓ Ban status response:', JSON.stringify(banStatusBody, null, 2));
          closed_only = banStatusBody?.closed_only === true || banStatusBody?.closedOnly === true;
          return { ok: true, diag };
        } else {
          console.error('Ban status call failed:', diag);
          banStatusBody = { error: text, status: r.status };
          return { ok: false, diag };
        }
      } catch (error) {
        console.error('HMAC signing error:', error);
        const diag = { 
          problem: 'EdgeCrash', 
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        };
        banStatusBody = { error: 'HMAC signing failed', details: error instanceof Error ? error.message : String(error) };
        return { ok: false, diag };
      }
    };

    // First attempt
    const attempts: any[] = [];
    let result = await attemptBanStatusCheck(apiKey, apiSecret, apiPassphrase);
    attempts.push(result.diag);
    l2SanityPassed = result.ok;

    // On 401, try to derive new credentials and retry once
    if (!result.ok && result.diag?.status === 401) {
      console.log('L2 401 detected - attempting auto-recovery via derive-api-key...');
      
      try {
        // Build L1-style headers for derive (no HMAC, just address)
        const deriveResponse = await fetch('https://clob.polymarket.com/auth/derive-api-key', {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'POLY_ADDRESS': ownerAddress,
          },
        });

        if (deriveResponse.ok) {
          const deriveData = await deriveResponse.json();
          if (deriveData.apiKey && deriveData.secret && deriveData.passphrase) {
            console.log('✓ Derived new credentials, updating DB...');
            
            // Update credentials in DB
            const { error: updateError } = await supabase
              .from('user_polymarket_credentials')
              .update({
                api_credentials_key: deriveData.apiKey,
                api_credentials_secret: deriveData.secret,
                api_credentials_passphrase: deriveData.passphrase,
                wallet_address: ownerAddress,
              })
              .eq('user_id', userId);

            if (updateError) {
              console.error('Failed to update derived credentials:', updateError);
            } else {
              // Atomically rebind locals and retry
              apiKey = deriveData.apiKey;
              apiSecret = deriveData.secret;
              apiPassphrase = deriveData.passphrase;
              
              console.log('Retrying ban-status with derived credentials...');
              const retryResult = await attemptBanStatusCheck(apiKey, apiSecret, apiPassphrase);
              attempts.push(retryResult.diag);
              l2SanityPassed = retryResult.ok;
            }
          }
        } else {
          const deriveError = await deriveResponse.text();
          console.error('Derive-api-key failed:', deriveResponse.status, deriveError);
        }
      } catch (deriveErr) {
        console.error('Auto-recovery failed:', deriveErr);
      }
    }

    // Trading enabled ONLY if L2 sanity passed (200 response) and not in closed-only mode
    const tradingEnabled = hasKey && hasSecret && hasPassphrase && ownerMatch && l2SanityPassed && !closed_only;

    return out({
      hasKey: hasKey,
      hasSecret: hasSecret,
      hasPassphrase: hasPassphrase,
      ownerAddress: ownerAddress,
      connectedEOA: eoaAddress,
      ownerMatch: ownerMatch,
      closed_only: closed_only,
      banStatusRaw: banStatusBody,
      tradingEnabled: tradingEnabled,
      attempts: attempts.length > 1 ? attempts : undefined,
      l2Debug: l2Debug,
    }, 200);

  } catch (error: any) {
    console.error('Error in polymarket-connect-status:', error);
    return out({ 
      ok: false, 
      error: "EdgeCrash", 
      message: error?.message, 
      stack: error?.stack 
    }, 500);
  }
});
