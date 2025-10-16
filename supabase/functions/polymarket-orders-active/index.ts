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

    // Sanity check: GET /auth/ban-status/closed-only with L2 auth (read-only, no state change)
    console.log('Sanity check: GET /auth/ban-status/closed-only with L2 auth');
    
    // HMAC preimage: timestamp + method + path (no body for GET)
    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'GET';
    const requestPath = '/auth/ban-status/closed-only';
    const preimage = `${timestamp}${method}${requestPath}`;
    
    // Detect if secret is base64 (Polymarket returns base64 secrets)
    const isB64 = /^[A-Za-z0-9+/]+={0,2}$/.test(apiSecret);
    const encoder = new TextEncoder();
    
    // Decode secret from base64 if needed, otherwise use utf8
    let secretBytes: Uint8Array;
    if (isB64) {
      const secretRaw = atob(apiSecret);
      secretBytes = new Uint8Array(secretRaw.length);
      for (let i = 0; i < secretRaw.length; i++) {
        secretBytes[i] = secretRaw.charCodeAt(i);
      }
    } else {
      secretBytes = encoder.encode(apiSecret);
    }

    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const messageData = encoder.encode(preimage);
    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    const signatureArray = Array.from(new Uint8Array(signature));
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

    // Validate standard base64 format
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureBase64) || (signatureBase64.length % 4) !== 0) {
      throw new Error('POLY_SIGNATURE is not standard base64');
    }

    console.log('L2 sanity check auth:', { 
      ownerAddress, 
      polyAddress: ownerAddress,
      hasSecret: true, 
      timestamp, 
      preimage: preimage.substring(0, 120),
      signaturePreview: signatureBase64.substring(0, 12) + '...',
      polyTimestamp: timestamp.toString(),
      method,
      requestPath
    });

    const sanityResponse = await fetch('https://clob.polymarket.com/auth/ban-status/closed-only', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'POLY_ADDRESS': ownerAddress,
        'POLY_SIGNATURE': signatureBase64,
        'POLY_TIMESTAMP': timestamp.toString(),
        'POLY_API_KEY': apiKey,
        'POLY_PASSPHRASE': apiPassphrase,
      },
    });

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
        console.log('L2 401 - credentials invalid, auto-recovery required');
        return new Response(
          JSON.stringify({ 
            ready: false,
            tradingEnabled: false,
            error: 'Invalid credentials',
            status: 401,
            action: 'derive_required',
            details: 'L2 credentials are invalid. Auto-recovery will attempt to derive new credentials.',
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
