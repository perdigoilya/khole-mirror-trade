import { TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Position {
  title: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  curPrice: number;
  slug: string;
  icon?: string;
  pendingCount?: number;
  pendingPrice?: number;
  pendingSide?: string;
}

interface PositionCardProps {
  position: Position;
  onClick: () => void;
  onSellClick?: () => void;
  platformTab: 'kalshi' | 'polymarket';
}

export function PositionCard({ position, onClick, onSellClick, platformTab }: PositionCardProps) {
  return (
    <Card
      className="p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm line-clamp-2 mb-1">
            {position.title}
          </h3>
          <Badge variant="outline" className="text-xs">
            {position.outcome}
          </Badge>
        </div>
        {position.icon && (
          <img
            src={position.icon}
            alt=""
            className="h-10 w-10 rounded object-cover ml-2"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
        <div>
          <span className="text-muted-foreground">Size</span>
          <p className="font-medium">{position.size} shares</p>
        </div>
        <div>
          <span className="text-muted-foreground">Avg Price</span>
          <p className="font-medium">{position.avgPrice}¢</p>
        </div>
        <div>
          <span className="text-muted-foreground">Current</span>
          <p className="font-medium">{position.curPrice}¢</p>
        </div>
        <div>
          <span className="text-muted-foreground">Value</span>
          <p className="font-medium">${position.currentValue.toFixed(2)}</p>
        </div>
      </div>

      {position.pendingCount && position.pendingCount > 0 && (
        <div className="bg-muted p-2 rounded mb-3 text-xs">
          <p className="text-muted-foreground">
            Pending: {position.pendingCount} orders @ {position.pendingPrice}¢ ({position.pendingSide})
          </p>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t">
        <div className="flex items-center gap-1">
          {position.cashPnl >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          <span className={`font-semibold ${position.cashPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {position.cashPnl >= 0 ? '+' : ''}${Math.abs(position.cashPnl).toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">
            ({position.percentPnl >= 0 ? '+' : ''}{position.percentPnl.toFixed(1)}%)
          </span>
        </div>
        {platformTab === 'kalshi' && position.size > 0 && onSellClick && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onSellClick();
            }}
          >
            Sell
          </Button>
        )}
      </div>
    </Card>
  );
}
