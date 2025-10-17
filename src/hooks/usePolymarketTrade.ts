import { useSignTypedData } from "wagmi";
import { useToast } from "@/hooks/use-toast";
import { buildPolymarketOrder, formatSignedOrder, POLYMARKET_ORDER_DOMAIN, POLYMARKET_ORDER_TYPES } from "@/lib/polymarket-orders";
import { generatePolymarketHMAC } from "@/lib/polymarket-auth";

const CLOB_API_URL = "https://clob.polymarket.com";

interface TradeParams {
  tokenId: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  walletAddress: string;
  funderAddress?: string;
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
}

export function usePolymarketTrade() {
  const { signTypedDataAsync } = useSignTypedData();
  const { toast } = useToast();

  const executeTrade = async (params: TradeParams) => {
    try {
      const {
        tokenId,
        price,
        size,
        side,
        walletAddress,
        funderAddress,
        apiKey,
        apiSecret,
        apiPassphrase,
      } = params;

      // Step 1: Build the order
      const order = buildPolymarketOrder({
        tokenId,
        price,
        size,
        side,
        walletAddress,
        funderAddress,
        signatureType: 2, // Browser wallet
      });

      console.log("📝 Built order:", order);

      // Step 2: Sign the order with wallet
      const orderSignature = await signTypedDataAsync({
        account: walletAddress as `0x${string}`,
        domain: POLYMARKET_ORDER_DOMAIN,
        types: POLYMARKET_ORDER_TYPES,
        primaryType: "Order",
        message: order,
      });

      console.log("✍️ Wallet signature obtained");

      // Step 3: Format the signed order
      const signedOrder = formatSignedOrder(order, orderSignature);
      console.log("📦 Formatted signed order");

      // Step 4: Submit order to Polymarket CLOB API
      const requestPath = "/order";
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify(signedOrder);

      // Step 5: Generate HMAC signature for API authentication
      const hmacSignature = await generatePolymarketHMAC(
        timestamp,
        "POST",
        requestPath,
        body,
        apiSecret
      );

      console.log("🔐 HMAC signature generated");

      // Step 6: Make the request directly from browser
      const response = await fetch(`${CLOB_API_URL}${requestPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "POLY_ADDRESS": funderAddress || walletAddress,
          "POLY_SIGNATURE": hmacSignature,
          "POLY_TIMESTAMP": timestamp.toString(),
          "POLY_API_KEY": apiKey,
          "POLY_PASSPHRASE": apiPassphrase,
        },
        body,
      });

      const responseText = await response.text();
      console.log(`📡 Response [${response.status}]:`, responseText);

      if (!response.ok) {
        throw new Error(`Trade failed: ${response.status} - ${responseText}`);
      }

      const result = JSON.parse(responseText);

      toast({
        title: "Trade Successful",
        description: `${side} order placed for ${size} shares at $${price}`,
      });

      return { success: true, data: result };
    } catch (error: any) {
      console.error("❌ Trade error:", error);
      
      const errorMessage = error.message || "Unknown error occurred";
      
      toast({
        title: "Trade Failed",
        description: errorMessage,
        variant: "destructive",
      });

      return { success: false, error: errorMessage };
    }
  };

  return { executeTrade };
}
