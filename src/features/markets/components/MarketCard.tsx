import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, TrendingUp, TrendingDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { GroupedMarket } from "@/types/market";
import { formatEndDate, getTrend } from "../utils/marketFormatters";

interface MarketCardProps {
  market: GroupedMarket;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
  onStarToggle?: () => void;
  isStarred?: boolean;
}

export function MarketCard({
  market,
  isExpanded = false,
  onExpandToggle,
  onStarToggle,
  isStarred = false,
}: MarketCardProps) {
  const navigate = useNavigate();
  const trend = getTrend(market.yesPrice);

  const handleMarketClick = (mkt: GroupedMarket) => {
    if (market.provider === 'kalshi') {
      navigate(`/market/${mkt.id}`, {
        state: {
          market: {
            ...mkt,
            ticker: mkt.id,
            eventTicker: (mkt as any).eventTicker,
            provider: 'kalshi',
          }
        }
      });
    } else {
      navigate(`/market/${mkt.id}`, { state: { market: mkt } });
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onExpandToggle}>
      <Card
        className="hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
        onClick={() => !market.isMultiOutcome && handleMarketClick(market)}
      >
        {market.image && (
          <div className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity">
            <img
              src={market.image}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}
        
        <div className="relative p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                  {market.title}
                </h3>
                {market.isMultiOutcome && market.subMarkets && (
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    +{market.subMarkets.length}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {market.category && (
                  <Badge variant="outline" className="text-xs">
                    {market.category}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatEndDate(market.endDate)}
                </span>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onStarToggle?.();
              }}
            >
              <Star
                className={`h-4 w-4 ${isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`}
              />
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Vol:</span>
                <span className="ml-1 font-medium">{market.volume}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Liq:</span>
                <span className="ml-1 font-medium">{market.liquidity}</span>
              </div>
            </div>

            {market.yesPrice !== undefined && (
              <div className="flex items-center gap-2">
                {trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                {trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
                <span className={`font-semibold ${
                  trend === 'up' ? 'text-green-500' : 
                  trend === 'down' ? 'text-red-500' : 
                  'text-muted-foreground'
                }`}>
                  {market.yesPrice}¢
                </span>
              </div>
            )}
          </div>

          {market.isMultiOutcome && market.subMarkets && market.subMarkets.length > 0 && (
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-3 justify-between"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-xs">
                  View {market.subMarkets.length} related markets
                </span>
                <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          )}
        </div>
      </Card>

      {market.isMultiOutcome && market.subMarkets && (
        <CollapsibleContent>
          <div className="ml-4 mt-2 space-y-2 border-l-2 border-border pl-4">
            {market.subMarkets.map((subMarket) => (
              <MarketCard
                key={subMarket.id}
                market={subMarket}
                onStarToggle={() => {}}
              />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
