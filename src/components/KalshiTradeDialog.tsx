import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTrading } from "@/contexts/TradingContext";
import { Loader2 } from "lucide-react";
import { ToastAction } from "@/components/ui/toast";

interface KalshiTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketTicker: string;
  marketTitle: string;
  currentPrice: number;
}

export function KalshiTradeDialog({
  open,
  onOpenChange,
  marketTicker,
  marketTitle,
  currentPrice,
}: KalshiTradeDialogProps) {
  const navigate = useNavigate();
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState<string>("1");
  const [limitPrice, setLimitPrice] = useState<string>(currentPrice.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { kalshiCredentials } = useTrading();

  const calculateTotal = () => {
    const qty = parseInt(quantity) || 0;
    const price = orderType === "limit" ? parseFloat(limitPrice) : currentPrice;
    return (qty * price).toFixed(2);
  };

  const handleTrade = async () => {
    try {
      setIsSubmitting(true);

      // Check if credentials are available
      if (!kalshiCredentials) {
        toast({
          title: "Not Connected",
          description: "Please connect your Kalshi account first",
          variant: "destructive",
        });
        return;
      }

      const count = parseInt(quantity);
      if (isNaN(count) || count <= 0) {
        toast({
          title: "Invalid Quantity",
          description: "Please enter a valid quantity greater than 0",
          variant: "destructive",
        });
        return;
      }

      if (orderType === "limit") {
        const price = parseFloat(limitPrice);
        if (isNaN(price) || price <= 0 || price >= 100) {
          toast({
            title: "Invalid Price",
            description: "Please enter a valid price between 0 and 100",
            variant: "destructive",
          });
          return;
        }
      }

      // Map side to action and kalshi side
      // side 'buy' -> action: 'buy', side: 'yes'
      // side 'sell' -> action: 'sell', side: 'no'
      const kalshiAction = side;
      const kalshiSide = side === 'buy' ? 'yes' : 'no';

      const payload: any = {
        apiKeyId: kalshiCredentials.apiKeyId,
        privateKey: kalshiCredentials.privateKey,
        ticker: marketTicker,
        action: kalshiAction,
        side: kalshiSide,
        count,
        type: orderType,
        environment: kalshiCredentials.environment,
      };

      if (orderType === "limit") {
        // For limit orders, set the price based on which side we're buying
        if (kalshiSide === 'yes') {
          payload.yesPrice = Math.round(parseFloat(limitPrice));
        } else {
          payload.noPrice = Math.round(parseFloat(limitPrice));
        }
      } else {
        // Market orders on Kalshi still require a price field; use current price as a cap
        const marketPx = Math.max(1, Math.min(99, Math.round(currentPrice)));
        if (kalshiSide === 'yes') payload.yesPrice = marketPx;
        else payload.noPrice = marketPx;
      }

      console.log("Submitting Kalshi trade:", payload);

      const { data, error } = await supabase.functions.invoke("kalshi-trade", {
        body: payload,
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || "Trade failed");
      }

      toast({
        title: "Trade Successful",
        description: `${side.toUpperCase()} order placed for ${count} contracts`,
        action: (
          <ToastAction altText="View Portfolio" onClick={() => navigate('/portfolio')}>
            View Portfolio
          </ToastAction>
        ),
      });

      onOpenChange(false);
      
      // Reset form
      setQuantity("1");
      setLimitPrice(currentPrice.toString());
      setOrderType("market");
      setSide("buy");
    } catch (error: any) {
      console.error("Kalshi trade error:", error);
      
      // Check for insufficient liquidity errors (common for sell orders)
      const errorMsg = error.message || "";
      const isLiquidityError = 
        errorMsg.toLowerCase().includes("no matching") ||
        errorMsg.toLowerCase().includes("insufficient liquidity") ||
        errorMsg.toLowerCase().includes("not enough") ||
        errorMsg.toLowerCase().includes("no orders");
      
      if (side === "sell" && isLiquidityError) {
        toast({
          title: "Insufficient Market Liquidity",
          description: "There aren't enough buy orders to match your sell order size. Try reducing the quantity or using a limit order with a lower price.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Trade Failed",
          description: errorMsg || "An error occurred while placing the trade",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-kalshi-primary">Trade on Kalshi</DialogTitle>
          <DialogDescription className="text-sm">
            {marketTitle}
            <br />
            <span>Environment: {(kalshiCredentials?.environment ?? 'auto').toUpperCase()}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Order Type */}
          <div className="space-y-2">
            <Label>Order Type</Label>
            <RadioGroup value={orderType} onValueChange={(v) => setOrderType(v as "market" | "limit")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="market" id="market" />
                <Label htmlFor="market" className="font-normal cursor-pointer">
                  Market Order (Execute at current price)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="limit" id="limit" />
                <Label htmlFor="limit" className="font-normal cursor-pointer">
                  Limit Order (Set your price)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Side */}
          <div className="space-y-2">
            <Label>Side</Label>
            <RadioGroup value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="buy" id="buy" />
                <Label htmlFor="buy" className="font-normal cursor-pointer">
                  Buy (YES)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sell" id="sell" />
                <Label htmlFor="sell" className="font-normal cursor-pointer">
                  Sell (NO)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity (Contracts)</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
            />
          </div>

          {/* Limit Price (only for limit orders) */}
          {orderType === "limit" && (
            <div className="space-y-2">
              <Label htmlFor="limitPrice">Limit Price (cents)</Label>
              <Input
                id="limitPrice"
                type="number"
                min="1"
                max="99"
                step="1"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder="Enter price"
              />
              <p className="text-xs text-muted-foreground">
                Price must be between 1-99 cents
              </p>
            </div>
          )}

          {/* Order Summary */}
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Order Type:</span>
              <span className="font-medium capitalize">{orderType}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Side:</span>
              <span className="font-medium capitalize">{side}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Quantity:</span>
              <span className="font-medium">{quantity} contracts</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Price:</span>
              <span className="font-medium">
                {orderType === "market" ? `${currentPrice}¢ (current)` : `${limitPrice}¢`}
              </span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t">
              <span className="font-medium">Estimated Total:</span>
              <span className="font-bold text-kalshi-primary">${calculateTotal()}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleTrade}
            disabled={isSubmitting}
            className="flex-1 bg-kalshi-primary hover:bg-kalshi-secondary text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Placing Order...
              </>
            ) : (
              `Place ${side.toUpperCase()} Order`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
