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
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleClear = () => {
    setApiKey("");
  };

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "Missing API Key",
        description: "Please provide your Polymarket API key",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await connectPolymarket({ apiKey: apiKey.trim() });
      
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
            Enter your Polymarket API credentials to enable trading.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              placeholder="Your Polymarket API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
            />
          </div>

          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="font-semibold mb-2">How to get your API Key:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Go to Polymarket settings</li>
              <li>Navigate to API section</li>
              <li>Generate a new API key</li>
              <li>Copy and paste it here</li>
            </ol>
          </div>

          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 text-sm">
            <p className="text-blue-900 dark:text-blue-300">
              🔒 Your API key is encrypted and stored securely. It never leaves your account.
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
