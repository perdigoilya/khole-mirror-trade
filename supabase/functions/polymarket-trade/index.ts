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
    const { walletAddress, tokenId, side, price, size } = await req.json();

    console.log('Trade request:', { walletAddress, tokenId, side, price, size });

    if (!walletAddress || !tokenId || !side || !price || !size) {
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

    // Check wallet balance by fetching from Polymarket API
    console.log('Checking wallet balance...');
    const balanceResponse = await fetch(
      `https://clob.polymarket.com/balances/${walletAddress}`,
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

    // NOTE: Actual order placement would require:
    // 1. Private key signing (cannot be done securely from server)
    // 2. Client-side transaction signing using Web3
    // 3. ClobClient initialization with proper signature type
    
    // For now, we return a validation success with instructions
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Validation passed. Ready to execute trade.',
        validated: {
          walletAddress,
          balance: availableBalance,
          requiredAmount,
          canTrade: true
        },
        // In a real implementation, this would be handled client-side with wallet signing
        requiresClientSigning: true,
        instructions: 'Trade must be signed and submitted from client with wallet private key'
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
