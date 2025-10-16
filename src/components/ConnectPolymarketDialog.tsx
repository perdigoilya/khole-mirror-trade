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

  const handleWalletConnect = async () => {
    if (!isConnected) {
      // Open WalletConnect modal
      await openWalletModal();
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

      if (data.error) {
        toast({
          title: data.error,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                  Before connecting here, you must create a Polymarket account and deposit funds at polymarket.com
                </p>
              </div>

              <div className="rounded-lg bg-muted p-4 text-sm">
                <p className="font-semibold mb-2">Step-by-Step Guide:</p>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li className="pl-2">
                    <span className="font-medium text-foreground">Create Polymarket Account:</span>
                    <br />Visit polymarket.com and connect your wallet there first
                  </li>
                  <li className="pl-2">
                    <span className="font-medium text-foreground">Deposit Funds:</span>
                    <br />Add USDC to your Polymarket account (required for trading)
                  </li>
                  <li className="pl-2">
                    <span className="font-medium text-foreground">Return Here:</span>
                    <br />Click "Connect Wallet" below and select the same wallet
                  </li>
                  <li className="pl-2">
                    <span className="font-medium text-foreground">Verify Connection:</span>
                    <br />We'll check that your wallet is registered on Polymarket
                  </li>
                </ol>
              </div>

              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 text-sm">
                <p className="text-blue-900 dark:text-blue-300">
                  🔒 Your wallet must be the same one used on Polymarket. We'll verify it has funds before allowing trades.
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
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleWalletConnect}
                className="bg-[hsl(var(--polymarket-blue))] hover:bg-[hsl(var(--polymarket-blue))]/90"
              >
                <Wallet className="mr-2 h-4 w-4" />
                Connect Wallet
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
