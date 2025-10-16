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
import { Loader2, Wallet, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { supabase } from "@/integrations/supabase/client";

interface ConnectPolymarketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ConnectPolymarketDialog = ({ open, onOpenChange }: ConnectPolymarketDialogProps) => {
  const { connectPolymarket, polymarketCredentials } = useTrading();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [validationFailed, setValidationFailed] = useState(false);
  const { address, isConnected } = useAccount();
  const { open: openWalletModal } = useWeb3Modal();
  const { disconnect } = useDisconnect();

  const isPolymarketConnected = !!polymarketCredentials;

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
        setValidationFailed(false);
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
    setValidationFailed(false);
    try {
      // Validate wallet through edge function to avoid CORS issues
      const { data, error } = await supabase.functions.invoke('polymarket-validate', {
        body: { walletAddress: address }
      });

      if (error) throw error;

      if (!data.success || data.error) {
        setValidationFailed(true);
        toast({
          title: "Wallet Not Registered on Polymarket DeFi",
          description: "See instructions below to enable DeFi mode",
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
      setValidationFailed(true);
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect to Polymarket</DialogTitle>
          <DialogDescription>
            Connect your wallet and ensure it's registered on Polymarket's DeFi orderbook
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isPolymarketConnected && address ? (
            <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-500">
                    Connected to Polymarket
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 font-mono break-all">
                    {address}
                  </p>
                </div>
              </div>
            </div>
          ) : validationFailed && isConnected && address ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-amber-500">
                        Wallet Not Registered on Polymarket DeFi
                      </p>
                      <p className="text-sm text-muted-foreground mt-1 font-mono break-all">
                        {address}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 p-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="font-medium text-blue-500">Why Is This Happening?</p>
                      <p className="text-muted-foreground mt-1">
                        Polymarket has two modes: <strong>Native</strong> (default) creates a separate smart contract wallet, 
                        while <strong>DeFi mode</strong> uses your actual MetaMask/wallet address. 
                        If you've traded on Polymarket before using Native mode, those funds are in a different address.
                      </p>
                    </div>
                    
                    <div>
                      <p className="font-medium text-foreground">How to Fix:</p>
                      <ol className="list-decimal list-inside space-y-1.5 ml-2 mt-2 text-muted-foreground">
                        <li>Go to <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">polymarket.com</a></li>
                        <li>Settings → Enable "DeFi Trading"</li>
                        <li>Switch to Polygon network when prompted</li>
                        <li>Sign the onboarding message</li>
                        <li>Deposit USDC to your wallet on Polygon (even $1 works)</li>
                        <li>Click "Verify Again" below</li>
                      </ol>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open('https://polymarket.com', '_blank')}
                        className="text-xs"
                      >
                        Open Polymarket
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleWalletConnect}
                        disabled={isLoading}
                        className="text-xs"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          'Verify Again'
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : isConnected && address ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm font-semibold mb-1">Connected Wallet</p>
                <p className="text-sm font-mono text-muted-foreground break-all">
                  {address}
                </p>
              </div>
              
              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 text-sm">
                <p className="text-green-900 dark:text-green-300">
                  ✓ Wallet connected! Click "Save Connection" to verify with Polymarket.
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
