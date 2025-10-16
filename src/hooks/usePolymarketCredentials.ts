import { useSignTypedData } from "wagmi";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTrading } from "@/contexts/TradingContext";

export interface ApiCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
  funderAddress?: string;
}

export function useEnsurePolymarketCredentials() {
  const { signTypedDataAsync } = useSignTypedData();
  const { connectPolymarket } = useTrading();
  const { toast } = useToast();

  const ensureApiCreds = async (address: `0x${string}`, apiKey?: string): Promise<ApiCredentials> => {
    const timeRes = await supabase.functions.invoke('polymarket-time');
    if (timeRes.error) throw new Error(timeRes.error.message || 'Failed to fetch server time');

    const tsRaw = timeRes.data?.timestamp;
    let timestamp = Number(typeof tsRaw === 'string' ? tsRaw.trim() : tsRaw);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      timestamp = Math.floor(Date.now() / 1000);
    }

    const domain = {
      name: "ClobAuthDomain",
      version: "1",
      chainId: 137, // Polygon mainnet
    } as const;

    const types = {
      ClobAuth: [
        { name: "address", type: "address" },
        { name: "timestamp", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "message", type: "string" },
      ],
    } as const;

    const message = {
      address,
      timestamp: String(timestamp),
      nonce: 0n,
      message: "This message attests that I control the given wallet",
    } as const;

    // Request signature from wallet
    const signature = await signTypedDataAsync({
      account: address,
      domain,
      types,
      primaryType: "ClobAuth",
      message,
    });

    // Create/derive API key using the signature via our Edge Function
    const apiKeyResponse = await supabase.functions.invoke('polymarket-create-api-key', {
      body: {
        walletAddress: address,
        signature,
        timestamp,
        nonce: 0,
      }
    });

    if (apiKeyResponse.error) {
      throw new Error(apiKeyResponse.error.message || 'Failed to create API credentials');
    }

    const apiCredentials = apiKeyResponse.data as ApiCredentials;
    const funderAddress = apiCredentials.funderAddress || address;

    // Persist to backend and context
    await connectPolymarket({ 
      walletAddress: address,
      apiKey: apiKey || undefined,
      apiCredentials: {
        ...apiCredentials,
        funderAddress
      }
    });

    toast({
      title: "API Credentials Ready",
      description: "Polymarket trading credentials generated successfully.",
    });

    return apiCredentials;
  };

  return { ensureApiCreds };
}
