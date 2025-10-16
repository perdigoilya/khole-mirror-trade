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
    const { walletAddress } = await req.json();

    console.log('Validating Polymarket wallet:', walletAddress);

    if (!walletAddress) {
      return new Response(
        JSON.stringify({ error: 'Wallet address is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if wallet is registered on Polymarket by fetching balance
    const balanceResponse = await fetch(
      `https://clob.polymarket.com/balances/${walletAddress}`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!balanceResponse.ok) {
      console.error('Wallet not registered on Polymarket:', balanceResponse.status);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Wallet Not Registered on Polymarket',
          details: 'This wallet hasn\'t been used on Polymarket yet. Please create a Polymarket account first by depositing funds at polymarket.com',
          notRegistered: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const balanceData = await balanceResponse.json();
    const balance = parseFloat(balanceData.balance || '0');

    console.log('Wallet validation successful. Balance:', balance);

    return new Response(
      JSON.stringify({
        success: true,
        balance: balance,
        walletAddress: walletAddress,
        isRegistered: true,
        hasBalance: balance > 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Validation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: 'Validation failed',
        details: errorMessage 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
