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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get authenticated user
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authErr?.message || 'No user' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const userId = authData.user.id;

    // Get the connectedEOA from request body or derive from wallet connection
    const { connectedEOA } = await req.json().catch(() => ({ connectedEOA: null }));

    // Read credentials from DB
    const { data: credsRow, error: credsErr } = await supabase
      .from('user_polymarket_credentials')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsErr) {
      console.error('CREDS_MISSING user_id=' + userId + ' reason=error details=' + credsErr.message);
      return new Response(
        JSON.stringify({ 
          hasKey: false,
          hasSecret: false,
          hasPassphrase: false,
          ownerAddress: '',
          connectedEOA: (connectedEOA || '').toLowerCase(),
          ownerMatch: false,
          closed_only: false,
          banStatusRaw: {},
          tradingEnabled: false,
          error: 'Database error',
          details: credsErr.message
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Compute booleans from DB (explicit false for nulls, don't expose raw secrets)
    const hasKey = !!(credsRow?.api_credentials_key || credsRow?.api_key);
    const hasSecret = !!credsRow?.api_credentials_secret;
    const hasPassphrase = !!credsRow?.api_credentials_passphrase;
    const ownerAddress = (credsRow?.wallet_address || '').toLowerCase();
    const eoaAddress = (connectedEOA || '').toLowerCase();
    const ownerMatch = !!(ownerAddress && eoaAddress && ownerAddress === eoaAddress);
    
    if (!credsRow) {
      console.log('CREDS_MISSING user_id=' + userId + ' reason=no_row');
    } else {
      console.log('CREDS_READ user_id=' + userId + ' hasKey=' + hasKey + ' hasSecret=' + hasSecret + ' hasPassphrase=' + hasPassphrase + ' ownerAddress=' + ownerAddress + ' eoaAddress=' + eoaAddress + ' ownerMatch=' + ownerMatch);
    }

    console.log('Connect status computed:', { 
      hasKey, 
      hasSecret, 
      hasPassphrase, 
      ownerAddress, 
      eoaAddress, 
      ownerMatch 
    });

    // If no credentials, return early with explicit false values
    if (!hasKey || !hasSecret || !hasPassphrase) {
      return new Response(
        JSON.stringify({
          hasKey: hasKey,
          hasSecret: hasSecret,
          hasPassphrase: hasPassphrase,
          ownerAddress: ownerAddress,
          connectedEOA: eoaAddress,
          ownerMatch: ownerMatch,
          closed_only: false,
          banStatusRaw: {},
          tradingEnabled: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Call CLOB /auth/ban-status/closed-only with L2 auth
    let apiKey = credsRow.api_credentials_key || credsRow.api_key;
    let apiSecret = credsRow.api_credentials_secret;
    let apiPassphrase = credsRow.api_credentials_passphrase;

    // Assert all 3 credentials present
    if (!apiKey || !apiSecret || !apiPassphrase) {
      throw new Error('Missing L2 credentials (key, secret, or passphrase)');
    }

    // Assert owner match
    if (ownerAddress !== eoaAddress) {
      console.error('Owner mismatch:', { ownerAddress, eoaAddress });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'GET';
    const requestPath = '/auth/ban-status/closed-only';
    const preimage = `${method}${requestPath}${timestamp}`;

    let banStatusBody: any = {};
    let closed_only = false;
    let l2SanityPassed = false;
    let l2Debug: any = null;

    const attemptBanStatusCheck = async (key: string, secret: string, pass: string): Promise<boolean> => {
      try {
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

        l2Debug = {
          eoa: ownerAddress,
          polyAddress: ownerAddress,
          preimageFirst120: preimage.substring(0, 120),
          url: 'https://clob.polymarket.com/auth/ban-status/closed-only',
          sigB64First12: signatureBase64.substring(0, 12),
          polyTimestamp: timestamp.toString(),
          method,
          requestPath
        };

        console.log('L2 ban-status attempt:', {
          eoa: ownerAddress,
          ownerAddress,
          polyAddress: ownerAddress,
          keySuffix: key.slice(-6),
          passSuffix: pass.slice(-4),
          ts: timestamp,
          preimageFirst120: preimage.substring(0, 120),
          sigB64First12: signatureBase64.substring(0, 12),
        });

        const response = await fetch('https://clob.polymarket.com/auth/ban-status/closed-only', {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'POLY_ADDRESS': ownerAddress,
            'POLY_SIGNATURE': signatureBase64,
            'POLY_TIMESTAMP': timestamp.toString(),
            'POLY_API_KEY': key,
            'POLY_PASSPHRASE': pass,
          },
        });

        if (response.ok) {
          banStatusBody = await response.json();
          console.log('✓ Ban status response:', JSON.stringify(banStatusBody, null, 2));
          closed_only = banStatusBody?.closed_only === true || banStatusBody?.closedOnly === true;
          return true;
        } else {
          const errorText = await response.text();
          console.error('Ban status call failed:', response.status, errorText);
          banStatusBody = { error: errorText, status: response.status };
          return false;
        }
      } catch (error) {
        console.error('HMAC signing error:', error);
        banStatusBody = { error: 'HMAC signing failed', details: error instanceof Error ? error.message : String(error) };
        return false;
      }
    };

    // First attempt
    l2SanityPassed = await attemptBanStatusCheck(apiKey, apiSecret, apiPassphrase);

    // On 401, try to derive new credentials and retry once
    if (!l2SanityPassed && banStatusBody?.status === 401) {
      console.log('L2 401 detected - attempting auto-recovery via derive-api-key...');
      
      try {
        // Build L1-style headers for derive (no HMAC, just address)
        const deriveResponse = await fetch('https://clob.polymarket.com/auth/derive-api-key', {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'POLY_ADDRESS': ownerAddress,
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
                wallet_address: ownerAddress,
              })
              .eq('user_id', userId);

            if (updateError) {
              console.error('Failed to update derived credentials:', updateError);
            } else {
              // Retry ban-status check with new credentials
              apiKey = deriveData.apiKey;
              apiSecret = deriveData.secret;
              apiPassphrase = deriveData.passphrase;
              
              console.log('Retrying ban-status with derived credentials...');
              l2SanityPassed = await attemptBanStatusCheck(apiKey, apiSecret, apiPassphrase);
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

    // Trading enabled ONLY if L2 sanity passed (200 response) and not in closed-only mode
    const tradingEnabled = hasKey && hasSecret && hasPassphrase && ownerMatch && l2SanityPassed && !closed_only;

    return new Response(
      JSON.stringify({
        hasKey: hasKey,
        hasSecret: hasSecret,
        hasPassphrase: hasPassphrase,
        ownerAddress: ownerAddress,
        connectedEOA: eoaAddress,
        ownerMatch: ownerMatch,
        closed_only: closed_only,
        banStatusRaw: banStatusBody,
        tradingEnabled: tradingEnabled,
        l2Debug: l2Debug,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in polymarket-connect-status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: 'Status check failed',
        details: errorMessage 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
