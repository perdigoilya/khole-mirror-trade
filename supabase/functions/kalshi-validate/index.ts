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
  // Normalize and parse PEM. Support PKCS#8 (BEGIN PRIVATE KEY) and PKCS#1 (BEGIN RSA PRIVATE KEY)
  const isPkcs1 = /BEGIN RSA PRIVATE KEY/.test(privateKeyPem);
  const isEncrypted = /Proc-Type:/i.test(privateKeyPem) || /DEK-Info:/i.test(privateKeyPem);
  if (isEncrypted) {
    throw new Error('Encrypted private keys are not supported. Please provide an unencrypted key.');
  }

  // Extract base64 body
  let b64 = privateKeyPem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');

  if (!b64) throw new Error('Invalid private key format. Missing body content.');

  // Decode base64 to DER
  let derBytes: Uint8Array;
  try {
    derBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  } catch (_) {
    throw new Error('Failed to decode base64. Ensure the key content is correct.');
  }

  // If PKCS#1, wrap RSAPrivateKey in PKCS#8 PrivateKeyInfo
  if (isPkcs1) {
    const rsaDer = derBytes;

    // DER helpers
    const derLen = (len: number) => {
      if (len < 0x80) return new Uint8Array([len]);
      const bytes: number[] = [];
      let n = len;
      while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
      return new Uint8Array([0x80 | bytes.length, ...bytes]);
    };
    const derSeq = (content: Uint8Array) => new Uint8Array([0x30, ...derLen(content.length), ...content]);
    const derInt0 = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0
    const derOidRsa = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]); // 1.2.840.113549.1.1.1
    const derNull = new Uint8Array([0x05, 0x00]);
    const algId = derSeq(new Uint8Array([...derOidRsa, ...derNull]));
    const octet = new Uint8Array([0x04, ...derLen(rsaDer.length), ...rsaDer]);
    const pkcs8 = derSeq(new Uint8Array([...derInt0, ...algId, ...octet]));
    derBytes = pkcs8;
  }

  // Import as PKCS#8
  const ab: ArrayBuffer = new ArrayBuffer(derBytes.length);
  new Uint8Array(ab).set(derBytes);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    ab,
    { name: 'RSA-PSS', hash: 'SHA-256' },
    false,
    ['sign']
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

    // Try both Demo and Production environments
    const baseUrls = [
      'https://demo-api.kalshi.co',
      'https://api.kalshi.com'
    ];

    let success = false;
    let lastStatus = 0;
    let lastBody = '';

    for (const base of baseUrls) {
      const url = `${base}${path}`;
      console.log('Validating against', url);
      const response = await fetch(url, {
        headers: {
          'KALSHI-ACCESS-KEY': apiKeyId,
          'KALSHI-ACCESS-SIGNATURE': signature,
          'KALSHI-ACCESS-TIMESTAMP': timestamp,
          'Content-Type': 'application/json',
        },
      });

      lastStatus = response.status;
      lastBody = await response.text().catch(() => '');

      if (response.ok) {
        success = true;
        break;
      }
    }

    if (success) {
      console.log('Credentials validated successfully');
      return new Response(
        JSON.stringify({ valid: true, message: 'Credentials validated successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.error('Kalshi API validation failed:', lastStatus, lastBody);
    return new Response(
      JSON.stringify({ valid: false, error: 'Invalid credentials or wrong environment (Demo vs Production). We tried both.' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Validation error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
