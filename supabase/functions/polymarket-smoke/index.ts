import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function createOrDeriveApiKey({
  walletAddress,
  signature,
  timestamp,
  nonce,
}: {
  walletAddress: string;
  signature: string;
  timestamp: number | string;
  nonce: number | string;
}) {
  // Try create first (POST /auth/api-key)
  const createResp = await fetch("https://clob.polymarket.com/auth/api-key", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      POLY_ADDRESS: walletAddress,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: String(timestamp),
      POLY_NONCE: String(nonce),
    },
    body: JSON.stringify({}),
  });

  let createBody: any = null;
  try {
    const txt = await createResp.text();
    createBody = txt ? JSON.parse(txt) : null;
  } catch (_) {
    // leave as text
  }

  if (createResp.ok) {
    return { step: "create", status: createResp.status, body: createBody };
  }

  // Fallback to derive (GET /auth/derive-api-key)
  const deriveResp = await fetch(`https://clob.polymarket.com/auth/derive-api-key?nonce=${String(nonce)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      POLY_ADDRESS: walletAddress,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: String(timestamp),
      POLY_NONCE: String(nonce),
    },
  });

  let deriveBody: any = null;
  try {
    const txt = await deriveResp.text();
    deriveBody = txt ? JSON.parse(txt) : null;
  } catch (_) {}

  if (deriveResp.ok) {
    return { step: "derive", status: deriveResp.status, body: deriveBody };
  }

  // Access status (public) to see why
  const accessResp = await fetch(
    `https://clob.polymarket.com/auth/access-status?address=${walletAddress}`
  );
  let accessBody: any = null;
  try {
    const txt = await accessResp.text();
    accessBody = txt ? JSON.parse(txt) : null;
  } catch (_) {}

  return {
    step: "access-status",
    status: deriveResp.status,
    body: {
      create: { status: createResp.status, body: createBody },
      derive: { status: deriveResp.status, body: deriveBody },
      access: { status: accessResp.status, body: accessBody },
    },
  } as const;
}

async function hmac(headersSecret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(headersSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const b = Array.from(new Uint8Array(sig));
  return btoa(String.fromCharCode(...b));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      walletAddress,
      signature, // EIP-712 (L1)
      timestamp, // seconds
      nonce = 0,
      runHmacTest = true,
    } = await req.json();

    if (!walletAddress || !signature || !timestamp) {
      return new Response(
        JSON.stringify({ error: "Missing walletAddress, signature, or timestamp" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth the user and load creds (or create/derive them if absent)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: authErr?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = auth.user.id;

    // Load creds
    const { data: credRow } = await supabase
      .from("user_polymarket_credentials")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    let apiKey: string | null = credRow?.api_credentials_key || credRow?.api_key || null;
    let apiSecret: string | null = credRow?.api_credentials_secret || null;
    let apiPassphrase: string | null = credRow?.api_credentials_passphrase || null;

    // If missing creds, attempt create/derive
    let l1Result: any = null;
    if (!apiKey || !apiSecret || !apiPassphrase) {
      l1Result = await createOrDeriveApiKey({ walletAddress, signature, timestamp, nonce });
      if (l1Result?.body?.key && l1Result?.body?.secret && l1Result?.body?.passphrase) {
        apiKey = l1Result.body.key;
        apiSecret = l1Result.body.secret;
        apiPassphrase = l1Result.body.passphrase;
        // Persist
        await supabase.from("user_polymarket_credentials").upsert({
          user_id: userId,
          wallet_address: walletAddress,
          api_credentials_key: apiKey,
          api_credentials_secret: apiSecret,
          api_credentials_passphrase: apiPassphrase,
        });
      }
    }

    const credsPresent = Boolean(apiKey && apiSecret && apiPassphrase);

    // If requested, perform an L2 HMAC test using a safe GET
    let hmacTest: any = null;
    if (runHmacTest && credsPresent) {
      const ts = Math.floor(Date.now() / 1000);
      const method = "GET";
      const path = "/auth/ban-status/closed-only"; // documented L2 endpoint
      const body = ""; // GET => empty string
      const preimage = `${ts}${method}${path}${body}`;
      const sig = await hmac(apiSecret!, preimage);

      const testResp = await fetch(`https://clob.polymarket.com${path}`, {
        method,
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Referer: "https://polymarket.com/",
          Origin: "https://polymarket.com",
          POLY_ADDRESS: walletAddress.toLowerCase(),
          POLY_SIGNATURE: sig,
          POLY_TIMESTAMP: String(ts),
          POLY_API_KEY: apiKey!,
          POLY_PASSPHRASE: apiPassphrase!,
        },
      });

      let upstream: any = null;
      try {
        const txt = await testResp.text();
        upstream = txt ? JSON.parse(txt) : txt;
      } catch (_) {
        upstream = null;
      }
      hmacTest = {
        status: testResp.status,
        ok: testResp.ok,
        upstream,
        preimage,
      };
    }

    return new Response(
      JSON.stringify({
        ok: true,
        l1Result,
        credsPresent,
        hmacTest,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
