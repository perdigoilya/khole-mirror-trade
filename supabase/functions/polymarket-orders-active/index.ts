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
        JSON.stringify({ error: 'Incomplete credentials', ready: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Sanity check: GET /orders/active with L2 auth
    console.log('Sanity check: GET /orders/active with L2 auth');
    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'GET';
    const requestPath = '/orders/active';
    const body = '';

    // Generate HMAC
    const message = `${timestamp}${method}${requestPath}${body}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const messageData = encoder.encode(message);
    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    const signatureArray = Array.from(new Uint8Array(signature));
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

    console.log('L2 sanity check preimage:', { walletAddress, timestamp, method, requestPath });

    const activeOrdersResponse = await fetch('https://clob.polymarket.com/orders/active', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'POLY_ADDRESS': walletAddress.toLowerCase(),
        'POLY_SIGNATURE': signatureBase64,
        'POLY_TIMESTAMP': timestamp.toString(),
        'POLY_API_KEY': apiKey,
        'POLY_PASSPHRASE': apiPassphrase,
      },
    });

    if (!activeOrdersResponse.ok) {
      const errorText = await activeOrdersResponse.text();
      console.error('L2 sanity check failed:', activeOrdersResponse.status, errorText);

      // If 401, credentials are invalid - signal reconnect required
      if (activeOrdersResponse.status === 401) {
        return new Response(
          JSON.stringify({ 
            ready: false,
            error: 'Invalid credentials',
            status: 401,
            action: 'reconnect_required',
            details: 'L2 credentials are invalid. Please disconnect and reconnect.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      return new Response(
        JSON.stringify({ 
          ready: false,
          error: 'L2 check failed',
          status: activeOrdersResponse.status,
          upstream: errorText
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: activeOrdersResponse.status }
      );
    }

    const ordersData = await activeOrdersResponse.json();
    console.log('✓ L2 sanity check passed - active orders:', ordersData?.length || 0);

    return new Response(
      JSON.stringify({
        ready: true,
        status: 200,
        activeOrders: ordersData?.length || 0,
        walletAddress,
        ownerAddress: walletAddress,
        hasKey: true,
        hasSecret: true,
        hasPassphrase: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in polymarket-orders-active:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        ready: false,
        error: 'Check failed',
        details: errorMessage 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
