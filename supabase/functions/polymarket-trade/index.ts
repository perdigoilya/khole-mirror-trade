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
    const {
      walletAddress,
      tokenId,
      side,
      price,
      size,
      signedOrder,
      funderAddress,
    } = await req.json();

    console.log('Trade request:', { walletAddress, tokenId, side, price, size, funderAddress });

    if (!walletAddress || !tokenId || !side || !price || !size || !signedOrder) {
      return out({ problem: 'Missing required parameters' }, 400);
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
      return out({ problem: 'Missing L2 credentials', details: 'No Polymarket credentials stored for this user', action: 'create_api_key' }, 400);
    }

    const storedWallet = credsRow.wallet_address?.toLowerCase();
    const requestWallet = String(walletAddress).toLowerCase();
    if (storedWallet !== requestWallet) {
      console.error('Wallet mismatch:', { storedWallet, requestWallet });
      return out({ 
        problem: 'Wallet mismatch', 
        details: `POLY_ADDRESS (${requestWallet}) must match stored wallet (${storedWallet}). Switch wallets or reconnect.`
      }, 400);
    }

    let apiKey: string | null = credsRow.api_credentials_key || credsRow.api_key || null;
    let apiSecret: string | null = credsRow.api_credentials_secret || null;
    let apiPassphrase: string | null = credsRow.api_credentials_passphrase || null;

    if (!apiKey || !apiSecret || !apiPassphrase) {
      return out({ 
        problem: 'Missing L2 credentials',
        details: 'Polymarket requires API key auth (L2) for placing orders. Please connect and create API keys first.',
        action: 'create_api_key'
      }, 400);
    }

    if (price <= 0 || price > 1 || size <= 0) {
      return out({ problem: 'Invalid price or size', details: 'Price must be between 0 and 1, size must be positive.' }, 400);
    }

    // Removed deprecated balance check that caused 404s.
    // Per requirements, we rely on upstream CLOB errors or optional Data-API checks handled elsewhere.


    // Assert owner address match
    const ownerAddress = storedWallet;
    if (!ownerAddress || ownerAddress !== requestWallet) {
      throw new Error(`Owner mismatch: ${ownerAddress} !== ${requestWallet}`);
    }

    // Per docs, request payload must include { order, owner, orderType }
    const orderPayload = {
      order: signedOrder,
      owner: apiKey, // API key of order owner
      orderType: 'GTC'
    };
    const rawBody = JSON.stringify(orderPayload); // Create ONCE for signing and sending

    const method = 'POST';
    const requestPath = '/order';
    
    const attemptOrderSubmission = async (key: string, secret: string, pass: string): Promise<{ r: Response; diag: any }> => {
      const ts = Math.floor(Date.now() / 1000);
      if (!Number.isInteger(ts) || ts.toString().length > 10) {
        throw new Error('Invalid timestamp format - must be epoch seconds');
      }
      const preimage = `${method}${requestPath}${ts}${rawBody}`;
      
      // Store preimage in globalThis for diagnostics
      (globalThis as any).__PREIMAGE = preimage;
      
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

      const messageData = encoder.encode(preimage);
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
      const signatureArray = Array.from(new Uint8Array(signature));
      const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
      
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureBase64) || (signatureBase64.length % 4) !== 0) {
        throw new Error('POLY_SIGNATURE is not standard base64');
      }
      
      const headers = {
        'content-type': 'application/json',
        'accept': 'application/json',
        'POLY_ADDRESS': requestWallet,
        'POLY_SIGNATURE': signatureBase64,
        'POLY_TIMESTAMP': ts.toString(),
        'POLY_API_KEY': key,
        'POLY_PASSPHRASE': pass,
      };

      const url = 'https://clob.polymarket.com/order';

      console.log('L2 /order attempt:', { 
        eoa: requestWallet,
        keySuffix: suffix(key),
        passSuffix: suffix(pass),
        ts,
        preimageFirst120: preimage.slice(0, 120),
        sigB64First12: signatureBase64.slice(0, 12),
        funderAddress: funderAddress || 'not_specified',
        bodyLength: rawBody.length
      });

      const r = await fetch(url, { method, headers, body: rawBody });
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

    console.log('Submitting order to CLOB...');
    const attempts: any[] = [];
    let result = await attemptOrderSubmission(apiKey, apiSecret, apiPassphrase);
    attempts.push(result.diag);
    let orderResponse = result.r;

    if (!orderResponse.ok) {
      console.error('Order submission failed:', result.diag);

      // Auto-recovery on 401: derive new credentials and retry once
      if (orderResponse.status === 401) {
        console.log('L2 401 detected - attempting auto-recovery via derive-api-key...');
        
        try {
          const deriveResponse = await fetch('https://clob.polymarket.com/auth/derive-api-key', {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'POLY_ADDRESS': requestWallet,
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
                  wallet_address: requestWallet,
                })
                .eq('user_id', userId);

              if (updateError) {
                console.error('Failed to update derived credentials:', updateError);
              } else {
                // Atomically rebind locals and retry
                const newApiKey = deriveData.apiKey;
                const newApiSecret = deriveData.secret;
                const newApiPassphrase = deriveData.passphrase;
                
                console.log('Retrying order with derived credentials...');
                const retryResult = await attemptOrderSubmission(newApiKey, newApiSecret, newApiPassphrase);
                attempts.push(retryResult.diag);
                orderResponse = retryResult.r;
                
                if (orderResponse.ok) {
                  const orderData = safeJson(await orderResponse.text());
                  console.log('✓ Order submitted successfully after derive:', orderData);

                  return out({
                    success: true,
                    orderId: orderData.orderID,
                    order: orderData,
                    attempts,
                  }, 200);
                }
                
                console.error('Order retry also failed:', retryResult.diag);
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

      return out(attempts.length > 0 ? { ...result.diag, attempts } : result.diag, orderResponse.status);
    }

    const orderData = safeJson(await orderResponse.text());
    console.log('Order submitted successfully:', orderData);

    return out({
      success: true,
      orderId: orderData.orderID,
      order: orderData,
      attempts: attempts.length > 1 ? attempts : undefined,
    }, 200);

  } catch (error: any) {
    console.error('Trade error:', error);
    return out({ 
      ok: false, 
      error: "EdgeCrash", 
      message: error?.message, 
      stack: error?.stack 
    }, 500);
  }
});
