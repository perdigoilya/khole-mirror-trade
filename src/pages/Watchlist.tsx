import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import { Star, TrendingUp, TrendingDown, ShoppingCart, DollarSign, LineChart, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTrading } from "@/contexts/TradingContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Watchlist = () => {
  const { user } = useTrading();
  const { toast } = useToast();
  const [sortBy, setSortBy] = useState("recent");
  const [filterCategory, setFilterCategory] = useState("all");
  const [watchedMarkets, setWatchedMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Fetch watchlist from database
  useEffect(() => {
    if (user) {
      fetchWatchlist();
      
      // Set up realtime subscription
      const channel = supabase
        .channel('watchlist_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'watchlist',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchWatchlist();
          }
        )
        .subscribe();
      
      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setWatchedMarkets([]);
      setLoading(false);
    }
  }, [user]);

  const fetchWatchlist = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setWatchedMarkets(data.map(item => {
          const marketData = item.market_data as any || {};
          return {
            id: item.market_id || item.market_ticker,
            dbId: item.id,
            title: marketData.title || item.market_title,
            yesPrice: marketData.yesPrice || 50,
            noPrice: marketData.noPrice || 50,
            volume: marketData.volume || '$0',
            liquidity: marketData.liquidity || '$0',
            endDate: marketData.endDate || 'TBD',
            category: marketData.category || 'Other',
            provider: marketData.provider || 'polymarket',
            trend: marketData.trend || 'up',
            change: marketData.change || 0,
            image: marketData.image,
            description: marketData.description,
            volumeRaw: marketData.volumeRaw || 0,
            liquidityRaw: marketData.liquidityRaw || 0
          };
        }));
      }
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      toast({
        title: "Error",
        description: "Failed to load watchlist",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = (market: any, side: 'yes' | 'no') => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to trade",
        action: <a href="/auth" className="text-primary hover:underline">Sign in</a>,
      });
      return;
    }
    toast({
      title: "Trade Executed",
      description: `Bought ${side.toUpperCase()} on "${market.title}"`,
    });
  };

  const removeFromWatchlist = async (marketId: string, dbId: string) => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('id', dbId);

      if (error) throw error;

      toast({
        title: "Removed from Watchlist",
        description: "Market removed from your watchlist",
      });
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      toast({
        title: "Error",
        description: "Failed to remove from watchlist",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      
      <main className="flex-1 pt-6 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            {/* Header with Filters */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <Badge variant="outline" className="text-sm px-3 py-1">
                  {watchedMarkets.length} Markets
                </Badge>
              </div>
              
              <div className="flex items-center gap-3">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[160px] bg-card/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Recently Added</SelectItem>
                    <SelectItem value="trending">Trending</SelectItem>
                    <SelectItem value="volume">Volume</SelectItem>
                    <SelectItem value="ending">Ending Soon</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[160px] bg-card/50 border-border">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="economics">Economics</SelectItem>
                    <SelectItem value="stocks">Stocks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loading ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">Loading watchlist...</p>
              </Card>
            ) : watchedMarkets.length > 0 ? (
              <div className="space-y-4">
                {watchedMarkets.map((market) => (
                  <Card
                    key={market.id}
                    className="p-6 hover:border-primary/50 transition-all duration-300"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Market Info */}
                      <div className="lg:col-span-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">
                                {market.provider}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {market.category}
                              </Badge>
                            </div>
                            <h3 className="text-lg font-semibold mb-2 line-clamp-2">
                              {market.title}
                            </h3>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => removeFromWatchlist(market.id, market.dbId)}
                          >
                            <Star className="h-5 w-5 text-primary fill-primary" />
                          </Button>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <TrendingUp className="h-4 w-4" />
                            <span>{market.volume}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4" />
                            <span>{market.liquidity}</span>
                          </div>
                          <span>Ends: {market.endDate}</span>
                        </div>
                      </div>

                      {/* Chart Placeholder */}
                      <div className="lg:col-span-3">
                        <div className="h-24 rounded-lg bg-gradient-to-r from-card to-muted/30 flex items-center justify-center border border-border/50">
                          <div className="text-center">
                            <LineChart className="h-8 w-8 text-muted-foreground mx-auto mb-1" />
                            <span className="text-xs text-muted-foreground">Chart Preview</span>
                          </div>
                        </div>
                      </div>

                      {/* Trading Section */}
                      <div className="lg:col-span-4">
                        <div className="grid grid-cols-2 gap-3">
                          {/* Yes Side */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">YES</span>
                              <div className="flex items-center gap-1">
                                {market.trend === 'up' ? (
                                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <TrendingDown className="h-3 w-3 text-red-400" />
                                )}
                                <span className={`text-xs font-medium ${
                                  market.change >= 0 ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                                  {market.change > 0 ? '+' : ''}{market.change}%
                                </span>
                              </div>
                            </div>
                            <div className="text-2xl font-bold text-emerald-400">
                              {market.yesPrice}¢
                            </div>
                            <Button
                              className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              size="sm"
                              onClick={() => handleBuy(market, 'yes')}
                            >
                              <ShoppingCart className="h-3 w-3 mr-1" />
                              Buy Yes
                            </Button>
                          </div>

                          {/* No Side */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">NO</span>
                              <div className="flex items-center gap-1">
                                {market.trend === 'down' ? (
                                  <TrendingDown className="h-3 w-3 text-red-400" />
                                ) : (
                                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                                )}
                                <span className={`text-xs font-medium ${
                                  market.change < 0 ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                                  {market.change < 0 ? '+' : ''}{Math.abs(market.change)}%
                                </span>
                              </div>
                            </div>
                            <div className="text-2xl font-bold text-red-400">
                              {market.noPrice}¢
                            </div>
                            <Button
                              className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30"
                              size="sm"
                              onClick={() => handleBuy(market, 'no')}
                            >
                              <ShoppingCart className="h-3 w-3 mr-1" />
                              Buy No
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Star className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-2xl font-semibold mb-2">
                  No markets in watchlist
                </h2>
                <p className="text-muted-foreground mb-4">
                  Add markets to your watchlist to track them here
                </p>
                <Button onClick={() => window.location.href = '/markets'}>
                  Browse Markets
                </Button>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Watchlist;
