import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.203.0/crypto/mod.ts";

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
  // Import the private key - expect unencrypted PKCS#8 (BEGIN PRIVATE KEY).
  // If PKCS#1 (BEGIN RSA PRIVATE KEY) is provided, return a helpful error.
  if (privateKeyPem.includes('BEGIN RSA PRIVATE KEY')) {
    if (/Proc-Type:/i.test(privateKeyPem) || /DEK-Info:/i.test(privateKeyPem)) {
      throw new Error('Encrypted RSA keys are not supported. Please provide an unencrypted PKCS#8 private key (BEGIN PRIVATE KEY).');
    }
    throw new Error('PKCS#1 RSA keys are not supported. Please convert to unencrypted PKCS#8 (BEGIN PRIVATE KEY).');
  }

  let pemContents = privateKeyPem;
  
  // Remove PKCS#8 headers (BEGIN PRIVATE KEY)
  pemContents = pemContents.replace('-----BEGIN PRIVATE KEY-----', '');
  pemContents = pemContents.replace('-----END PRIVATE KEY-----', '');
  
  // Remove potential OpenSSL metadata lines and sanitize non-base64 chars
  pemContents = pemContents
    .replace(/Proc-Type:[^\n]*\n?/gi, '')
    .replace(/DEK-Info:[^\n]*\n?/gi, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');
  
  if (!pemContents) {
    throw new Error('Invalid private key format. Ensure it is the full PEM content.');
  }
  
  let binaryDer: Uint8Array;
  try {
    binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  } catch (e) {
    throw new Error("Failed to decode base64. Please ensure your private key is correctly formatted and not corrupted.");
  }
  
  // Create an ArrayBuffer from the Uint8Array
  const arrayBuffer = new ArrayBuffer(binaryDer.length);
  const view = new Uint8Array(arrayBuffer);
  view.set(binaryDer);
  
  const key = await crypto.subtle.importKey(
    "pkcs8",
    arrayBuffer,
    {
      name: "RSA-PSS",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  // Create message to sign: timestamp + method + path
  const message = `${timestamp}${method}${path}`;
  const msgBuffer = new TextEncoder().encode(message);

  // Sign with RSA-PSS
  const signature = await crypto.subtle.sign(
    {
      name: "RSA-PSS",
      saltLength: 32, // SHA-256 digest length
    },
    key,
    msgBuffer
  );

  // Convert to base64
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { apiKeyId, privateKey } = await req.json();

    if (!apiKeyId || !privateKey) {
      return new Response(
        JSON.stringify({ error: 'API Key ID and Private Key are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Kalshi authentication headers
    const timestamp = Date.now().toString();
    const method = "GET";
    const path = "/trade-api/v2/exchange/status";
    
    let signature: string;
    try {
      signature = await createKalshiSignature(privateKey, timestamp, method, path);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid private key';
      return new Response(
        JSON.stringify({ valid: false, error: msg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Testing Kalshi credentials with proper auth headers');

    // Test the credentials by making a simple API call to Kalshi
    const response = await fetch(`https://api.elections.kalshi.com${path}`, {
      headers: {
        'KALSHI-ACCESS-KEY': apiKeyId,
        'KALSHI-ACCESS-SIGNATURE': signature,
        'KALSHI-ACCESS-TIMESTAMP': timestamp,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      console.log('Credentials validated successfully');
      return new Response(
        JSON.stringify({ valid: true, message: 'Credentials validated successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const error = await response.text();
      console.error('Kalshi API error:', response.status, error);
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Validation error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
