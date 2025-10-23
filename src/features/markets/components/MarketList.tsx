import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MarketCard } from "./MarketCard";
import type { GroupedMarket } from "@/types/market";

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
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [starredMarkets, setStarredMarkets] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleStarred = (id: string) => {
    setStarredMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-48 rounded-lg bg-muted animate-pulse"
          />
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {markets.map((market) => (
          <MarketCard
            key={market.id}
            market={market}
            isExpanded={expandedMarkets.has(market.id)}
            onExpandToggle={() => toggleExpanded(market.id)}
            isStarred={starredMarkets.has(market.id)}
            onStarToggle={() => toggleStarred(market.id)}
          />
        ))}
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
