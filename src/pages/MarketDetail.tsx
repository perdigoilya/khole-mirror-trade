import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, LineChart, Star, Share2, TrendingUp, ExternalLink, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTrading } from "@/contexts/TradingContext";
import Footer from "@/components/Footer";
import { MarketChart } from "@/components/MarketChart";

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
  clobTokenId?: string;
  isMultiOutcome?: boolean;
  subMarkets?: Market[];
}

const MarketDetail = () => {
  const { marketId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, kalshiCredentials, polymarketCredentials } = useTrading();
  const { toast } = useToast();
  const [market, setMarket] = useState<Market | null>(location.state?.market || null);
  const [loading, setLoading] = useState(!location.state?.market);
  const [timeRange, setTimeRange] = useState<'1H' | '6H' | '1D' | '1W' | '1M' | 'ALL'>('ALL');
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [selectedSubMarket, setSelectedSubMarket] = useState<Market | null>(null);
  const [tradeAmount, setTradeAmount] = useState<string>('0');
  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');
  const [contentTab, setContentTab] = useState<'description' | 'positions' | 'trades'>('description');
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);

  useEffect(() => {
    const passed = (location.state as any)?.market;
    // Only fetch if we don't have complete market data
    if (!passed || !passed.clobTokenId || !passed.endDate || !passed.status) {
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
    
    // Check if connected to provider
    const hasCredentials = market?.provider === 'kalshi' 
      ? kalshiCredentials 
      : polymarketCredentials;
      
    if (!hasCredentials) {
      setConnectionDialogOpen(true);
      return;
    }
    
    toast({
      title: "Trade Placed",
      description: `Buying ${side.toUpperCase()} on "${outcome}"`,
    });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link Copied",
      description: "Market link copied to clipboard",
    });
    setShareDialogOpen(false);
  };
  
  useEffect(() => {
    if (market?.isMultiOutcome && market?.subMarkets && market.subMarkets.length > 0) {
      setSelectedSubMarket(market.subMarkets[0]);
    }
  }, [market]);

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
                onClick={() => navigate('/markets')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handleAddToWatchlist}>
                  <Star className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setShareDialogOpen(true)}>
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
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div>
                  <h1 className="text-2xl font-bold mb-1">{market.title}</h1>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{market.volume} Vol.</span>
                  </div>
                </div>
              </div>
              
            </div>

            <div className="grid lg:grid-cols-[1fr,380px] gap-4">
              {/* Left Column - Charts and Outcomes */}
              <div className="space-y-4">
                {/* Outcomes with Individual Charts */}
                <div className="space-y-2">
                  
                  {market.isMultiOutcome && market.subMarkets ? (
                    // Multi-outcome market - show each outcome with its own chart
                    market.subMarkets.map((outcome, idx) => {
                      const colorClasses = [
                        'bg-[hsl(var(--chart-orange))]',
                        'bg-[hsl(var(--chart-blue))]',
                        'bg-[hsl(var(--chart-green))]',
                        'bg-[hsl(var(--chart-yellow))]',
                      ];
                      const textColorClasses = [
                        'text-[hsl(var(--chart-orange))]',
                        'text-[hsl(var(--chart-blue))]',
                        'text-[hsl(var(--chart-green))]',
                        'text-[hsl(var(--chart-yellow))]',
                      ];
                      
                      return (
                      <Card key={outcome.id} className="overflow-hidden">
                        {/* Outcome Header */}
                        <div className="p-3 border-b border-border">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              {outcome.image ? (
                                <img 
                                  src={outcome.image}
                                  alt={outcome.title}
                                  className="w-10 h-10 rounded object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div 
                                className={`w-10 h-10 rounded flex items-center justify-center font-bold text-background text-sm ${colorClasses[idx % 4]} ${outcome.image ? 'hidden' : ''}`}
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
                                <div className="text-2xl font-bold text-emerald-400">
                                  {outcome.yesPrice || 50}%
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button 
                                  size="sm"
                                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  onClick={() => {
                                    setSelectedSubMarket(outcome);
                                    handleTrade(outcome.title, 'yes');
                                  }}
                                >
                                  Buy {outcome.yesPrice}¢
                                </Button>
                                <Button 
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate(`/market/${outcome.id}`, { state: { market: outcome }})}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Individual Chart */}
                        <div className="p-2 border-b border-border flex items-center justify-between bg-card/30">
                          <div className="flex items-center gap-2">
                            <LineChart className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-medium">Price History</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {(['1H', '6H', '1D', '1W', '1M', 'ALL'] as const).map((range) => (
                              <Button
                                key={range}
                                variant={timeRange === range ? 'default' : 'ghost'}
                                size="sm"
                                className="h-7 px-2 text-xs font-medium"
                                onClick={() => setTimeRange(range)}
                              >
                                {range}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="h-[280px] bg-card/50 backdrop-blur-sm p-2">
                          <MarketChart 
                            marketId={outcome.clobTokenId || outcome.id} 
                            timeRange={timeRange}
                          />
                        </div>
                      </Card>
                      );
                    })
                  ) : (
                    // Binary market - show single chart and Yes/No buttons
                    <>
                      <Card className="p-0 overflow-hidden">
                        <div className="p-2 border-b border-border flex items-center justify-between bg-card/30">
                          <div className="flex items-center gap-2">
                            <LineChart className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-medium">Price History</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {(['1H', '6H', '1D', '1W', '1M', 'ALL'] as const).map((range) => (
                              <Button
                                key={range}
                                variant={timeRange === range ? 'default' : 'ghost'}
                                size="sm"
                                className="h-7 px-2 text-xs font-medium"
                                onClick={() => setTimeRange(range)}
                              >
                                {range}
                              </Button>
                            ))}
                          </div>
                        </div>
                        
                        <div className="h-[400px] bg-card/50 backdrop-blur-sm p-2">
                          <MarketChart 
                            marketId={market.clobTokenId || market.id} 
                            timeRange={timeRange}
                          />
                        </div>
                      </Card>
                      
                      <Card className="p-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">YES</div>
                            <div className="text-3xl font-bold text-emerald-400">{market.yesPrice}¢</div>
                            <Button 
                              className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              onClick={() => handleTrade(market.title, 'yes')}
                            >
                              Buy Yes
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">NO</div>
                            <div className="text-3xl font-bold text-red-400">{market.noPrice}¢</div>
                            <Button 
                              className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30"
                              onClick={() => handleTrade(market.title, 'no')}
                            >
                              Buy No
                            </Button>
                          </div>
                        </div>
                      </Card>
                    </>
                  )}
                </div>

                {/* Content Tabs */}
                <Card className="p-4">
                  <Tabs value={contentTab} onValueChange={(v) => setContentTab(v as any)}>
                    <TabsList className="w-full mb-4">
                      <TabsTrigger value="description" className="flex-1">Description</TabsTrigger>
                      <TabsTrigger value="positions" className="flex-1">Positions</TabsTrigger>
                      <TabsTrigger value="trades" className="flex-1">Trades</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="description" className="mt-0">
                      <div className="space-y-2">
                        <h2 className="text-base font-semibold">About this market</h2>
                        <p className="text-sm text-muted-foreground">{market.description}</p>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="positions" className="mt-0">
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground">No positions yet</p>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="trades" className="mt-0">
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground">No trades yet</p>
                      </div>
                    </TabsContent>
                  </Tabs>
                </Card>
              </div>

              {/* Right Column - Trading Panel */}
              <div className="space-y-4">
                {/* Trading Panel */}
                <Card className="p-4 sticky top-20">
                  <div className="flex items-center gap-2 mb-4">
                    {(selectedSubMarket || market).image ? (
                      <img 
                        src={(selectedSubMarket || market).image} 
                        alt={(selectedSubMarket || market).title}
                        className="w-10 h-10 rounded object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
                        <span className="font-bold text-primary text-xs">
                          {(selectedSubMarket || market).title.slice(0, 3).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm line-clamp-2">{(selectedSubMarket || market).title}</span>
                    </div>
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
                        Yes {(selectedSubMarket || market).yesPrice || 50}¢
                      </Button>
                      <Button 
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 h-12"
                        onClick={() => setSelectedOutcome('no')}
                      >
                        No {(selectedSubMarket || market).noPrice || 50}¢
                      </Button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Amount</span>
                        <span className="text-sm text-muted-foreground">Balance $3.00</span>
                      </div>
                      <Input 
                        type="number"
                        value={tradeAmount}
                        onChange={(e) => setTradeAmount(e.target.value)}
                        placeholder="0"
                        className="text-2xl font-bold h-14 mb-2"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTradeAmount('3')}
                        >
                          Max
                        </Button>
                      </div>
                    </div>

                    <Button 
                      className="w-full h-12 bg-primary hover:bg-primary/90"
                      onClick={() => {
                        if (!selectedOutcome) {
                          toast({
                            title: "Select Outcome",
                            description: "Please select Yes or No first",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        if (parseFloat(tradeAmount) === 0) {
                          toast({
                            title: "Enter Amount",
                            description: "Please enter a trade amount",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        if (!user) {
                          toast({
                            title: "Authentication Required",
                            description: "Please sign in to trade",
                            action: <a href="/auth" className="text-primary hover:underline">Sign in</a>,
                          });
                          return;
                        }
                        
                        const hasCredentials = market?.provider === 'kalshi' 
                          ? kalshiCredentials 
                          : polymarketCredentials;
                          
                        if (!hasCredentials) {
                          setConnectionDialogOpen(true);
                          return;
                        }
                        
                        toast({
                          title: "Trade Placed",
                          description: `Placed ${tradeSide} order for ${selectedOutcome}`,
                        });
                      }}
                    >
                      Buy {selectedOutcome === 'yes' ? 'Yes' : selectedOutcome === 'no' ? 'No' : ''}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center">
                      By trading, you agree to the Terms of Use.
                    </p>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Market</DialogTitle>
            <DialogDescription>
              Share this market with others
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input value={window.location.href} readOnly className="flex-1" />
              <Button onClick={handleCopyLink}>Copy</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Connection Required Dialog */}
      <Dialog open={connectionDialogOpen} onOpenChange={setConnectionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Trading Account</DialogTitle>
            <DialogDescription>
              You need to connect your trading account to place trades
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
              <Key className="h-10 w-10 text-primary" />
            </div>
            <p className="text-muted-foreground mb-6">
              Connect your Kalshi or Polymarket account to start trading. Your credentials are stored securely in your browser.
            </p>
            <div className="flex gap-2 w-full">
              <Button
                onClick={() => setConnectionDialogOpen(false)}
                variant="outline"
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={() => {
                  setConnectionDialogOpen(false);
                  navigate('/portfolio');
                }}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                Connect Account
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      <Footer />
    </div>
  );
};

export default MarketDetail;
