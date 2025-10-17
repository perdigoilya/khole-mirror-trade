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
  onDisconnectKalshi: () => void;
  onDisconnectPolymarket: () => void;
  isKalshiConnected: boolean;
  isPolymarketConnected: boolean;
}

export function ConnectPlatformDialog({
  open,
  onOpenChange,
  onSelectKalshi,
  onSelectPolymarket,
  onDisconnectKalshi,
  onDisconnectPolymarket,
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
              if (isKalshiConnected) {
                onDisconnectKalshi();
              } else {
                onSelectKalshi();
              }
            }}
            className={cn(
              "w-full p-5 rounded-lg border-2 transition-all text-left group cursor-pointer",
              isKalshiConnected
                ? "border-[hsl(var(--kalshi-teal))]/30 bg-[hsl(var(--kalshi-teal))]/5 hover:border-red-500/50 hover:bg-red-500/5"
                : "border-[hsl(var(--kalshi-teal))]/40 hover:border-[hsl(var(--kalshi-teal))] hover:bg-[hsl(var(--kalshi-teal))]/10"
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
                    ? "Account connected - Click to disconnect" 
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
              if (isPolymarketConnected) {
                onDisconnectPolymarket();
              } else {
                onSelectPolymarket();
              }
            }}
            className={cn(
              "w-full p-5 rounded-lg border-2 transition-all text-left group cursor-pointer",
              isPolymarketConnected
                ? "border-[hsl(var(--polymarket-purple))]/30 bg-[hsl(var(--polymarket-purple))]/5 hover:border-red-500/50 hover:bg-red-500/5"
                : "border-[hsl(var(--polymarket-purple))]/40 hover:border-[hsl(var(--polymarket-purple))] hover:bg-[hsl(var(--polymarket-purple))]/10"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-bold text-lg text-[hsl(var(--polymarket-purple))]">Polymarket</span>
                  {isPolymarketConnected && (
                    <Badge className="bg-[hsl(var(--polymarket-purple))]/20 text-[hsl(var(--polymarket-purple))] border-[hsl(var(--polymarket-purple))]/30">
                      <Check className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {isPolymarketConnected 
                    ? "Wallet connected - Click to disconnect" 
                    : "Connect with your wallet"}
                </p>
              </div>
              {!isPolymarketConnected && (
                <ArrowRight className="h-5 w-5 text-[hsl(var(--polymarket-purple))] opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </button>
        </div>

        {!isKalshiConnected && !isPolymarketConnected && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground text-center">
              Connect one or both platforms to manage your portfolio and start trading
            </p>
          </div>
        )}

        {(isKalshiConnected || isPolymarketConnected) && (
          <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-xs text-center">
              {isKalshiConnected && isPolymarketConnected ? (
                <span className="text-foreground font-medium">✓ Both platforms connected</span>
              ) : (
                <span className="text-muted-foreground">
                  You can connect to both platforms simultaneously
                </span>
              )}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
