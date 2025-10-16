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
          title: "Wallet Uses Proxy Trading",
          description: "Your wallet trades via Polymarket's proxy. Click 'Connect Anyway' to proceed.",
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
        description: `Polymarket wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`,
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

  const handleConnectAnyway = async () => {
    if (!address) return;
    
    setIsLoading(true);
    try {
      await connectPolymarket({ walletAddress: address });
      
      toast({
        title: "Wallet Connected",
        description: `Connected ${address.slice(0, 6)}...${address.slice(-4)}`,
      });
      
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect wallet",
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
            Connect your wallet - works with both proxy and direct trading setups
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
                        Wallet Uses Proxy Trading
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
                      <p className="font-medium text-blue-500">What's Happening?</p>
                      <p className="text-muted-foreground mt-1">
                        When you trade on Polymarket.com, it uses a <strong>proxy wallet</strong> (smart contract) 
                        instead of your EOA directly. This proxy holds your positions and USDC. 
                        Our platform can't verify proxy setups, but <strong>you can still connect</strong>.
                      </p>
                    </div>
                    
                    <div>
                      <p className="font-medium text-foreground">Two Options:</p>
                      <ol className="list-decimal list-inside space-y-1.5 ml-2 mt-2 text-muted-foreground">
                        <li><strong>Connect Anyway</strong> (Recommended) - Use your current wallet as-is</li>
                        <li><strong>Advanced:</strong> Set up direct EOA trading via the{" "}
                          <a 
                            href="https://docs.polymarket.com/developers/CLOB/authentication" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            CLOB API
                          </a>
                          {" "}for on-chain verification
                        </li>
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
                        size="sm"
                        onClick={handleConnectAnyway}
                        disabled={isLoading}
                        className="text-xs bg-[hsl(var(--polymarket-blue))] hover:bg-[hsl(var(--polymarket-blue))]/90"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          'Connect Anyway'
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
              <div className="rounded-lg bg-muted p-4 text-sm space-y-4">
                <p className="font-semibold text-base mb-3">📋 Quick Start Guide:</p>
                
                <div className="space-y-3">
                  <div className="pl-2">
                    <span className="font-semibold text-foreground">Step 1: Get a Wallet</span>
                    <p className="text-muted-foreground mt-1">
                      Download <a 
                        href="https://metamask.io/download/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >MetaMask</a> or <a 
                        href="https://www.coinbase.com/wallet" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >Coinbase Wallet</a>
                    </p>
                  </div>

                  <div className="pl-2">
                    <span className="font-semibold text-foreground">Step 2: Fund Your Wallet</span>
                    <p className="text-muted-foreground mt-1">
                      Get USDC on Polygon at{" "}
                      <a 
                        href="https://polymarket.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        polymarket.com
                      </a> or buy from an exchange
                    </p>
                  </div>

                  <div className="pl-2">
                    <span className="font-semibold text-foreground">Step 3: Connect Here</span>
                    <p className="text-muted-foreground mt-1">
                      Click "Connect Wallet" below and approve the connection
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 mt-4">
                  <p className="text-sm text-blue-900 dark:text-blue-300">
                    💡 Already trading on Polymarket? Just connect the same wallet -{" "}
                    <strong>proxy wallets work fine</strong>!
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 text-sm mt-4">
                <p className="text-green-900 dark:text-green-300">
                  🔒 Secure connection - we never access your funds
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
