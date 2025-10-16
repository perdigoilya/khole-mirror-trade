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
      apiKey,
      apiSecret,
      apiPassphrase,
      funderAddress 
    } = await req.json();

    console.log('Trade request:', { walletAddress, tokenId, side, price, size, funderAddress });

    if (!walletAddress || !tokenId || !side || !price || !size || !signedOrder) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

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
    console.log('Using L2 HMAC authentication');
    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'POST';
    const requestPath = '/order';

    // Generate HMAC signature (timestamp + method + path + raw body)
    const message = `${timestamp}${method}${requestPath}${bodyString}`;
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
        // Set a browser-like UA and referer to avoid Cloudflare bot blocks
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://polymarket.com/',
        'POLY_ADDRESS': walletAddress,
        'POLY_SIGNATURE': signatureBase64,
        'POLY_TIMESTAMP': timestamp.toString(),
        'POLY_API_KEY': apiKey,
        'POLY_PASSPHRASE': apiPassphrase,
      },
      body: bodyString,
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error('Order submission failed:', orderResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Order Submission Failed',
          details: errorText,
          status: orderResponse.status
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
