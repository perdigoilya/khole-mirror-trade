import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useKalshi } from "@/contexts/KalshiContext";
import { ConnectionRequired } from "@/components/ConnectionRequired";
import { Clock, TrendingUp } from "lucide-react";

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
  const [mainFeed, setMainFeed] = useState<NewsItem[]>([]);
  const [relevantFeed, setRelevantFeed] = useState<NewsItem[]>([]);

  useEffect(() => {
    // Main feed is always available - mock data for now
    setMainFeed([
      {
        id: "1",
        title: "Fed announces interest rate decision",
        source: "Bloomberg",
        timestamp: "2 min ago",
        category: "Economics",
      },
      {
        id: "2",
        title: "Tech stocks rally on AI developments",
        source: "Reuters",
        timestamp: "15 min ago",
        category: "Technology",
      },
      {
        id: "3",
        title: "Election polls show tight race in key states",
        source: "CNN",
        timestamp: "32 min ago",
        category: "Politics",
      },
    ]);

    // Relevant feed only loads if user is connected
    if (isConnected && user) {
      setRelevantFeed([
        {
          id: "r1",
          title: "Bitcoin reaches new monthly high",
          source: "CoinDesk",
          timestamp: "5 min ago",
          category: "Crypto",
          relevant: true,
        },
        {
          id: "r2",
          title: "S&P 500 volatility increases ahead of earnings",
          source: "MarketWatch",
          timestamp: "20 min ago",
          category: "Markets",
          relevant: true,
        },
      ]);
    }
  }, [isConnected, user]);

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      
      <main className="flex-1 pt-10 pb-20">
        <div className="container mx-auto px-4">
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h1 className="text-4xl font-bold mb-2">News Feed</h1>
                <p className="text-muted-foreground">
                  Live updates on market-moving news and events
                </p>
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                {/* Main Feed */}
                <div className="lg:col-span-2 space-y-4">
                  <h2 className="text-xl font-semibold mb-4">All News</h2>
                  {mainFeed.map((item) => (
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
                  ))}
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
