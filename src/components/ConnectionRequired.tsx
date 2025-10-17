import { useState } from "react";
import { Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectKalshiDialog } from "@/components/ConnectKalshiDialog";

interface ConnectionRequiredProps {
  provider?: 'kalshi' | 'polymarket';
}

export const ConnectionRequired = ({ provider = 'kalshi' }: ConnectionRequiredProps) => {
  const [showDialog, setShowDialog] = useState(false);
  
  const isKalshi = provider === 'kalshi';
  const platformName = isKalshi ? 'Kalshi' : 'Polymarket';
  const platformColor = isKalshi ? 'bg-kalshi-teal' : 'bg-polymarket-purple';
  const platformColorLight = isKalshi ? 'bg-kalshi-teal/10' : 'bg-polymarket-purple/10';
  const platformTextColor = isKalshi ? 'text-kalshi-teal' : 'text-polymarket-purple';

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className={`p-4 rounded-full ${platformColorLight} mb-6`}>
          <Key className={`h-12 w-12 ${platformTextColor}`} />
        </div>
        <h2 className="text-3xl font-bold mb-4">Connect to {platformName}</h2>
        <p className="text-muted-foreground max-w-md mb-8">
          You need to connect your {platformName} {isKalshi ? 'API credentials' : 'wallet'} to access this feature. 
          Your {isKalshi ? 'credentials are' : 'wallet is'} stored securely.
        </p>
        <Button
          onClick={() => setShowDialog(true)}
          size="lg"
          className={`${platformColor} hover:opacity-90 text-white font-semibold`}
        >
          <Key className="h-4 w-4 mr-2" />
          Connect to {platformName}
        </Button>
      </div>
      <ConnectKalshiDialog open={showDialog} onOpenChange={setShowDialog} />
    </>
  );
};
