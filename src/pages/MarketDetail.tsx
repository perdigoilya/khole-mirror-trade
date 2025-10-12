import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, LineChart, Bookmark, Share2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTrading } from "@/contexts/TradingContext";
import Footer from "@/components/Footer";

interface Market {
  id: string;
  title: string;
  description: string;
  image?: string;
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
  isMultiOutcome?: boolean;
  subMarkets?: Market[];
}

const MarketDetail = () => {
  const { marketId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useTrading();
  const { toast } = useToast();
  const [market, setMarket] = useState<Market | null>(location.state?.market || null);
  const [loading, setLoading] = useState(!location.state?.market);
  const [timeRange, setTimeRange] = useState<'1H' | '6H' | '1D' | '1W' | '1M' | 'ALL'>('ALL');
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [tradeAmount, setTradeAmount] = useState<number>(0);
  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');

  useEffect(() => {
    if (!location.state?.market) {
      // Fetch market from API if not passed via navigation
      fetchMarket();
    }
  }, [marketId]);

  const fetchMarket = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('polymarket-markets', {
        body: { marketId }
      });
      
      if (error) throw error;
      
      const foundMarket = data?.markets?.find((m: Market) => m.id === marketId);
      if (foundMarket) {
        setMarket(foundMarket);
      }
    } catch (error) {
      console.error('Error fetching market:', error);
      toast({
        title: "Error",
        description: "Failed to load market details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTrade = (outcome: string, side: 'yes' | 'no') => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to trade",
        action: <a href="/auth" className="text-primary hover:underline">Sign in</a>,
      });
      return;
    }
    
    toast({
      title: "Trade Placed",
      description: `Buying ${side.toUpperCase()} on "${outcome}"`,
    });
  };

  const handleAddToWatchlist = async () => {
    if (!user || !market) {
      toast({
        title: "Account Required",
        description: "Please sign in to add to watchlist",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('watchlist')
        .insert([{
          user_id: user.id,
          market_id: market.id,
          market_ticker: market.id,
          market_title: market.title,
          market_data: JSON.parse(JSON.stringify(market)) as any
        }]);

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Already in Watchlist",
            description: "This market is already in your watchlist",
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "Added to Watchlist",
          description: "Market added to your watchlist",
        });
      }
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      toast({
        title: "Error",
        description: "Failed to add to watchlist",
        variant: "destructive",
      });
    }
  };

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
      <main className="flex-1 pt-6 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <Button
                variant="ghost"
                onClick={() => navigate(-1)}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handleAddToWatchlist}>
                  <Bookmark className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon">
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Title and Info */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                {market.image && (
                  <img 
                    src={market.image} 
                    alt={market.title}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                )}
                <div>
                  <h1 className="text-2xl font-bold mb-1">{market.title}</h1>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{market.volume} Vol.</span>
                  </div>
                </div>
              </div>
              
              {/* Outcome distribution for multi-outcome markets */}
              {market.isMultiOutcome && market.subMarkets && (
                <div className="flex items-center gap-4 text-sm">
                  {market.subMarkets.slice(0, 4).map((sub, idx) => (
                    <div key={sub.id} className="flex items-center gap-2">
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ 
                          backgroundColor: ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'][idx]
                        }}
                      />
                      <span>{sub.title.split(':')[0]} {sub.yesPrice}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid lg:grid-cols-[1fr,380px] gap-6">
              {/* Left Column - Chart and Outcomes */}
              <div className="space-y-6">
                {/* Chart */}
                <Card className="p-0 overflow-hidden">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <LineChart className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">Polymarket</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {(['1H', '6H', '1D', '1W', '1M', 'ALL'] as const).map((range) => (
                        <Button
                          key={range}
                          variant={timeRange === range ? 'secondary' : 'ghost'}
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setTimeRange(range)}
                        >
                          {range}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="h-[400px] bg-card flex items-center justify-center border-b border-border">
                    <div className="text-center">
                      <LineChart className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Price chart integration pending</p>
                    </div>
                  </div>
                </Card>

                {/* Outcomes List */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold mb-3">
                    {market.isMultiOutcome ? 'OUTCOME' : 'TRADE'}
                  </h2>
                  
                  {market.isMultiOutcome && market.subMarkets ? (
                    // Multi-outcome market - show all outcomes
                    market.subMarkets.map((outcome, idx) => (
                      <Card key={outcome.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <div 
                              className="w-10 h-10 rounded flex items-center justify-center font-bold text-white text-sm"
                              style={{ 
                                backgroundColor: ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'][idx % 4]
                              }}
                            >
                              {outcome.title.split(':')[0].slice(0, 3).toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-sm mb-1">{outcome.title}</h3>
                              <p className="text-xs text-muted-foreground">{outcome.volume} Vol.</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-2xl font-bold">{outcome.yesPrice || 50}%</div>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                onClick={() => handleTrade(outcome.title, 'yes')}
                              >
                                Buy Yes {outcome.yesPrice}¢
                              </Button>
                              <Button 
                                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30"
                                onClick={() => handleTrade(outcome.title, 'no')}
                              >
                                Buy No {outcome.noPrice}¢
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))
                  ) : (
                    // Binary market - show Yes/No
                    <Card className="p-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div className="text-sm text-muted-foreground">YES</div>
                          <div className="text-4xl font-bold text-emerald-400">{market.yesPrice}¢</div>
                          <Button 
                            className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            onClick={() => handleTrade(market.title, 'yes')}
                          >
                            Buy Yes
                          </Button>
                        </div>
                        <div className="space-y-3">
                          <div className="text-sm text-muted-foreground">NO</div>
                          <div className="text-4xl font-bold text-red-400">{market.noPrice}¢</div>
                          <Button 
                            className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30"
                            onClick={() => handleTrade(market.title, 'no')}
                          >
                            Buy No
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}
                </div>

                {/* Description */}
                <Card className="p-6">
                  <h2 className="text-lg font-semibold mb-3">About this market</h2>
                  <p className="text-sm text-muted-foreground">{market.description}</p>
                </Card>
              </div>

              {/* Right Column - Trading Panel & Related Markets */}
              <div className="space-y-6">
                {/* Trading Panel */}
                <Card className="p-6 sticky top-20">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                      <span className="font-bold text-primary">ARZ</span>
                    </div>
                    <span className="font-semibold">Arizona</span>
                  </div>

                  <Tabs value={tradeSide} onValueChange={(v) => setTradeSide(v as 'buy' | 'sell')} className="mb-4">
                    <TabsList className="w-full">
                      <TabsTrigger value="buy" className="flex-1">Buy</TabsTrigger>
                      <TabsTrigger value="sell" className="flex-1">Sell</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 h-12"
                        onClick={() => setSelectedOutcome('yes')}
                      >
                        Yes {market.yesPrice || 50}¢
                      </Button>
                      <Button 
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 h-12"
                        onClick={() => setSelectedOutcome('no')}
                      >
                        No {market.noPrice || 50}¢
                      </Button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Amount</span>
                        <span className="text-sm text-muted-foreground">Balance $3.00</span>
                      </div>
                      <div className="text-4xl font-bold mb-3">${tradeAmount}</div>
                      <div className="flex gap-2">
                        {[1, 20, 100].map((amount) => (
                          <Button
                            key={amount}
                            variant="outline"
                            size="sm"
                            onClick={() => setTradeAmount(tradeAmount + amount)}
                          >
                            +${amount}
                          </Button>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTradeAmount(3)}
                        >
                          Max
                        </Button>
                      </div>
                    </div>

                    <Button 
                      className="w-full h-12 bg-primary hover:bg-primary/90"
                      disabled={!selectedOutcome || tradeAmount === 0}
                    >
                      Buy {selectedOutcome === 'yes' ? 'Yes' : selectedOutcome === 'no' ? 'No' : ''}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center">
                      By trading, you agree to the Terms of Use.
                    </p>
                  </div>
                </Card>

                {/* Related Markets (if any) */}
                {market.subMarkets && market.subMarkets.length > 0 && (
                  <Card className="p-6">
                    <h3 className="font-semibold mb-4">Related Markets</h3>
                    <div className="space-y-3">
                      {market.subMarkets.slice(0, 5).map((related) => (
                        <button
                          key={related.id}
                          className="w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors"
                          onClick={() => navigate(`/market/${related.id}`, { state: { market: related }})}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium line-clamp-2 flex-1">{related.title}</span>
                            <span className="text-sm font-bold ml-2">{related.yesPrice || 50}%</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </Card>
                )}
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
