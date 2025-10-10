import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useKalshi } from "@/contexts/KalshiContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Clock, TrendingUp, RefreshCw } from "lucide-react";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  timestamp: string;
  category: string;
  relevant?: boolean;
}

const Feed = () => {
  const { isConnected, user } = useKalshi();
  const { toast } = useToast();
  const [mainFeed, setMainFeed] = useState<NewsItem[]>([]);
  const [relevantFeed, setRelevantFeed] = useState<NewsItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      const { data, error } = await supabase
        .from('twitter_feed')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      if (data) {
        const formattedTweets = data.map(tweet => ({
          id: tweet.id,
          title: tweet.text,
          source: tweet.author_name || `@${tweet.author_username}`,
          timestamp: formatTimestamp(tweet.created_at),
          category: tweet.category || 'Market News',
          relevant: tweet.relevant || false,
        }));

        setMainFeed(formattedTweets.filter(t => !t.relevant));
        
        if (isConnected && user) {
          setRelevantFeed(formattedTweets.filter(t => t.relevant));
        }
      }
    } catch (error) {
      console.error('Error fetching tweets:', error);
    }
  };

  const refreshTwitterFeed = async () => {
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('twitter-fetch');
      
      if (error) throw error;
      
      toast({
        title: "Feed refreshed",
        description: data?.message || "Successfully fetched latest tweets",
      });
      
      await fetchTweets();
    } catch (error: any) {
      toast({
        title: "Refresh failed",
        description: error.message || "Failed to fetch tweets",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isConnected, user]);

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      
      <main className="flex-1 pt-10 pb-20">
        <div className="container mx-auto px-4">
            <div className="max-w-7xl mx-auto">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <h1 className="text-4xl font-bold mb-2">News Feed</h1>
                  <p className="text-muted-foreground">
                    Live updates from Twitter accounts you follow
                  </p>
                </div>
                <Button 
                  onClick={refreshTwitterFeed} 
                  disabled={isRefreshing}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                {/* Main Feed */}
                <div className="lg:col-span-2 space-y-4">
                  <h2 className="text-xl font-semibold mb-4">All News</h2>
                  {mainFeed.length === 0 ? (
                    <Card className="p-8 text-center">
                      <p className="text-muted-foreground mb-4">
                        No tweets yet. Add Twitter accounts to follow and refresh to see their latest tweets.
                      </p>
                      <Button onClick={refreshTwitterFeed} disabled={isRefreshing}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Fetch Tweets
                      </Button>
                    </Card>
                  ) : (
                    mainFeed.map((item) => (
                    <Card key={item.id} className="p-6 hover:border-primary/50 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between mb-3">
                        <Badge variant="outline">{item.category}</Badge>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 mr-1" />
                          {item.timestamp}
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">{item.source}</p>
                    </Card>
                  ))
                  )}
                </div>

                {/* Relevant Feed Sidebar */}
                <div className="lg:col-span-1">
                  <div className="sticky top-24">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-semibold">Your Markets</h2>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      News filtered for your watchlist and positions
                    </p>
                    <Separator className="mb-4" />
                    
                    {!user || !isConnected ? (
                      <div className="p-6 rounded-lg border border-border bg-card text-center">
                        <p className="text-sm text-muted-foreground mb-4">
                          {!user 
                            ? "Log in to see personalized news for your watchlist and positions"
                            : "Connect your Kalshi account to see personalized news"}
                        </p>
                        <a 
                          href={!user ? "/auth" : "#"}
                          onClick={!user ? undefined : (e) => { e.preventDefault(); /* Open connect dialog */ }}
                          className="text-primary font-semibold hover:underline"
                        >
                          {!user ? "Log in" : "Connect Kalshi"}
                        </a>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {relevantFeed.map((item) => (
                          <Card key={item.id} className="p-4 border-primary/30 hover:border-primary/50 transition-colors cursor-pointer">
                            <Badge variant="default" className="mb-2 text-xs">
                              {item.category}
                            </Badge>
                            <h4 className="text-sm font-semibold mb-2">{item.title}</h4>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{item.source}</span>
                              <span>{item.timestamp}</span>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
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
