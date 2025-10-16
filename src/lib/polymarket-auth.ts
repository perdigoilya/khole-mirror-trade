/**
 * Generate HMAC signature for Polymarket CLOB API L2 authentication
 */
export async function generatePolymarketHMAC(
  timestamp: number,
  method: string,
  requestPath: string,
  body: string,
  secret: string
): Promise<string> {
  // Create the message to sign: timestamp + method + requestPath + body
  const message = `${timestamp}${method}${requestPath}${body}`;
  
  // Convert secret to Uint8Array
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  
  // Import key for HMAC
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Sign the message
  const messageData = encoder.encode(message);
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  
  // Convert to base64
  const signatureArray = Array.from(new Uint8Array(signature));
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
  
  return signatureBase64;
}

/**
 * Generate L2 auth headers for Polymarket CLOB API
 */
export async function generatePolymarketHeaders(
  address: string,
  apiKey: string,
  secret: string,
  passphrase: string,
  method: string,
  requestPath: string,
  body: any
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyString = JSON.stringify(body);
  
  const signature = await generatePolymarketHMAC(
    timestamp,
    method,
    requestPath,
    bodyString,
    secret
  );
  
  return {
    'Content-Type': 'application/json',
    'POLY_ADDRESS': address,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp.toString(),
    'POLY_API_KEY': apiKey,
    'POLY_PASSPHRASE': passphrase,
  };
}
