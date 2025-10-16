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
    const resp = await fetch('https://clob.polymarket.com/time');
    if (!resp.ok) {
      const errTxt = await resp.text();
      return new Response(
        JSON.stringify({ error: `Failed to fetch server time: ${resp.status} ${errTxt}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const data = await resp.json();
    // Expecting { timestamp: "..." } or similar; normalize to string
    const ts = typeof data?.timestamp === 'string' ? data.timestamp : String(data?.timestamp ?? '');
    return new Response(
      JSON.stringify({ timestamp: ts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});