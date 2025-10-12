import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTrading } from "@/contexts/TradingContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Clock, RefreshCw, Heart, Repeat, Eye, Filter, TrendingUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  yesPrice: number;
  noPrice: number;
  volume: string;
  provider: string;
}

const Feed = () => {
  const { user, activeProvider } = useTrading();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mainFeed, setMainFeed] = useState<NewsItem[]>([]);
  const [selectedTweet, setSelectedTweet] = useState<NewsItem | null>(null);
  const [relatedMarkets, setRelatedMarkets] = useState<RelatedMarket[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [feedStatus, setFeedStatus] = useState<'live' | 'idle' | 'error'>('idle');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const fetchTweets = async () => {
    try {
      let query = supabase
        .from('twitter_feed')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filterCategory !== "all") {
        query = query.eq('category', filterCategory);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        const formattedTweets = data.map(tweet => ({
          id: tweet.id,
          tweet_id: tweet.tweet_id,
          title: tweet.text,
          source: tweet.author_name || `@${tweet.author_username}`,
          username: tweet.author_username,
          timestamp: formatTimestamp(tweet.created_at),
          category: tweet.category || 'Market News',
          profileImage: tweet.profile_image_url,
          likes: tweet.likes_count || 0,
          retweets: tweet.retweets_count || 0,
          views: tweet.views_count || 0,
          relevant: tweet.relevant || false,
        }));

        setMainFeed(formattedTweets);
        
        // Extract unique categories
        const uniqueCategories = [...new Set(data.map(t => t.category).filter(Boolean))];
        setCategories(uniqueCategories as string[]);
      }
    } catch (error) {
      console.error('Error fetching tweets:', error);
    }
  };

  const handleTweetClick = async (tweet: NewsItem) => {
    setSelectedTweet(tweet);
    setIsLoadingMarkets(true);
    setRelatedMarkets([]);

    try {
      const { data, error } = await supabase.functions.invoke('search-related-markets', {
        body: { text: tweet.title, provider: activeProvider }
      });

      if (error) throw error;

      if (data?.markets) {
        setRelatedMarkets(data.markets);
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
    navigate(`/market/${market.id}`, { 
      state: { 
        market: {
          ...market,
          endDate: "TBD",
          status: "Active",
          category: "Market News",
          volumeRaw: 0,
          liquidityRaw: 0,
        } 
      } 
    });
  };

  const refreshTwitterFeed = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    
    try {
      setFeedStatus('live');
      const { data, error } = await supabase.functions.invoke('twitter-fetch');
      
      if (error) throw error;
      
      if (!silent) {
        toast({
          title: "Feed refreshed",
          description: data?.message || "Successfully fetched latest tweets",
        });
      }
      
      await fetchTweets();
      setLastUpdate(new Date());
      setFeedStatus('idle');
    } catch (error: any) {
      setFeedStatus('error');
      console.error("Twitter fetch error:", error);
      
      // Check if it's a rate limit error
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

  useEffect(() => {
    fetchTweets();

    // Subscribe to realtime updates
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
          fetchTweets();
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    // Auto-refresh every 3 minutes - processes 5 accounts per run with 3s delays = ~15s
    // This allows cycling through all accounts every ~15 minutes while respecting rate limits
    const autoRefreshInterval = setInterval(() => {
      refreshTwitterFeed(true);
    }, 180000); // 3 minutes

    return () => {
      supabase.removeChannel(channel);
      clearInterval(autoRefreshInterval);
    };
  }, [filterCategory]);

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      <main className="flex-1 pt-6 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            {/* Header with Filters */}
            <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* Live Status Indicator */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border">
                  <div className="relative">
                    <div 
                      className={`w-2 h-2 rounded-full ${
                        feedStatus === 'live' 
                          ? 'bg-green-500 animate-pulse' 
                          : feedStatus === 'error' 
                          ? 'bg-red-500' 
                          : 'bg-yellow-500'
                      }`}
                    />
                    {feedStatus === 'live' && (
                      <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-500 animate-ping opacity-75" />
                    )}
                  </div>
                  <span className="text-xs font-medium">
                    {feedStatus === 'live' ? 'Live' : feedStatus === 'error' ? 'Down' : 'Idle'}
                  </span>
                  {lastUpdate && (
                    <span className="hidden sm:inline text-xs text-muted-foreground">
                      · {formatTimestamp(lastUpdate.toISOString())}
                    </span>
                  )}
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
              <Button 
                onClick={() => refreshTwitterFeed(false)} 
                disabled={isRefreshing}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Main Feed */}
              <div className="lg:col-span-2 space-y-3">
                {mainFeed.length === 0 ? (
                  <Card className="p-8 text-center">
                    <p className="text-muted-foreground mb-4">
                      No tweets yet. Refresh to fetch latest tweets.
                    </p>
                    <Button onClick={() => refreshTwitterFeed(false)} disabled={isRefreshing}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                      Fetch Tweets
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
                  <p className="text-sm text-muted-foreground mb-4">
                    {selectedTweet 
                      ? `Markets related to this news (${activeProvider})` 
                      : 'Click on any tweet to see related markets'}
                  </p>
                  
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
                          <Badge variant="outline" className="mb-2 text-xs">
                            {market.provider}
                          </Badge>
                          <h4 className="text-sm font-semibold mb-2 line-clamp-2">
                            {market.title}
                          </h4>
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
      </main>

      <Footer />
    </div>
  );
};

export default Feed;
