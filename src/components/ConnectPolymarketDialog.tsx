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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface ConnectPolymarketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ConnectPolymarketDialog = ({ open, onOpenChange }: ConnectPolymarketDialogProps) => {
  const { connectPolymarket } = useTrading();
  const { toast } = useToast();
  const [privateKey, setPrivateKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleClear = () => {
    setPrivateKey("");
  };

  const handleConnect = async () => {
    if (!privateKey.trim()) {
      toast({
        title: "Missing Private Key",
        description: "Please provide your Polymarket wallet private key",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await connectPolymarket({ privateKey: privateKey.trim() });
      
      toast({
        title: "Connected",
        description: "Successfully connected to Polymarket",
      });
      
      onOpenChange(false);
      handleClear();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Connect to Polymarket</DialogTitle>
          <DialogDescription>
            Enter your wallet private key to enable trading.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="privateKey">Wallet Private Key</Label>
            <Input
              id="privateKey"
              placeholder="0x..."
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              type="password"
            />
          </div>

          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="font-semibold mb-2">How to get your private key:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Connect via email or wallet on Polymarket</li>
              <li>Export your private key from your wallet</li>
              <li>Copy and paste it here (starts with 0x)</li>
            </ol>
          </div>

          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 text-sm">
            <p className="text-blue-900 dark:text-blue-300">
              🔒 Your private key is encrypted and stored securely. It never leaves your account.
            </p>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={isLoading}
          >
            Clear
          </Button>
          <Button
            onClick={handleConnect}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
