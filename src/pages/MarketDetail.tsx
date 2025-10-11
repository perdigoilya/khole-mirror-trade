import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Footer from "@/components/Footer";

interface Market {
  id: string;
  title: string;
  description: string;
  yesPrice: number;
  noPrice: number;
  volume: string;
  endDate: string;
  status: string;
  provider: 'kalshi' | 'polymarket';
}

const MarketDetail = () => {
  const { marketId } = useParams();
  const navigate = useNavigate();
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch market details from API
    // For now, using placeholder data
    setMarket({
      id: marketId || "",
      title: "Sample Market Title",
      description: "This is a detailed description of the market. It provides context and information about what is being predicted.",
      yesPrice: 67,
      noPrice: 33,
      volume: "$1.2M",
      endDate: "Dec 31, 2025",
      status: "Active",
      provider: 'polymarket'
    });
    setLoading(false);
  }, [marketId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-14">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading market...</p>
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-14">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Market not found</h2>
          <Button onClick={() => navigate('/markets')}>Back to Markets</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      <main className="flex-1 pt-6 pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            {/* Back Button */}
            <Button
              variant="ghost"
              onClick={() => navigate(-1)}
              className="mb-6"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            {/* Market Header */}
            <div className="mb-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{market.provider}</Badge>
                    <Badge variant={market.status === 'Active' ? 'default' : 'secondary'}>
                      {market.status}
                    </Badge>
                  </div>
                  <h1 className="text-3xl font-bold mb-2">{market.title}</h1>
                  <p className="text-muted-foreground">{market.description}</p>
                </div>
              </div>

              {/* Key Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Volume</div>
                  <div className="text-2xl font-bold">{market.volume}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Ends</div>
                  <div className="text-2xl font-bold">{market.endDate}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Status</div>
                  <div className="text-2xl font-bold">{market.status}</div>
                </Card>
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Chart and Info */}
              <div className="lg:col-span-2 space-y-6">
                {/* Price Chart Placeholder */}
                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-4">Price History</h2>
                  <div className="h-[400px] flex items-center justify-center bg-muted/20 rounded-lg">
                    <p className="text-muted-foreground">Chart will be integrated here</p>
                  </div>
                </Card>

                {/* Market Details */}
                <Card className="p-6">
                  <Tabs defaultValue="details">
                    <TabsList>
                      <TabsTrigger value="details">Details</TabsTrigger>
                      <TabsTrigger value="rules">Rules</TabsTrigger>
                      <TabsTrigger value="activity">Activity</TabsTrigger>
                    </TabsList>
                    <TabsContent value="details" className="pt-4">
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-semibold mb-2">Description</h3>
                          <p className="text-muted-foreground">{market.description}</p>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="rules" className="pt-4">
                      <p className="text-muted-foreground">Market rules and resolution criteria will appear here.</p>
                    </TabsContent>
                    <TabsContent value="activity" className="pt-4">
                      <p className="text-muted-foreground">Recent market activity will appear here.</p>
                    </TabsContent>
                  </Tabs>
                </Card>
              </div>

              {/* Trading Panel */}
              <div className="lg:col-span-1">
                <Card className="p-6 sticky top-20">
                  <h2 className="text-xl font-semibold mb-4">Trade</h2>
                  
                  {/* Current Prices */}
                  <div className="space-y-3 mb-6">
                    <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-green-700 dark:text-green-400">YES</span>
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="text-3xl font-bold text-green-700 dark:text-green-400">
                        {market.yesPrice}¢
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-red-700 dark:text-red-400">NO</span>
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      </div>
                      <div className="text-3xl font-bold text-red-700 dark:text-red-400">
                        {market.noPrice}¢
                      </div>
                    </div>
                  </div>

                  {/* Trade Actions */}
                  <div className="space-y-3">
                    <Button className="w-full bg-green-600 hover:bg-green-700" size="lg">
                      Buy YES
                    </Button>
                    <Button className="w-full bg-red-600 hover:bg-red-700" size="lg">
                      Buy NO
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground mt-4 text-center">
                    Trading requires connected API credentials
                  </p>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default MarketDetail;
