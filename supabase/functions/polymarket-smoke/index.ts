import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const out = (obj: any, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders, ...extra },
  });

const safeJson = (t: string) => {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};

const suffix = (v: any) => (typeof v === "string" && v.length > 6 ? v.slice(-6) : v || "");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const walletAddress: string = body.walletAddress || body.address || "";
    const signature: string = body.signature || ""; // EIP-712 (L1), NOT HMAC
    const timestampRaw: string | number = body.timestamp ?? body.timestampSeconds;
    const nonceRaw: string | number = body.nonce ?? 0;

    // Hard assertions (fail with 400 JSON, don’t throw)
    if (!walletAddress || !signature || timestampRaw === undefined || timestampRaw === null) {
      return out(
        {
          problem: "MissingParams",
          details: { walletAddress: !!walletAddress, signature: !!signature, timestamp: timestampRaw },
        },
        400
      );
    }

    const timestampSeconds = String(timestampRaw);
    if (!/^\d{10}$/.test(timestampSeconds)) {
      return out(
        {
          problem: "InvalidTimestamp",
          details: { timestampSeconds, note: "Must be epoch seconds (10 digits)" },
        },
        400
      );
    }

    const nonce = String(nonceRaw ?? 0);

    // L1 EIP-712 domain + message (echo back; no HMAC here)
    const L1 = {
      domain: { name: "ClobAuthDomain", version: "1", chainId: 137 },
      message: "This message attests that I control the given wallet",
      timestampSeconds,
      nonce,
    } as const;

    // Authenticate user (needed to persist on success)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return out({ problem: "Unauthorized", details: authErr?.message || "No user" }, 401);
    }

    const userId = authData.user.id;

    // Step 1: POST /auth/api-key with explicit empty body and L1 headers (no HMAC)
    const createUrl = "https://clob.polymarket.com/auth/api-key";
    const createHeaders = {
      Accept: "application/json",
      "Content-Type": "application/json",
      POLY_ADDRESS: walletAddress,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: timestampSeconds,
      POLY_NONCE: nonce,
    } as const;

    const createResp = await fetch(createUrl, {
      method: "POST",
      headers: createHeaders,
      body: JSON.stringify({}), // explicit empty JSON
    });
    const createTxt = await createResp.text();
    const createUpstream = safeJson(createTxt);
    const createCf = {
      "cf-ray": createResp.headers.get("cf-ray") || "",
      "cf-cache-status": createResp.headers.get("cf-cache-status") || "",
      server: createResp.headers.get("server") || "",
      "content-type": createResp.headers.get("content-type") || "",
    };

    let deriveStatus = 0;
    let deriveUpstream: any = null;
    let cf = createCf; // top-level cf echo (last attempt)
    let ready = false;
    let key: string | undefined;
    let secret: string | undefined;
    let passphrase: string | undefined;

    // If create non-2xx → call GET /auth/derive-api-key with the same L1 headers (reusing signature/timestamp/nonce)
    if (!createResp.ok) {
      const deriveUrl = `https://clob.polymarket.com/auth/derive-api-key?nonce=${encodeURIComponent(nonce)}`;
      const deriveHeaders = {
        Accept: "application/json",
        POLY_ADDRESS: walletAddress,
        POLY_SIGNATURE: signature,
        POLY_TIMESTAMP: timestampSeconds,
        POLY_NONCE: nonce,
      } as const;

      const deriveResp = await fetch(deriveUrl, { method: "GET", headers: deriveHeaders });
      const deriveTxt = await deriveResp.text();
      deriveUpstream = safeJson(deriveTxt);
      deriveStatus = deriveResp.status;
      cf = {
        "cf-ray": deriveResp.headers.get("cf-ray") || "",
        "cf-cache-status": deriveResp.headers.get("cf-cache-status") || "",
        server: deriveResp.headers.get("server") || "",
        "content-type": deriveResp.headers.get("content-type") || "",
      };

      if (deriveResp.ok && deriveUpstream?.apiKey && deriveUpstream?.secret && deriveUpstream?.passphrase) {
        key = deriveUpstream.apiKey;
        secret = deriveUpstream.secret;
        passphrase = deriveUpstream.passphrase;
        // Persist creds for this user
        const { error: upErr } = await supabase
          .from("user_polymarket_credentials")
          .upsert(
            {
              user_id: userId,
              wallet_address: walletAddress.toLowerCase(),
              api_credentials_key: key,
              api_credentials_secret: secret,
              api_credentials_passphrase: passphrase,
            },
            { onConflict: "user_id" }
          );
        if (upErr) {
          // Do not hide persistence error; return as part of diagnostics
          return out({
            EOA: walletAddress,
            L1,
            createApiKey: { status: createResp.status, upstream: createUpstream },
            deriveApiKey: { status: deriveStatus, upstream: deriveUpstream },
            accessStatus: null,
            cf,
            ready: true,
            persistence: { problem: "UpsertFailed", details: upErr.message },
          });
        }
        ready = true;
      }
    } else {
      // Create returned something; try to read tuple from upstream if present and persist
      if (createUpstream?.apiKey && createUpstream?.secret && createUpstream?.passphrase) {
        key = createUpstream.apiKey;
        secret = createUpstream.secret;
        passphrase = createUpstream.passphrase;
        const { error: upErr } = await supabase
          .from("user_polymarket_credentials")
          .upsert(
            {
              user_id: userId,
              wallet_address: walletAddress.toLowerCase(),
              api_credentials_key: key,
              api_credentials_secret: secret,
              api_credentials_passphrase: passphrase,
            },
            { onConflict: "user_id" }
          );
        if (upErr) {
          return out({
            EOA: walletAddress,
            L1,
            createApiKey: { status: createResp.status, upstream: createUpstream },
            deriveApiKey: { status: deriveStatus, upstream: deriveUpstream },
            accessStatus: null,
            cf,
            ready: true,
            persistence: { problem: "UpsertFailed", details: upErr.message },
          });
        }
        ready = true;
      }
    }

    // If still not ready → surface access-status (onboarding/region/cert)
    let accessStatus = null as any;
    if (!ready) {
      const accUrl = `https://clob.polymarket.com/auth/access-status?address=${encodeURIComponent(walletAddress)}`;
      const accResp = await fetch(accUrl, { method: "GET" });
      const accTxt = await accResp.text();
      accessStatus = { status: accResp.status, body: safeJson(accTxt) };
      cf = {
        "cf-ray": accResp.headers.get("cf-ray") || cf["cf-ray"],
        "cf-cache-status": accResp.headers.get("cf-cache-status") || cf["cf-cache-status"],
        server: accResp.headers.get("server") || cf["server"],
        "content-type": accResp.headers.get("content-type") || cf["content-type"],
      };
    }

    // Return diagnostics verbatim; never hide upstream
    return out({
      EOA: walletAddress,
      L1,
      createApiKey: { status: createResp.status, upstream: createUpstream },
      deriveApiKey: { status: deriveStatus || 0, upstream: deriveUpstream },
      accessStatus,
      cf,
      ready,
    });
  } catch (e: any) {
    return out({ ok: false, error: "EdgeCrash", message: e?.message, stack: e?.stack }, 500);
  }
});
