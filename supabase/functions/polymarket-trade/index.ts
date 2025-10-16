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

    let apiKey: string | null = credsRow.api_credentials_key || credsRow.api_key || null;
    let apiSecret: string | null = credsRow.api_credentials_secret || null;
    let apiPassphrase: string | null = credsRow.api_credentials_passphrase || null;

    // Assert all 3 credentials present
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

    // L2 HMAC authentication
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Assert timestamp is valid
    if (!Number.isInteger(timestamp) || timestamp.toString().length > 10) {
      throw new Error('Invalid timestamp format - must be epoch seconds');
    }

    const method = 'POST';
    const requestPath = '/order';
    
    // Preimage: exact bytes (method + path + timestamp + rawBody)
    const preimage = `${method}${requestPath}${timestamp}${rawBody}`;

    const attemptOrderSubmission = async (key: string, secret: string, pass: string): Promise<Response> => {
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
      
      // Validate standard base64 format
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureBase64) || (signatureBase64.length % 4) !== 0) {
        throw new Error('POLY_SIGNATURE is not standard base64');
      }
      
      // Log every /order attempt
      console.log('L2 /order attempt:', { 
        eoa: requestWallet,
        ownerAddress: ownerAddress,
        POLY_ADDRESS: requestWallet,
        keySuffix: key.slice(-6),
        passSuffix: pass.slice(-4),
        ts: timestamp,
        preimageFirst120: preimage.substring(0, 120),
        sigB64First12: signatureBase64.substring(0, 12),
        funderAddress: funderAddress || 'not_specified',
        bodyLength: rawBody.length
      });

      return await fetch('https://clob.polymarket.com/order', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'POLY_ADDRESS': requestWallet,
          'POLY_SIGNATURE': signatureBase64,
          'POLY_TIMESTAMP': timestamp.toString(),
          'POLY_API_KEY': key,
          'POLY_PASSPHRASE': pass,
        },
        body: rawBody, // Use SAME rawBody for signing and sending
      });
    };

    console.log('Submitting order to CLOB...');
    let orderResponse = await attemptOrderSubmission(apiKey, apiSecret, apiPassphrase);

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
                // Update local vars and retry once
                const newApiKey = deriveData.apiKey;
                const newApiSecret = deriveData.secret;
                const newApiPassphrase = deriveData.passphrase;
                
                console.log('Retrying order with derived credentials...');
                orderResponse = await attemptOrderSubmission(newApiKey, newApiSecret, newApiPassphrase);
                
                // If retry succeeds, continue to success handler below
                if (orderResponse.ok) {
                  const orderData = await orderResponse.json();
                  console.log('✓ Order submitted successfully after derive:', orderData);

                  return new Response(
                    JSON.stringify({
                      success: true,
                      orderId: orderData.orderID,
                      order: orderData
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                  );
                }
                
                // If retry also fails, continue to error handler below
                const retryError = await orderResponse.text();
                console.error('Order retry also failed:', orderResponse.status, retryError);
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
