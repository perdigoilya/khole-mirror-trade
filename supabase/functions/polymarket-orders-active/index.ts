import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authErr?.message || 'No user' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const userId = authData.user.id;
    const { data: credsRow, error: credsErr } = await supabase
      .from('user_polymarket_credentials')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsErr || !credsRow) {
      return new Response(
        JSON.stringify({ error: 'Missing credentials', ready: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const walletAddress = credsRow.wallet_address;
    const apiKey: string | null = credsRow.api_credentials_key || credsRow.api_key || null;
    const apiSecret: string | null = credsRow.api_credentials_secret || null;
    const apiPassphrase: string | null = credsRow.api_credentials_passphrase || null;

    if (!apiKey || !apiSecret || !apiPassphrase) {
      return new Response(
        JSON.stringify({ 
          ready: false,
          tradingEnabled: false,
          error: 'Incomplete credentials',
          hasKey: !!apiKey,
          hasSecret: !!apiSecret,
          hasPassphrase: !!apiPassphrase,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
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

    const attemptSanityCheck = async (key: string, secret: string, pass: string): Promise<Response> => {
      const encoder = new TextEncoder();

      // Normalize possible base64url secrets to standard base64
      const normalizeB64 = (s: string) => {
        let n = s.replace(/-/g, '+').replace(/_/g, '/');
        while (n.length % 4 !== 0) n += '=';
        return n;
      };

      let secretBytes: Uint8Array;
      const normalized = normalizeB64(secret);
      const b64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
      if (b64Regex.test(normalized)) {
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

      // Attempt 1: method+path+timestamp
      const ts1 = Math.floor(Date.now() / 1000);
      const preimage1 = `${method}${requestPath}${ts1}`;
      const sig1Buf = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(preimage1));
      const sig1 = btoa(String.fromCharCode(...Array.from(new Uint8Array(sig1Buf))));

      let resp = await fetch('https://clob.polymarket.com/auth/ban-status/closed-only', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'POLY_ADDRESS': ownerAddress,
          'POLY_SIGNATURE': sig1,
          'POLY_TIMESTAMP': ts1.toString(),
          'POLY_API_KEY': key,
          'POLY_PASSPHRASE': pass,
        },
      });

      if (resp.ok) return resp;

      // Attempt 2: timestamp+method+path (alt order used elsewhere successfully)
      const ts2 = Math.floor(Date.now() / 1000);
      const preimage2 = `${ts2}${method}${requestPath}`;
      const sig2Buf = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(preimage2));
      const sig2 = btoa(String.fromCharCode(...Array.from(new Uint8Array(sig2Buf))));

      console.warn('L2 sanity check first attempt failed, retrying with alt preimage', {
        ownerAddress,
        keySuffix: key.slice(-6),
        passSuffix: pass.slice(-4),
        ts1,
        ts2,
        preimage1First24: preimage1.slice(0,24),
        preimage2First24: preimage2.slice(0,24),
      });

      return await fetch('https://clob.polymarket.com/auth/ban-status/closed-only', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'POLY_ADDRESS': ownerAddress,
          'POLY_SIGNATURE': sig2,
          'POLY_TIMESTAMP': ts2.toString(),
          'POLY_API_KEY': key,
          'POLY_PASSPHRASE': pass,
        },
      });
    };

    let sanityResponse = await attemptSanityCheck(apiKey, apiSecret, apiPassphrase);

    if (!sanityResponse.ok) {
      const errorText = await sanityResponse.text();
      const cfRay = sanityResponse.headers.get('cf-ray') || null;
      const cfCache = sanityResponse.headers.get('cf-cache-status') || null;
      const server = sanityResponse.headers.get('server') || null;
      const contentType = sanityResponse.headers.get('content-type') || null;

      console.error('L2 sanity check failed:', sanityResponse.status, {
        cfRay,
        cfCache,
        server,
        contentType,
        body: errorText?.slice(0, 500),
        preimage
      });

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
                sanityResponse = await attemptSanityCheck(newApiKey, newApiSecret, newApiPassphrase);
                
                // If retry succeeds, continue to success handler below
                if (sanityResponse.ok) {
                  const sanityData = await sanityResponse.json();
                  console.log('✓ L2 sanity check response (after derive):', JSON.stringify(sanityData, null, 2));
                  
                  const closedOnly = sanityData?.closed_only === true;
                  const tradingEnabled = !closedOnly;

                  if (closedOnly) {
                    console.warn('⚠️ Account is in closed-only mode - trading blocked');
                  }

                  return new Response(
                    JSON.stringify({
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
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                  );
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

        // If we're still here, derive failed or retry failed
        return new Response(
          JSON.stringify({ 
            ready: false,
            tradingEnabled: false,
            error: 'Invalid credentials',
            status: 401,
            action: 'derive_failed',
            details: 'L2 credentials are invalid and auto-recovery failed. Please reconnect.',
            ownerAddress,
            hasKey: true,
            hasSecret: true,
            hasPassphrase: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      // If 403 with Cloudflare, it's a WAF/egress issue
      if (sanityResponse.status === 403 && (cfRay || errorText?.includes('cloudflare'))) {
        return new Response(
          JSON.stringify({ 
            ready: false,
            tradingEnabled: false,
            error: 'Cloudflare blocked',
            status: 403,
            cfRay,
            cfCache,
            server,
            details: 'Request blocked by Cloudflare WAF. Consider using relay endpoint.',
            upstream: errorText
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      return new Response(
        JSON.stringify({ 
          ready: false,
          tradingEnabled: false,
          error: 'L2 check failed',
          status: sanityResponse.status,
          ownerAddress,
          preimage,
          upstream: errorText
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: sanityResponse.status }
      );
    }

    const sanityData = await sanityResponse.json();
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

    return new Response(
      JSON.stringify({
        ready: true,
        tradingEnabled,
        status: 200,
        ownerAddress,
        hasKey: true,
        hasSecret: true,
        hasPassphrase: true,
        l2SanityPassed: true,
        closedOnly,
        accessStatus, // Include full access-status response
        l2Body: sanityData, // Include full L2 response for diagnostics
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in polymarket-orders-active:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        ready: false,
        tradingEnabled: false,
        error: 'Check failed',
        details: errorMessage 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
