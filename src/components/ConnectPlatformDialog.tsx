import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

interface ConnectPlatformDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectKalshi: () => void;
  onSelectPolymarket: () => void;
  isKalshiConnected: boolean;
  isPolymarketConnected: boolean;
}

export function ConnectPlatformDialog({
  open,
  onOpenChange,
  onSelectKalshi,
  onSelectPolymarket,
  isKalshiConnected,
  isPolymarketConnected,
}: ConnectPlatformDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Trading Platform</DialogTitle>
          <DialogDescription>
            Choose which platform you'd like to connect to view your portfolio and trade
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 mt-4">
          {/* Kalshi Option */}
          <Button
            onClick={() => {
              if (!isKalshiConnected) {
                onSelectKalshi();
                onOpenChange(false);
              }
            }}
            variant={isKalshiConnected ? "outline" : "default"}
            disabled={isKalshiConnected}
            className={`w-full h-auto py-4 justify-start ${
              isKalshiConnected 
                ? "opacity-50 cursor-not-allowed border-[hsl(var(--kalshi-teal))]/30" 
                : "border-[hsl(var(--kalshi-teal))] hover:bg-[hsl(var(--kalshi-teal))]/10"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base">Kalshi</span>
                  {isKalshiConnected && (
                    <Badge variant="secondary" className="text-xs bg-[hsl(var(--kalshi-teal))]/20 text-[hsl(var(--kalshi-teal))]">
                      <Check className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  {isKalshiConnected 
                    ? "Your Kalshi account is connected" 
                    : "Connect with API credentials"}
                </span>
              </div>
            </div>
          </Button>

          {/* Polymarket Option */}
          <Button
            onClick={() => {
              if (!isPolymarketConnected) {
                onSelectPolymarket();
                onOpenChange(false);
              }
            }}
            variant={isPolymarketConnected ? "outline" : "default"}
            disabled={isPolymarketConnected}
            className={`w-full h-auto py-4 justify-start ${
              isPolymarketConnected 
                ? "opacity-50 cursor-not-allowed border-[hsl(var(--polymarket-blue))]/30" 
                : "border-[hsl(var(--polymarket-blue))] hover:bg-[hsl(var(--polymarket-blue))]/10"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base">Polymarket</span>
                  {isPolymarketConnected && (
                    <Badge variant="secondary" className="text-xs bg-[hsl(var(--polymarket-blue))]/20 text-[hsl(var(--polymarket-blue))]">
                      <Check className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  {isPolymarketConnected 
                    ? "Your wallet is connected" 
                    : "Connect with WalletConnect"}
                </span>
              </div>
            </div>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          You can connect both platforms to view all your positions in one place
        </p>
      </DialogContent>
    </Dialog>
  );
}
