import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user's JWT and get their ID
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Invalid authentication token");
    }

    // Get user's Polymarket wallet address
    const { data: credentials, error: credError } = await supabase
      .from("user_polymarket_credentials")
      .select("wallet_address")
      .eq("user_id", user.id)
      .maybeSingle();

    if (credError) {
      throw new Error("Failed to fetch credentials");
    }

    if (!credentials || !credentials.wallet_address) {
      return new Response(
        JSON.stringify({ 
          positions: [],
          totalValue: 0,
          message: "No wallet connected" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const walletAddress = credentials.wallet_address;

    // Fetch positions from Polymarket
    const positionsResponse = await fetch(
      `https://data-api.polymarket.com/positions?user=${walletAddress}`
    );

    if (!positionsResponse.ok) {
      throw new Error(`Polymarket API error: ${positionsResponse.statusText}`);
    }

    const positions = await positionsResponse.json();

    // Fetch total value
    const valueResponse = await fetch(
      `https://data-api.polymarket.com/value?user=${walletAddress}`
    );

    let totalValue = 0;
    if (valueResponse.ok) {
      const valueData = await valueResponse.json();
      if (Array.isArray(valueData) && valueData.length > 0) {
        totalValue = valueData[0].value || 0;
      }
    }

    // Calculate summary statistics
    const summary = {
      totalValue,
      totalPnl: positions.reduce((sum: number, pos: any) => sum + (pos.cashPnl || 0), 0),
      totalRealizedPnl: positions.reduce((sum: number, pos: any) => sum + (pos.realizedPnl || 0), 0),
      activePositions: positions.length,
      totalInvested: positions.reduce((sum: number, pos: any) => sum + (pos.initialValue || 0), 0),
    };

    return new Response(
      JSON.stringify({
        positions,
        summary,
        walletAddress,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in polymarket-portfolio function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
