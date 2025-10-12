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
      await connectPolymarket({ walletAddress: address });
      
      toast({
        title: "Connected",
        description: "Successfully connected to Polymarket",
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
              <div className="rounded-lg bg-muted p-4 text-sm">
                <p className="font-semibold mb-2">How WalletConnect works:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Click "Connect Wallet" below</li>
                  <li>Choose your wallet (MetaMask, Coinbase, etc.)</li>
                  <li>Approve the connection in your wallet</li>
                  <li>Your wallet address will be securely stored</li>
                </ol>
              </div>

              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 text-sm">
                <p className="text-blue-900 dark:text-blue-300">
                  🔒 No private keys needed. Your funds stay in your wallet. WalletConnect is the industry-standard secure connection protocol.
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
