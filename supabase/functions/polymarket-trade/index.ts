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
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
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
        JSON.stringify({ error: 'Missing L2 credentials', details: 'No Polymarket credentials stored for this user', action: 'create_api_key' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Ensure the wallet matches the stored one (ownerAddress validation)
    const storedWallet = credsRow.wallet_address?.toLowerCase();
    const requestWallet = String(walletAddress).toLowerCase();
    if (storedWallet !== requestWallet) {
      console.error('Wallet mismatch:', { storedWallet, requestWallet });
      return new Response(
        JSON.stringify({ 
          error: 'Wallet mismatch', 
          details: `POLY_ADDRESS (${requestWallet}) must match stored wallet (${storedWallet}). Switch wallets or reconnect.`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const apiKey: string | null = credsRow.api_credentials_key || credsRow.api_key || null;
    const apiSecret: string | null = credsRow.api_credentials_secret || null;
    const apiPassphrase: string | null = credsRow.api_credentials_passphrase || null;


    // Require L2 API credentials for private endpoints per Polymarket docs
    if (!apiKey || !apiSecret || !apiPassphrase) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing L2 credentials',
          details: 'Polymarket requires API key auth (L2) for placing orders. Please connect and create API keys first.',
          action: 'create_api_key'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate price and size
    if (price <= 0 || price > 1 || size <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid price or size. Price must be between 0 and 1, size must be positive.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Removed deprecated balance check that caused 404s.
    // Per requirements, we rely on upstream CLOB errors or optional Data-API checks handled elsewhere.


    // Submit the order to CLOB (private endpoint requires L2 auth)
    console.log('Submitting order to CLOB...');

    // Per docs, request payload must include { order, owner, orderType }
    const payload = {
      order: signedOrder,
      owner: apiKey, // API key of order owner
      orderType: 'GTC'
    };
    const bodyString = JSON.stringify(payload);

    // L2 HMAC authentication
    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'POST';
    const requestPath = '/order';

    // Generate HMAC signature (timestamp + method + path + raw body)
    const message = `${timestamp}${method}${requestPath}${bodyString}`;
    console.log('L2 HMAC preimage (no secret):', { 
      walletAddress: requestWallet, 
      hasKey: !!apiKey, 
      hasSecret: !!apiSecret, 
      timestamp, 
      method, 
      requestPath 
    });

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

    const orderResponse = await fetch('https://clob.polymarket.com/order', {
      method: 'POST',
      headers: {
'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://polymarket.com/',
        'POLY_ADDRESS': walletAddress.toLowerCase(),
        'POLY_SIGNATURE': signatureBase64,
        'POLY_TIMESTAMP': timestamp.toString(),
        'POLY_API_KEY': apiKey,
        'POLY_PASSPHRASE': apiPassphrase,
      },
      body: bodyString,
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      const cfRay = orderResponse.headers.get('cf-ray') || null;
      const cfCache = orderResponse.headers.get('cf-cache-status') || null;
      const server = orderResponse.headers.get('server') || null;
      const contentType = orderResponse.headers.get('content-type') || null;

      console.error('Order submission failed:', orderResponse.status, {
        cfRay,
        cfCache,
        server,
        contentType,
        body: errorText?.slice(0, 2000)
      });

      // Auto-recovery on 401: derive new credentials and retry once
      if (orderResponse.status === 401 && errorText?.includes('Invalid api key')) {
        console.log('L2 401 detected - attempting auto-recovery via derive-api-key...');
        
        try {
          // We need a fresh L1 signature to derive, but we don't have one here
          // Instead, signal to the client that they need to reconnect
          return new Response(
            JSON.stringify({ 
              error: 'Session Expired',
              details: 'Your Polymarket session has expired. Please disconnect and reconnect to re-authenticate.',
              action: 'reconnect_required',
              status: 401
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
          );
        } catch (deriveErr) {
          console.error('Auto-recovery failed:', deriveErr);
        }
      }

      return new Response(
        JSON.stringify({ 
          error: 'Order Submission Failed',
          status: orderResponse.status,
          cfRay,
          cfCache,
          server,
          contentType,
          upstream: errorText
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: orderResponse.status }
      );
    }

    const orderData = await orderResponse.json();
    console.log('Order submitted successfully:', orderData);

    return new Response(
      JSON.stringify({
        success: true,
        orderId: orderData.orderID,
        order: orderData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Trade error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: 'Trade failed',
        details: errorMessage 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
