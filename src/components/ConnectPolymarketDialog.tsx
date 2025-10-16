import { useState } from "react";
import { useTrading } from "@/contexts/TradingContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wallet } from "lucide-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { supabase } from "@/integrations/supabase/client";

interface ConnectPolymarketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ConnectPolymarketDialog = ({ open, onOpenChange }: ConnectPolymarketDialogProps) => {
  const { connectPolymarket } = useTrading();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { address, isConnected } = useAccount();
  const { open: openWalletModal } = useWeb3Modal();
  const { disconnect } = useDisconnect();

  const handleDialogClose = (newOpen: boolean) => {
    // Clean up wallet connection state when dialog is closed
    if (!newOpen && !address) {
      disconnect();
    }
    onOpenChange(newOpen);
  };

  const handleWalletConnect = async () => {
    if (!isConnected) {
      try {
        // Open WalletConnect modal
        setIsLoading(true);
        await openWalletModal();
        // Note: Connection happens asynchronously, modal closing doesn't mean success/failure
      } catch (error: any) {
        console.error("Wallet modal error:", error);
        toast({
          title: "Connection Cancelled",
          description: "Please try connecting again",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!address) {
      toast({
        title: "No wallet address",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Validate wallet through edge function to avoid CORS issues
      const { data, error } = await supabase.functions.invoke('polymarket-validate', {
        body: { walletAddress: address }
      });

      if (error) throw error;

      if (!data.success || data.error) {
        toast({
          title: data.error || "Validation Failed",
          description: data.details || "Failed to validate wallet",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      const balance = data.balance || 0;

      if (balance === 0) {
        toast({
          title: "Warning: Zero Balance",
          description: "Your Polymarket account has no funds. Deposit USDC at polymarket.com to start trading.",
          variant: "destructive",
        });
      }

      await connectPolymarket({ walletAddress: address });
      
      toast({
        title: "Connected Successfully",
        description: `Polymarket account connected with $${balance.toFixed(2)} available`,
      });
      
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect to Polymarket",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Connect to Polymarket</DialogTitle>
          <DialogDescription>
            Connect your wallet securely using WalletConnect.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isConnected && address ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm font-semibold mb-1">Connected Wallet</p>
                <p className="text-sm font-mono text-muted-foreground break-all">
                  {address}
                </p>
              </div>
              
              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 text-sm">
                <p className="text-green-900 dark:text-green-300">
                  ✓ Wallet connected! Click "Save Connection" to enable trading.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 text-sm mb-4">
                <p className="font-semibold text-amber-900 dark:text-amber-300 mb-2">⚠️ Important: Set up Polymarket first</p>
                <p className="text-amber-800 dark:text-amber-400">
                  Before connecting here, you must create a Polymarket account and deposit funds. Follow the guide below.
                </p>
              </div>

              <div className="rounded-lg bg-muted p-4 text-sm space-y-4">
                <p className="font-semibold text-base mb-3">📋 Step-by-Step Setup Guide:</p>
                
                <div className="space-y-3">
                  <div className="pl-2">
                    <span className="font-semibold text-foreground">Step 1: Get a Crypto Wallet</span>
                    <p className="text-muted-foreground mt-1">
                      If you don't have a crypto wallet yet, download one:
                    </p>
                    <ul className="list-disc list-inside ml-4 mt-1 text-muted-foreground space-y-1">
                      <li>
                        <a 
                          href="https://metamask.io/download/" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          MetaMask (Browser Extension)
                        </a>
                      </li>
                      <li>
                        <a 
                          href="https://www.coinbase.com/wallet" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Coinbase Wallet (Mobile & Browser)
                        </a>
                      </li>
                    </ul>
                  </div>

                  <div className="pl-2">
                    <span className="font-semibold text-foreground">Step 2: Create Polymarket Account</span>
                    <p className="text-muted-foreground mt-1">
                      Visit{" "}
                      <a 
                        href="https://polymarket.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        polymarket.com
                      </a>
                      {" "}and connect your wallet to create an account.
                    </p>
                  </div>

                  <div className="pl-2">
                    <span className="font-semibold text-foreground">Step 3: Get USDC (Required for Trading)</span>
                    <p className="text-muted-foreground mt-1">
                      Polymarket uses USDC for all trades. You can:
                    </p>
                    <ul className="list-disc list-inside ml-4 mt-1 text-muted-foreground space-y-1">
                      <li>
                        Buy USDC directly on{" "}
                        <a 
                          href="https://polymarket.com/deposit" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Polymarket's deposit page
                        </a>
                      </li>
                      <li>Transfer USDC from another exchange (Coinbase, Binance, etc.)</li>
                      <li>
                        Bridge ETH to USDC on{" "}
                        <a 
                          href="https://bridge.polygon.technology/" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Polygon Bridge
                        </a>
                      </li>
                    </ul>
                  </div>

                  <div className="pl-2">
                    <span className="font-semibold text-foreground">Step 4: Return Here & Connect</span>
                    <p className="text-muted-foreground mt-1">
                      Once your Polymarket account has USDC, click "Connect Wallet" below and select the same wallet you used on Polymarket.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 mt-4">
                  <p className="text-sm text-blue-900 dark:text-blue-300">
                    💡 <span className="font-semibold">Need help?</span> Visit the{" "}
                    <a 
                      href="https://polymarket.com/faq" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="underline hover:text-blue-700 dark:hover:text-blue-100"
                    >
                      Polymarket FAQ
                    </a>
                    {" "}or{" "}
                    <a 
                      href="https://docs.polymarket.com/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="underline hover:text-blue-700 dark:hover:text-blue-100"
                    >
                      Documentation
                    </a>
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 text-sm mt-4">
                <p className="text-green-900 dark:text-green-300">
                  🔒 Your wallet connection is secure. We only verify your wallet is registered on Polymarket - we never access your funds.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          {isConnected && address ? (
            <>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={isLoading}
              >
                Disconnect
              </Button>
              <Button
                onClick={handleWalletConnect}
                disabled={isLoading}
                className="bg-[hsl(var(--polymarket-blue))] hover:bg-[hsl(var(--polymarket-blue))]/90"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Connection
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => handleDialogClose(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleWalletConnect}
                disabled={isLoading}
                className="bg-[hsl(var(--polymarket-blue))] hover:bg-[hsl(var(--polymarket-blue))]/90"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {!isLoading && <Wallet className="mr-2 h-4 w-4" />}
                Connect Wallet
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
