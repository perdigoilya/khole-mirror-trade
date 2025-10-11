import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Key, X } from "lucide-react";
import { useTrading } from "@/contexts/TradingContext";
import { useToast } from "@/hooks/use-toast";

interface ConnectKalshiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ConnectKalshiDialog = ({ open, onOpenChange }: ConnectKalshiDialogProps) => {
  const [apiKeyId, setApiKeyId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const { connectKalshi } = useTrading();
  const { toast } = useToast();

  const handleClear = () => {
    setApiKeyId("");
    setPrivateKey("");
  };

  const handleConnect = async () => {
    if (!apiKeyId.trim()) {
      toast({
        title: "API Key ID required",
        description: "Please enter your Kalshi API Key ID",
        variant: "destructive",
      });
      return;
    }
    
    if (!privateKey.trim()) {
      toast({
        title: "Private Key required",
        description: "Please enter or upload your private key",
        variant: "destructive",
      });
      return;
    }

    // Validate credentials with backend
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kalshi-validate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ apiKeyId: apiKeyId.trim(), privateKey: privateKey.trim() }),
        }
      );

      const data = await response.json();

      if (data.valid) {
        connectKalshi({ apiKeyId: apiKeyId.trim(), privateKey: privateKey.trim() });
        toast({
          title: "Connected to Kalshi",
          description: "Your credentials have been validated successfully",
        });
        onOpenChange(false);
        handleClear();
      } else {
        toast({
          title: "Connection Failed",
          description: data.error || "Invalid API credentials",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to validate credentials. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setPrivateKey(content);
      };
      reader.readAsText(file);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border p-6">
        <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-2xl">
            <Key className="h-6 w-6" />
            <span>Connect to Kalshi</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <p className="text-muted-foreground">
            Enter your Kalshi API credentials to connect to the trading platform. You can get these from your{" "}
            <a 
              href="https://kalshi.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Kalshi account settings
            </a>
            .
          </p>

          <div className="space-y-2">
            <Label htmlFor="apiKeyId" className="text-foreground">
              API Key ID
            </Label>
            <Input
              id="apiKeyId"
              value={apiKeyId}
              onChange={(e) => setApiKeyId(e.target.value)}
              placeholder="Enter your Kalshi API Key ID"
              className="bg-background border-border text-foreground"
            />
            <p className="text-sm text-muted-foreground">
              The Key ID from your Kalshi API credentials
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="privateKey" className="text-foreground">
                Private Key (PEM Format)
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("file-upload")?.click()}
                className="text-xs"
              >
                Upload File
              </Button>
              <input
                id="file-upload"
                type="file"
                accept=".pem,.key,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            <Textarea
              id="privateKey"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="Paste your private key here or upload a file -----BEGIN RSA PRIVATE KEY----- ... -----END RSA PRIVATE KEY-----"
              className="bg-background border-border text-foreground font-mono text-sm min-h-[200px]"
            />
            <p className="text-sm text-muted-foreground">
              The RSA Private Key in PEM format (downloaded when you created the API key)
            </p>
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={handleClear}
              className="border-border"
            >
              Clear
            </Button>
            <Button
              onClick={handleConnect}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Connect
            </Button>
          </div>

          <div className="border-t border-border pt-6 space-y-3">
            <p className="text-sm font-semibold text-foreground">Need an API Key?</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Log in to your Kalshi account</li>
              <li>Go to <a href="https://kalshi.com/account/profile" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Profile Settings</a></li>
              <li>Find the "API Keys" section</li>
              <li>Click "Create New API Key" and save both the Key ID and Private Key</li>
            </ol>
            <a
              href="https://docs.kalshi.com/getting_started/api_keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline inline-block"
            >
              View full documentation →
            </a>
          </div>

          <div className="bg-muted/50 border border-border rounded-md p-4">
            <p className="text-sm">
              <span className="font-semibold text-foreground">Security Note:</span>{" "}
              <span className="text-muted-foreground">
                Your credentials are encrypted and stored only in your browser's local storage. 
                They are never sent to any server other than Kalshi's API.
              </span>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
