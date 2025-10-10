import { useState } from "react";
import { Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectKalshiDialog } from "@/components/ConnectKalshiDialog";

export const ConnectionRequired = () => {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="p-4 rounded-full bg-primary/10 mb-6">
          <Key className="h-12 w-12 text-primary" />
        </div>
        <h2 className="text-3xl font-bold mb-4">Connect to Kalshi</h2>
        <p className="text-muted-foreground max-w-md mb-8">
          You need to connect your Kalshi API credentials to access this feature. 
          Your credentials are stored securely in your browser.
        </p>
        <Button
          onClick={() => setShowDialog(true)}
          size="lg"
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
        >
          <Key className="h-4 w-4 mr-2" />
          Connect to Kalshi
        </Button>
      </div>
      <ConnectKalshiDialog open={showDialog} onOpenChange={setShowDialog} />
    </>
  );
};
