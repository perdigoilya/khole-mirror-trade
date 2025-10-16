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
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authErr?.message || 'No user' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const userId = authData.user.id;

    // Get the connectedEOA from request body or derive from wallet connection
    const { connectedEOA } = await req.json().catch(() => ({ connectedEOA: null }));

    // Read credentials from DB
    const { data: credsRow, error: credsErr } = await supabase
      .from('user_polymarket_credentials')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsErr) {
      console.error('DB read error:', credsErr);
      return new Response(
        JSON.stringify({ error: 'Database error', details: credsErr.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Compute booleans from DB (don't expose raw secrets)
    const hasKey = !!(credsRow?.api_credentials_key || credsRow?.api_key);
    const hasSecret = !!credsRow?.api_credentials_secret;
    const hasPassphrase = !!credsRow?.api_credentials_passphrase;
    const ownerAddress = (credsRow?.wallet_address || '').toLowerCase();
    const eoaAddress = (connectedEOA || ownerAddress || '').toLowerCase();
    const ownerMatch = ownerAddress && eoaAddress && ownerAddress === eoaAddress;

    console.log('Connect status computed:', { 
      hasKey, 
      hasSecret, 
      hasPassphrase, 
      ownerAddress, 
      eoaAddress, 
      ownerMatch 
    });

    // If no credentials, return early
    if (!hasKey || !hasSecret || !hasPassphrase) {
      return new Response(
        JSON.stringify({
          hasKey,
          hasSecret,
          hasPassphrase,
          ownerAddress,
          connectedEOA: eoaAddress,
          ownerMatch,
          closed_only: null,
          raw: null,
          tradingEnabled: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Call CLOB /auth/ban-status/closed-only with L2 auth
    const apiKey = credsRow.api_credentials_key || credsRow.api_key;
    const apiSecret = credsRow.api_credentials_secret;
    const apiPassphrase = credsRow.api_credentials_passphrase;

    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'GET';
    const requestPath = '/auth/ban-status/closed-only';
    const preimage = `${timestamp}${method}${requestPath}`;

    // Base64-decode the secret for HMAC
    const encoder = new TextEncoder();
    const secretRaw = atob(apiSecret);
    const secretBytes = new Uint8Array(secretRaw.length);
    for (let i = 0; i < secretRaw.length; i++) {
      secretBytes[i] = secretRaw.charCodeAt(i);
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

    console.log('Calling CLOB ban-status with:', { ownerAddress, timestamp, preimage });

    const banStatusResponse = await fetch('https://clob.polymarket.com/auth/ban-status/closed-only', {
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

    let banStatusBody: any = null;
    let closed_only = false;

    if (banStatusResponse.ok) {
      banStatusBody = await banStatusResponse.json();
      console.log('Ban status response:', JSON.stringify(banStatusBody, null, 2));

      // Parse closed_only from body (handle both snake_case and camelCase)
      closed_only = banStatusBody?.closed_only === true || banStatusBody?.closedOnly === true;
    } else {
      const errorText = await banStatusResponse.text();
      console.error('Ban status call failed:', banStatusResponse.status, errorText);
      banStatusBody = { error: errorText, status: banStatusResponse.status };
    }

    const tradingEnabled = hasKey && hasSecret && hasPassphrase && ownerMatch && !closed_only;

    return new Response(
      JSON.stringify({
        hasKey,
        hasSecret,
        hasPassphrase,
        ownerAddress,
        connectedEOA: eoaAddress,
        ownerMatch,
        closed_only,
        raw: { banStatus: banStatusBody },
        tradingEnabled,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in polymarket-connect-status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: 'Status check failed',
        details: errorMessage 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
