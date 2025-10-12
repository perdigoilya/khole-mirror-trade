import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
          <DialogTitle className="text-xl">Connect Platform</DialogTitle>
          <DialogDescription>
            Choose a trading platform to connect
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 mt-6">
          {/* Kalshi Option */}
          <button
            onClick={() => {
              if (!isKalshiConnected) {
                onSelectKalshi();
              }
            }}
            disabled={isKalshiConnected}
            className={cn(
              "w-full p-5 rounded-lg border-2 transition-all text-left group",
              isKalshiConnected
                ? "border-[hsl(var(--kalshi-teal))]/30 bg-[hsl(var(--kalshi-teal))]/5 cursor-not-allowed"
                : "border-[hsl(var(--kalshi-teal))]/40 hover:border-[hsl(var(--kalshi-teal))] hover:bg-[hsl(var(--kalshi-teal))]/10 cursor-pointer"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-bold text-lg text-[hsl(var(--kalshi-teal))]">Kalshi</span>
                  {isKalshiConnected && (
                    <Badge className="bg-[hsl(var(--kalshi-teal))]/20 text-[hsl(var(--kalshi-teal))] border-[hsl(var(--kalshi-teal))]/30">
                      <Check className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {isKalshiConnected 
                    ? "Account connected with API credentials" 
                    : "Connect with your API key"}
                </p>
              </div>
              {!isKalshiConnected && (
                <ArrowRight className="h-5 w-5 text-[hsl(var(--kalshi-teal))] opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </button>

          {/* Polymarket Option */}
          <button
            onClick={() => {
              if (!isPolymarketConnected) {
                onSelectPolymarket();
              }
            }}
            disabled={isPolymarketConnected}
            className={cn(
              "w-full p-5 rounded-lg border-2 transition-all text-left group",
              isPolymarketConnected
                ? "border-[hsl(var(--polymarket-blue))]/30 bg-[hsl(var(--polymarket-blue))]/5 cursor-not-allowed"
                : "border-[hsl(var(--polymarket-blue))]/40 hover:border-[hsl(var(--polymarket-blue))] hover:bg-[hsl(var(--polymarket-blue))]/10 cursor-pointer"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-bold text-lg text-[hsl(var(--polymarket-blue))]">Polymarket</span>
                  {isPolymarketConnected && (
                    <Badge className="bg-[hsl(var(--polymarket-blue))]/20 text-[hsl(var(--polymarket-blue))] border-[hsl(var(--polymarket-blue))]/30">
                      <Check className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {isPolymarketConnected 
                    ? "Wallet connected via WalletConnect" 
                    : "Connect with your wallet"}
                </p>
              </div>
              {!isPolymarketConnected && (
                <ArrowRight className="h-5 w-5 text-[hsl(var(--polymarket-blue))] opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </button>
        </div>

        {!isKalshiConnected && !isPolymarketConnected && (
          <p className="text-xs text-muted-foreground text-center mt-6 pb-2">
            Connect one or both platforms to manage your portfolio
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
