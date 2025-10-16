import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function createKalshiSignature(
  privateKeyPem: string,
  timestamp: string,
  method: string,
  path: string
): Promise<string> {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKeyPem
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSA-PSS",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const message = new TextEncoder().encode(timestamp + method + path);

  const signature = await crypto.subtle.sign(
    {
      name: "RSA-PSS",
      saltLength: 32,
    },
    cryptoKey,
    message
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { apiKeyId, privateKey, ticker, action, side, count, type = 'limit', yesPrice, noPrice } = await req.json();

    console.log('Kalshi trade request:', { ticker, action, side, count, type });

    if (!apiKeyId || !privateKey || !ticker || !action || !side || !count) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate count
    if (count <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid count. Must be a positive number.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // For limit orders, validate price
    if (type === 'limit') {
      const price = side === 'yes' ? yesPrice : noPrice;
      if (!price || price <= 0 || price > 100) {
        return new Response(
          JSON.stringify({ error: 'Invalid price. Price must be between 1 and 100 cents.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    // Check balance first
    const balanceTimestamp = Date.now().toString();
    const balancePath = '/trade-api/v2/portfolio/balance';
    const balanceSignature = await createKalshiSignature(
      privateKey,
      balanceTimestamp,
      'GET',
      balancePath
    );

    console.log('Checking Kalshi balance...');
    const balanceResponse = await fetch(`https://api.kalshi.com${balancePath}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'KALSHI-ACCESS-KEY': apiKeyId,
        'KALSHI-ACCESS-SIGNATURE': balanceSignature,
        'KALSHI-ACCESS-TIMESTAMP': balanceTimestamp,
      },
    });

    if (!balanceResponse.ok) {
      const errorData = await balanceResponse.text();
      console.error('Balance check failed:', balanceResponse.status, errorData);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to verify account balance',
          details: 'Could not connect to Kalshi API. Please check your credentials.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const balanceData = await balanceResponse.json();
    console.log('Balance response:', balanceData);

    const availableBalance = balanceData.balance / 100; // Convert from cents to dollars
    
    // Calculate required amount for the trade
    let requiredAmount = 0;
    if (type === 'limit') {
      const price = side === 'yes' ? yesPrice : noPrice;
      requiredAmount = (count * price) / 100; // price is in cents, convert to dollars
    } else {
      // For market orders, estimate with current market price (assuming worst case of 100 cents)
      requiredAmount = count;
    }

    // Check for zero balance first
    if (availableBalance === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No Funds in Account ❌',
          details: `Your Kalshi account has $0.00. Please deposit funds to your Kalshi account before trading.\n\n1. Visit kalshi.com\n2. Go to your account settings\n3. Deposit funds\n4. Return here to trade`,
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
          details: `You need $${requiredAmount.toFixed(2)} but only have $${availableBalance.toFixed(2)} in your Kalshi account. Please deposit more funds.`,
          required: requiredAmount,
          available: availableBalance
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Create the order
    const timestamp = Date.now().toString();
    const path = '/trade-api/v2/portfolio/orders';
    const signature = await createKalshiSignature(
      privateKey,
      timestamp,
      'POST',
      path
    );

    const orderPayload: any = {
      ticker,
      action,
      side,
      count,
      type,
    };

    // Add price for limit orders
    if (type === 'limit') {
      if (side === 'yes') {
        orderPayload.yes_price = yesPrice;
      } else {
        orderPayload.no_price = noPrice;
      }
    }

    console.log('Submitting order to Kalshi:', orderPayload);

    const orderResponse = await fetch(`https://api.kalshi.com${path}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'KALSHI-ACCESS-KEY': apiKeyId,
        'KALSHI-ACCESS-SIGNATURE': signature,
        'KALSHI-ACCESS-TIMESTAMP': timestamp,
      },
      body: JSON.stringify(orderPayload),
    });

    const orderData = await orderResponse.json();

    if (!orderResponse.ok) {
      console.error('Order submission failed:', orderResponse.status, orderData);
      return new Response(
        JSON.stringify({ 
          error: 'Order submission failed',
          details: orderData.error || orderData.message || 'Unknown error occurred',
          kalshiError: orderData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: orderResponse.status }
      );
    }

    console.log('Order submitted successfully:', orderData);

    return new Response(
      JSON.stringify({
        success: true,
        order: orderData.order,
        message: 'Order submitted successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Kalshi trade error:', error);
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
