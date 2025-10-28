import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTrading } from "@/contexts/TradingContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Clock, RefreshCw, Heart, Repeat, Eye, Filter, TrendingUp, UserPlus, X } from "lucide-react";
import { MarketChart } from "@/components/MarketChart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTweets, useFollowedAccounts } from "@/hooks/useFeedData";

interface NewsItem {
  id: string;
  tweet_id: string;
  title: string;
  source: string;
  username: string;
  timestamp: string;
  category: string;
  profileImage?: string;
  likes?: number;
  retweets?: number;
  views?: number;
  relevant?: boolean;
}

interface RelatedMarket {
  id: string;
  title: string;
  description: string;
  yesPrice?: number;
  noPrice?: number;
  volume: string;
  liquidity: string;
  endDate: string;
  status: string;
  category: string;
  provider: 'kalshi' | 'polymarket';
  volumeRaw: number;
  liquidityRaw: number;
  clobTokenId?: string;
  image?: string;
  isMultiOutcome?: boolean;
  subMarkets?: RelatedMarket[];
}

const Feed = () => {
  const { user, activeProvider } = useTrading();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [selectedTweet, setSelectedTweet] = useState<NewsItem | null>(null);
  const [relatedMarkets, setRelatedMarkets] = useState<RelatedMarket[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);

  // Use React Query hooks for data fetching with caching
  const { data: tweetsData, isLoading, refetch: refetchTweets } = useTweets(filterCategory);
  const { data: followedAccounts = [], refetch: refetchAccounts } = useFollowedAccounts();
  
  const mainFeed = tweetsData?.tweets || [];
  const categories = tweetsData?.categories || [];
  const lastUpdate = tweetsData?.lastUpdate || null;

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const marketSearchCacheRef = useRef<Map<string, { markets: RelatedMarket[], timestamp: number }>>(new Map());
  const MARKET_CACHE_DURATION = 60000; // 1 minute

  const handleTweetClick = async (tweet: NewsItem) => {
    setSelectedTweet(tweet);
    
    // Check cache first
    const cacheKey = `${tweet.tweet_id}-both`;
    const cached = marketSearchCacheRef.current.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < MARKET_CACHE_DURATION) {
      setRelatedMarkets(cached.markets);
      return;
    }

    setIsLoadingMarkets(true);
    setRelatedMarkets([]);

    try {
      const { data, error } = await supabase.functions.invoke('search-related-markets', {
        body: { text: tweet.title, provider: 'both' }
      });

      if (error) throw error;

      if (data?.markets) {
        // Sort markets to show Kalshi first, then Polymarket
        const sortedMarkets = [...data.markets].sort((a, b) => {
          if (a.provider === 'kalshi' && b.provider === 'polymarket') return -1;
          if (a.provider === 'polymarket' && b.provider === 'kalshi') return 1;
          return 0;
        });
        
        // Cache the results
        marketSearchCacheRef.current.set(cacheKey, {
          markets: sortedMarkets,
          timestamp: Date.now()
        });
        setRelatedMarkets(sortedMarkets);
      }
    } catch (error: any) {
      console.error("Error fetching related markets:", error);
      toast({
        title: "Failed to load markets",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingMarkets(false);
    }
  };

  const handleMarketClick = (market: RelatedMarket) => {
    // Ensure all required fields are present to prevent refetch
    const completeMarket = {
      ...market,
      // Ensure we have a valid clobTokenId for pricing
      clobTokenId: market.clobTokenId || market.id,
      endDate: market.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: market.status || 'active',
      // Ensure pricing is available even if undefined
      yesPrice: market.yesPrice !== undefined ? market.yesPrice : 50,
      noPrice: market.noPrice !== undefined ? market.noPrice : 50,
    };
    
    navigate(`/market/${market.id}`, { 
      state: { 
        market: completeMarket
      } 
    });
  };

  const refreshTwitterFeed = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('twitter-fetch');
      
      if (error) throw error;
      
      if (!silent) {
        toast({
          title: "Feed refreshed",
          description: data?.message || "Successfully fetched latest tweets",
        });
      }
      
      await refetchTweets();
    } catch (error: any) {
      console.error("Twitter fetch error:", error);
      
      const isRateLimit = error.message?.includes('429') || error.message?.includes('rate limit');
      
      if (!silent) {
        toast({
          title: isRateLimit ? "Rate limit reached" : "Refresh failed",
          description: isRateLimit 
            ? "Twitter API rate limit reached. Try again in a few minutes."
            : error.message || "Failed to fetch tweets",
          variant: "destructive",
        });
      }
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  };

  const handleAddAccount = async () => {
    if (!newUsername.trim()) {
      toast({
        title: "Username required",
        description: "Please enter a Twitter username",
        variant: "destructive",
      });
      return;
    }

    setIsAddingAccount(true);
    try {
      const { error } = await supabase
        .from('followed_twitter_accounts')
        .insert([{
          twitter_username: newUsername.trim().replace('@', ''),
          display_name: newDisplayName.trim() || newUsername.trim(),
          account_category: 'General'
        }]);

      if (error) throw error;

      toast({
        title: "Account added",
        description: `@${newUsername.trim()} will be included in the next feed refresh`,
      });

      setNewUsername('');
      setNewDisplayName('');
      refetchAccounts();
    } catch (error: any) {
      console.error('Error adding account:', error);
      toast({
        title: "Failed to add account",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAddingAccount(false);
    }
  };

  const handleRemoveAccount = async (id: string, username: string) => {
    try {
      const { error } = await supabase
        .from('followed_twitter_accounts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Account removed",
        description: `@${username} will no longer be tracked`,
      });

      refetchAccounts();
    } catch (error: any) {
      console.error('Error removing account:', error);
      toast({
        title: "Failed to remove account",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    // Subscribe to realtime updates for auto-refresh
    const channel = supabase
      .channel('twitter_feed_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'twitter_feed'
        },
        () => {
          refetchTweets();
        }
      )
      .subscribe();

    // Update relative timestamps every minute
    const timestampInterval = setInterval(() => {
      refetchTweets();
    }, 60000); // 1 minute

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timestampInterval);
    };
  }, [refetchTweets]);

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      <main className="flex-1 pt-6 pb-24">
        <div className="container mx-auto">
          <div className="max-w-7xl mx-auto">
            {/* Header with Filters */}
            <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Live Status Indicator */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border">
                  <div className="relative">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-500 animate-ping opacity-75" />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1">
                    <span className="text-xs font-medium">Live</span>
                    {lastUpdate && (
                      <span className="text-xs text-muted-foreground sm:ml-1">
                        · Updated {formatTimestamp(lastUpdate.toISOString())}
                      </span>
                    )}
                  </div>
                </div>
                
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Manage Accounts
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Manage Twitter Accounts</DialogTitle>
                      <DialogDescription>
                        Add or remove Twitter accounts to track in your feed
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4">
                      {/* Add New Account Form */}
                      <Card className="p-4">
                        <h3 className="font-semibold mb-3">Add New Account</h3>
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="username">Twitter Username</Label>
                            <Input
                              id="username"
                              placeholder="e.g., elonmusk"
                              value={newUsername}
                              onChange={(e) => setNewUsername(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddAccount()}
                            />
                          </div>
                          <div>
                            <Label htmlFor="displayName">Display Name (optional)</Label>
                            <Input
                              id="displayName"
                              placeholder="e.g., Elon Musk"
                              value={newDisplayName}
                              onChange={(e) => setNewDisplayName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddAccount()}
                            />
                          </div>
                          <Button 
                            onClick={handleAddAccount} 
                            disabled={isAddingAccount || !newUsername.trim()}
                            className="w-full"
                          >
                            {isAddingAccount ? 'Adding...' : 'Add Account'}
                          </Button>
                        </div>
                      </Card>

                      {/* Current Accounts List */}
                      <div>
                        <h3 className="font-semibold mb-3">
                          Current Accounts ({followedAccounts.length})
                        </h3>
                        {followedAccounts.length === 0 ? (
                          <Card className="p-8 text-center">
                            <p className="text-muted-foreground">No accounts tracked yet</p>
                          </Card>
                        ) : (
                          <div className="space-y-2">
                            {followedAccounts.map((account) => (
                              <Card key={account.id} className="p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                      {account.profile_image_url && (
                                        <AvatarImage 
                                          src={account.profile_image_url} 
                                          alt={account.twitter_username}
                                        />
                                      )}
                                      <AvatarFallback>
                                        {account.twitter_username[0].toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="font-medium text-sm">
                                        {account.display_name || account.twitter_username}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        @{account.twitter_username}
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveAccount(account.id, account.twitter_username)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                
                <Button 
                  onClick={() => refreshTwitterFeed(false)} 
                  disabled={isRefreshing}
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh Now
                </Button>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Main Feed */}
              <div className="lg:col-span-2 space-y-3">
                {mainFeed.length === 0 ? (
                  <Card className="p-8 text-center">
                    <p className="text-muted-foreground mb-4">
                      No tweets available yet. New tweets are fetched automatically every minute.
                    </p>
                    <Button onClick={() => refreshTwitterFeed(false)} disabled={isRefreshing}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                      Fetch Now
                    </Button>
                  </Card>
                ) : (
                  mainFeed.map((item) => (
                    <Card 
                      key={item.id} 
                      className={`p-4 hover:border-primary/50 transition-colors cursor-pointer ${
                        selectedTweet?.id === item.id ? 'border-primary' : ''
                      }`}
                      onClick={() => handleTweetClick(item)}
                    >
                      <div className="flex gap-3">
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarImage src={item.profileImage} />
                          <AvatarFallback>{item.username[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{item.source}</span>
                            <span className="text-xs text-muted-foreground">@{item.username}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{item.timestamp}</span>
                            <Badge variant="outline" className="ml-auto text-xs">
                              {item.category}
                            </Badge>
                          </div>
                          
                          <p className="text-sm mb-2">{item.title}</p>
                          
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              <span>{item.likes || 0}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Repeat className="h-3 w-3" />
                              <span>{item.retweets || 0}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              <span>{item.views || 0}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>

              {/* Related Markets Sidebar */}
              <div className="lg:col-span-1">
                <div className="sticky top-20">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-semibold">
                      {selectedTweet ? 'Related Markets' : 'Select a Tweet'}
                    </h2>
                  </div>
                  {!selectedTweet && (
                    <p className="text-sm text-muted-foreground mb-4">
                      Click on any tweet to see related markets
                    </p>
                  )}
                  
                  <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
                    {isLoadingMarkets ? (
                      <div className="flex items-center justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    ) : relatedMarkets.length > 0 ? (
                      <div className="space-y-3">
                        {relatedMarkets.map((market) => (
                          <Card 
                            key={market.id} 
                            className="p-4 hover:border-primary/50 transition-colors cursor-pointer"
                            onClick={() => handleMarketClick(market)}
                          >
                            <Badge 
                              variant="outline" 
                              className={`mb-2 text-xs ${
                                market.provider === 'polymarket' 
                                  ? 'text-polymarket-purple border-polymarket-purple' 
                                  : 'text-kalshi-teal border-kalshi-teal'
                              }`}
                            >
                              {market.provider === 'polymarket' ? 'Polymarket' : 'Kalshi'}
                            </Badge>
                            <h4 className="text-sm font-semibold mb-2 line-clamp-2">
                              {market.title}
                            </h4>
                            
                            {/* Mini Chart */}
                            <div className="h-24 mb-3 rounded overflow-hidden">
                              <MarketChart
                                marketId={market.provider === 'polymarket' ? (market.clobTokenId || market.id) : market.id}
                                timeRange="1D"
                                provider={market.provider}
                                minimal={true}
                              />
                            </div>
                            
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex gap-2">
                                <span className="text-green-600 font-medium">
                                  YES {market.yesPrice}¢
                                </span>
                                <span className="text-red-600 font-medium">
                                  NO {market.noPrice}¢
                                </span>
                              </div>
                              <span className="text-muted-foreground">{market.volume}</span>
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : selectedTweet ? (
                      <Card className="p-6 text-center">
                        <p className="text-sm text-muted-foreground">
                          No related markets found
                        </p>
                      </Card>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Feed;
