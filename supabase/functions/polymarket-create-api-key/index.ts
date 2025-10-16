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
    const { walletAddress, signature, timestamp, nonce = 0 } = await req.json();

    if (!walletAddress || !signature || !timestamp) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating API key for wallet:', walletAddress);

    // Call Polymarket CLOB to create/derive API key
    const response = await fetch('https://clob.polymarket.com/auth/api-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'POLY_ADDRESS': walletAddress,
        'POLY_SIGNATURE': signature,
        'POLY_TIMESTAMP': timestamp.toString(),
        'POLY_NONCE': nonce.toString(),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Polymarket API key creation failed:', response.status, errorText);
      
      // If we get a 409, try to derive the existing key instead
      if (response.status === 409) {
        console.log('API key already exists, attempting to derive...');
        const deriveResponse = await fetch(`https://clob.polymarket.com/auth/derive-api-key?nonce=${nonce}`, {
          method: 'GET',
          headers: {
            'POLY_ADDRESS': walletAddress,
            'POLY_SIGNATURE': signature,
            'POLY_TIMESTAMP': timestamp.toString(),
            'POLY_NONCE': nonce.toString(),
          },
        });

        if (!deriveResponse.ok) {
          throw new Error(`Failed to derive API key: ${await deriveResponse.text()}`);
        }

        const deriveData = await deriveResponse.json();
        return new Response(
          JSON.stringify(deriveData),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Failed to create API key: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('API key created successfully');

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in polymarket-create-api-key:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
