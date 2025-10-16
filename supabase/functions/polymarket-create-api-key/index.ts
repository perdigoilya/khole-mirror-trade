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

    // Call Polymarket CLOB to create API key (L1 only headers)
    const response = await fetch('https://clob.polymarket.com/auth/api-key', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'POLY_ADDRESS': walletAddress,
        'POLY_SIGNATURE': signature,
        'POLY_TIMESTAMP': timestamp.toString(),
        'POLY_NONCE': nonce.toString(),
      },
      // Some environments require an explicit JSON body for POST
      body: JSON.stringify({})
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Polymarket API key creation failed:', response.status, errorText);
      
      // If we get a 409 or a 400 (common upstream error), try to derive the existing key instead
      if (response.status === 409 || response.status === 400) {
        console.log('Create failed, attempting to derive existing API key...');
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
          // Both create and derive failed - check if user needs to register
          console.log('Derive also failed, checking access status...');
          try {
            const accessResponse = await fetch(
              `https://clob.polymarket.com/auth/access-status?address=${walletAddress}`
            );
            if (accessResponse.ok) {
              const accessData = await accessResponse.json();
              if (accessData?.cert_required === true) {
                return new Response(
                  JSON.stringify({ 
                    error: 'Registration Required',
                    details: 'This wallet is not registered on Polymarket. Please visit polymarket.com to complete registration first.',
                    cert_required: true,
                    status: 'not_registered'
                  }),
                  { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
                );
              }
            }
          } catch (accessErr) {
            console.warn('Could not check access status:', accessErr);
          }
          
          throw new Error(`Failed to derive API key: ${await deriveResponse.text()}`);
        }

        const deriveData = await deriveResponse.json();
        
        // Fetch proxy address for derived key too
        let funderAddress = walletAddress;
        try {
          const proxyResp = await fetch(`https://data-api.polymarket.com/address_details?address=${walletAddress}`);
          if (proxyResp.ok) {
            const proxyData = await proxyResp.json();
            funderAddress = proxyData?.proxy || walletAddress;
          }
        } catch (e) {
          console.warn('Could not fetch proxy address:', e);
        }

        return new Response(
          JSON.stringify({ ...deriveData, funderAddress }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Failed to create API key: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('API key created successfully');

    // Also fetch the proxy (funder) address for this wallet
    let funderAddress = walletAddress; // fallback to EOA
    try {
      const proxyResp = await fetch(`https://data-api.polymarket.com/address_details?address=${walletAddress}`);
      if (proxyResp.ok) {
        const proxyData = await proxyResp.json();
        // Use the proxy if available, otherwise fall back to EOA
        funderAddress = proxyData?.proxy || walletAddress;
        console.log('Resolved funder address:', funderAddress);
      }
    } catch (e) {
      console.warn('Could not fetch proxy address, using EOA:', e);
    }

    return new Response(
      JSON.stringify({ ...data, funderAddress }),
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
