import { Filter, ChevronDown, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { MarketFilters } from "@/types/market";

interface MarketFiltersProps {
  filters: MarketFilters;
  onFiltersChange: (filters: Partial<MarketFilters>) => void;
  showFilters: boolean;
  onShowFiltersChange: (show: boolean) => void;
  platform: 'kalshi' | 'polymarket';
  groupByEvent: boolean;
  onGroupByEventChange: (group: boolean) => void;
  categories: string[];
}

export function MarketFilters({
  filters,
  onFiltersChange,
  showFilters,
  onShowFiltersChange,
  platform,
  groupByEvent,
  onGroupByEventChange,
  categories,
}: MarketFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filters.sortBy} onValueChange={(v) => onFiltersChange({ sortBy: v })}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trending">Trending</SelectItem>
            <SelectItem value="top">Top</SelectItem>
            <SelectItem value="new">New</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.timeFilter} onValueChange={(v) => onFiltersChange({ timeFilter: v })}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-time">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this-week">This Week</SelectItem>
            <SelectItem value="this-month">This Month</SelectItem>
          </SelectContent>
        </Select>

        {platform === 'kalshi' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background">
            <ListTree className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="group-events" className="text-sm cursor-pointer">
              Group by Event
            </Label>
            <Switch
              id="group-events"
              checked={groupByEvent}
              onCheckedChange={onGroupByEventChange}
            />
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onShowFiltersChange(!showFilters)}
          className="ml-auto"
        >
          <Filter className="h-4 w-4 mr-2" />
          Advanced
          <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </Button>
      </div>

      <Collapsible open={showFilters} onOpenChange={onShowFiltersChange}>
        <CollapsibleContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/50">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={filters.category} onValueChange={(v) => onFiltersChange({ category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat.toLowerCase()}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={(v) => onFiltersChange({ status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="settled">Settled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Volume Range: ${filters.minVolume.toLocaleString()} - ${filters.maxVolume.toLocaleString()}</Label>
              <Slider
                min={0}
                max={10000000}
                step={100000}
                value={[filters.minVolume, filters.maxVolume]}
                onValueChange={([min, max]) => onFiltersChange({ minVolume: min, maxVolume: max })}
              />
            </div>

            <div className="space-y-3">
              <Label>Liquidity Range: ${filters.minLiquidity.toLocaleString()} - ${filters.maxLiquidity.toLocaleString()}</Label>
              <Slider
                min={0}
                max={1000000}
                step={10000}
                value={[filters.minLiquidity, filters.maxLiquidity]}
                onValueChange={([min, max]) => onFiltersChange({ minLiquidity: min, maxLiquidity: max })}
              />
            </div>

            <div className="space-y-3">
              <Label>Price Range: {filters.minPrice}¢ - {filters.maxPrice}¢</Label>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[filters.minPrice, filters.maxPrice]}
                onValueChange={([min, max]) => onFiltersChange({ minPrice: min, maxPrice: max })}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
