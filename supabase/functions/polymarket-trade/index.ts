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

    if (!walletAddress || !tokenId || !side || !price || !size || !signedOrder || !apiKey || !apiSecret || !apiPassphrase) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
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

    // Check funder (proxy) balance
    const checkAddress = funderAddress || walletAddress;
    console.log('Checking balance for:', checkAddress);
    const balanceResponse = await fetch(
      `https://clob.polymarket.com/balances/${checkAddress}`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!balanceResponse.ok) {
      console.error('Failed to fetch balance:', balanceResponse.status);
      return new Response(
        JSON.stringify({ 
          error: 'Wallet Not Registered on Polymarket',
          details: 'This wallet is not registered on Polymarket. Please:\n1. Visit polymarket.com\n2. Connect this wallet\n3. Deposit USDC\n4. Return here to trade',
          notRegistered: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const balanceData = await balanceResponse.json();
    console.log('Balance data:', balanceData);

    // Check if wallet has sufficient funds
    const requiredAmount = price * size;
    const availableBalance = parseFloat(balanceData.balance || '0');

    // Check for zero balance first
    if (availableBalance === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No Funds in Wallet ❌',
          details: `Your wallet has $0.00 USDC. Please deposit USDC to your Polymarket wallet before trading.\n\n1. Visit polymarket.com\n2. Click on "Deposit"\n3. Transfer USDC to your wallet\n4. Return here to trade`,
          required: requiredAmount,
          available: 0,
          zeroBalance: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (availableBalance < requiredAmount) {
      return new Response(
        JSON.stringify({ 
          error: 'Insufficient Funds ❌',
          details: `You need $${requiredAmount.toFixed(2)} but only have $${availableBalance.toFixed(2)} in your wallet. Please deposit more USDC to your Polymarket account.`,
          required: requiredAmount,
          available: availableBalance
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Submit the order using L2 HMAC authentication
    console.log('Submitting order to CLOB...');
    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'POST';
    const requestPath = '/order';
    const bodyString = JSON.stringify(signedOrder);
    
    // Generate HMAC signature
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

    // Submit order with L2 headers
    const orderResponse = await fetch('https://clob.polymarket.com/order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
