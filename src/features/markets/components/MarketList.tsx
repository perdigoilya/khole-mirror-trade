import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GroupedMarket } from "@/types/market";
import { formatEndDate, getTrend } from "../utils/marketFormatters";

interface MarketListProps {
  markets: GroupedMarket[];
  loading: boolean;
  error: string | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export function MarketList({
  markets,
  loading,
  error,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
}: MarketListProps) {
  const navigate = useNavigate();

  const handleMarketClick = (market: GroupedMarket) => {
    if (market.provider === 'kalshi') {
      navigate(`/market/${market.id}`, {
        state: {
          market: {
            ...market,
            ticker: market.id,
            eventTicker: (market as any).eventTicker,
            provider: 'kalshi',
          }
        }
      });
    } else {
      navigate(`/market/${market.id}`, { state: { market } });
    }
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (loading && markets.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-12 rounded bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <Alert>
        <AlertDescription>No markets found. Try adjusting your filters.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="pb-3 font-medium">Market</th>
              <th className="pb-3 font-medium">Category</th>
              <th className="pb-3 font-medium">Ends</th>
              <th className="pb-3 font-medium text-right">Volume</th>
              <th className="pb-3 font-medium text-right">Liquidity</th>
              <th className="pb-3 font-medium text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((market) => {
              const trend = getTrend(market.yesPrice);
              return (
                <tr
                  key={market.id}
                  onClick={() => !market.isMultiOutcome && handleMarketClick(market)}
                  className="border-b hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm line-clamp-2 max-w-md">
                        {market.title}
                      </span>
                      {market.isMultiOutcome && market.subMarkets && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          +{market.subMarkets.length}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    {market.category && (
                      <Badge variant="outline" className="text-xs">
                        {market.category}
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 text-sm text-muted-foreground">
                    {formatEndDate(market.endDate)}
                  </td>
                  <td className="py-3 text-sm text-right">
                    {market.volume}
                  </td>
                  <td className="py-3 text-sm text-right">
                    {market.liquidity}
                  </td>
                  <td className="py-3 text-right">
                    {market.yesPrice !== undefined && (
                      <div className="flex items-center justify-end gap-2">
                        {trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                        {trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
                        <span className={`font-medium text-sm ${
                          trend === 'up' ? 'text-green-500' : 
                          trend === 'down' ? 'text-red-500' : 
                          'text-foreground'
                        }`}>
                          {market.yesPrice}¢
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={onLoadMore}
            disabled={loadingMore}
            variant="outline"
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}
