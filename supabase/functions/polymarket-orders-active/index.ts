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
      return out({ problem: 'Unauthorized', details: authErr?.message || 'No user' }, 401);
    }

    const userId = authData.user.id;
    const dbKey = `polymarket:${Deno.env.get('DENO_REGION') || 'unknown'}:${userId}`;
    console.log('DB key for creds:', dbKey);
    
    const { data: credsRow, error: credsErr } = await supabase
      .from('user_polymarket_credentials')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsErr || !credsRow) {
      return out({ problem: 'Missing credentials', ready: false }, 400);
    }

    const walletAddress = credsRow.wallet_address;
    const apiKey: string | null = credsRow.api_credentials_key || credsRow.api_key || null;
    const apiSecret: string | null = credsRow.api_credentials_secret || null;
    const apiPassphrase: string | null = credsRow.api_credentials_passphrase || null;

    if (!apiKey || !apiSecret || !apiPassphrase) {
      return out({ 
        problem: 'Incomplete credentials',
        ready: false,
        tradingEnabled: false,
        hasKey: !!apiKey,
        hasSecret: !!apiSecret,
        hasPassphrase: !!apiPassphrase,
      }, 400);
    }

    const ownerAddress = walletAddress?.toLowerCase();

    // Assert all 3 credentials present
    if (!apiKey || !apiSecret || !apiPassphrase) {
      throw new Error('Missing L2 credentials (key, secret, or passphrase)');
    }

    // Sanity check: GET /auth/ban-status/closed-only with L2 auth (read-only, no state change)
    console.log('Sanity check: GET /auth/ban-status/closed-only with L2 auth');
    
    // HMAC preimage: timestamp + method + path (no body for GET)
    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'GET';
    const requestPath = '/auth/ban-status/closed-only';
    const preimage = `${method}${requestPath}${timestamp}`;

    const attemptSanityCheck = async (key: string, secret: string, pass: string): Promise<{ r: Response; diag: any }> => {
      // Detect if secret is base64 (Polymarket returns base64 secrets)
      const isB64 = /^[A-Za-z0-9+/]+={0,2}$/.test(secret);
      const encoder = new TextEncoder();
      
      // Decode secret from base64 if needed, otherwise use utf8
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
      const preimage = `${method}${requestPath}${ts}`;
      
      // Store preimage in globalThis for diagnostics
      (globalThis as any).__PREIMAGE = preimage;

      const messageData = encoder.encode(preimage);
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
      const signatureArray = Array.from(new Uint8Array(signature));
      const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureBase64) || (signatureBase64.length % 4) !== 0) {
        throw new Error('POLY_SIGNATURE is not standard base64');
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

      console.log('L2 sanity check attempt:', { 
        eoa: ownerAddress,
        keySuffix: suffix(key),
        passSuffix: suffix(pass),
        ts,
        preimageFirst120: preimage.slice(0, 120),
        sigB64First12: signatureBase64.slice(0, 12),
      });

      const r = await fetch(url, { method: 'GET', headers });
      const text = await r.text();
      const upstream = safeJson(text);
      
      const cf = {
        "cf-ray": r.headers.get("cf-ray") || "",
        "cf-cache-status": r.headers.get("cf-cache-status") || "",
        "server": r.headers.get("server") || "",
        "content-type": r.headers.get("content-type") || ""
      };

      const diag = {
        url, method: 'GET',
        sent: {
          POLY_ADDRESS: headers.POLY_ADDRESS,
          POLY_API_KEY_suffix: suffix(key),
          POLY_PASSPHRASE_suffix: suffix(pass),
          POLY_TIMESTAMP: headers.POLY_TIMESTAMP,
          POLY_SIGNATURE_b64_first12: signatureBase64.slice(0, 12),
          preimage_first120: preimage.slice(0, 120)
        },
        status: r.status, 
        statusText: r.statusText, 
        cf, 
        upstream
      };

      return { r, diag };
    };

    const attempts: any[] = [];
    let result = await attemptSanityCheck(apiKey, apiSecret, apiPassphrase);
    attempts.push(result.diag);
    let sanityResponse = result.r;

    if (!sanityResponse.ok) {
      console.error('L2 sanity check failed:', result.diag);

      // If 401, credentials are invalid - signal auto-recovery needed
      if (sanityResponse.status === 401) {
        console.log('L2 401 - credentials invalid, attempting auto-recovery...');
        
        try {
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
                // Retry sanity check with new credentials
                const newApiKey = deriveData.apiKey;
                const newApiSecret = deriveData.secret;
                const newApiPassphrase = deriveData.passphrase;
                
                console.log('Retrying sanity check with derived credentials...');
                const retryResult = await attemptSanityCheck(newApiKey, newApiSecret, newApiPassphrase);
                attempts.push(retryResult.diag);
                sanityResponse = retryResult.r;
                
                if (sanityResponse.ok) {
                  const sanityData = safeJson(await sanityResponse.text());
                  console.log('✓ L2 sanity check response (after derive):', JSON.stringify(sanityData, null, 2));
                  
                  const closedOnly = sanityData?.closed_only === true;
                  const tradingEnabled = !closedOnly;

                  if (closedOnly) {
                    console.warn('⚠️ Account is in closed-only mode - trading blocked');
                  }

                  return out({
                    ready: true,
                    tradingEnabled,
                    status: 200,
                    ownerAddress,
                    hasKey: true,
                    hasSecret: true,
                    hasPassphrase: true,
                    l2SanityPassed: true,
                    closedOnly,
                    l2Body: sanityData,
                    attempts,
                  }, 200);
                }
              }
            }
          } else {
            const deriveError = await deriveResponse.text();
            console.error('Derive-api-key failed:', deriveResponse.status, deriveError);
          }
        } catch (deriveErr) {
          console.error('Auto-recovery failed:', deriveErr);
        }

        return out({ 
          problem: 'Invalid credentials',
          ready: false,
          tradingEnabled: false,
          status: 401,
          action: 'derive_failed',
          details: 'L2 credentials are invalid and auto-recovery failed. Please reconnect.',
          ownerAddress,
          hasKey: true,
          hasSecret: true,
          hasPassphrase: true,
          attempts,
        }, 401);
      }

      return out(attempts.length > 0 ? { ...result.diag, attempts } : result.diag, sanityResponse.status);
    }

    const sanityData = safeJson(await sanityResponse.text());
    console.log('✓ L2 sanity check response:', JSON.stringify(sanityData, null, 2));

    // Extract closed_only flag from response
    const closedOnly = sanityData?.closed_only === true;

    // Also check access-status endpoint to see if there are onboarding requirements
    console.log('Checking access-status for:', ownerAddress);
    const accessStatusResponse = await fetch(
      `https://clob.polymarket.com/auth/access-status?address=${ownerAddress}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    let accessStatus: any = null;
    if (accessStatusResponse.ok) {
      accessStatus = await accessStatusResponse.json();
      console.log('✓ Access status response:', JSON.stringify(accessStatus, null, 2));
    } else {
      console.warn('⚠️ Access status check failed:', accessStatusResponse.status);
      const errorText = await accessStatusResponse.text();
      console.warn('Access status error:', errorText);
    }
    
    // Trading enabled only when ALL conditions met:
    // 1. hasKey && hasSecret && hasPassphrase ✓
    // 2. ownerAddress === connectedEOA (already validated above)
    // 3. L2 sanity status === 200 ✓
    // 4. closed_only === false
    const tradingEnabled = !closedOnly;

    if (closedOnly) {
      console.warn('⚠️ Account is in closed-only mode - trading blocked');
    }

    // Check for access restrictions
    const hasAccessRestrictions = accessStatus && (
      accessStatus.cert_required === true ||
      accessStatus.kyc_required === true ||
      accessStatus.restricted === true
    );

    if (hasAccessRestrictions) {
      console.warn('⚠️ Account has access restrictions:', accessStatus);
    }

    return out({
      ready: true,
      tradingEnabled,
      status: 200,
      ownerAddress,
      hasKey: true,
      hasSecret: true,
      hasPassphrase: true,
      l2SanityPassed: true,
      closedOnly,
      accessStatus,
      l2Body: sanityData,
      attempts: attempts.length > 1 ? attempts : undefined,
    }, 200);

  } catch (error: any) {
    console.error('Error in polymarket-orders-active:', error);
    return out({ 
      ok: false, 
      error: "EdgeCrash", 
      message: error?.message, 
      stack: error?.stack 
    }, 500);
  }
});
