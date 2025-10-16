import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import { Star, TrendingUp, TrendingDown, ShoppingCart, DollarSign, LineChart, Filter, Key } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { useNavigate } from "react-router-dom";
import { useAccount, useSignTypedData, useSwitchChain } from "wagmi";
import { polygon } from "wagmi/chains";
import { 
  buildPolymarketOrder, 
  formatSignedOrder, 
  POLYMARKET_ORDER_DOMAIN, 
  POLYMARKET_ORDER_TYPES 
} from "@/lib/polymarket-orders";

const Watchlist = () => {
  const { user, kalshiCredentials, polymarketCredentials } = useTrading();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { address, isConnected, chain } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { switchChainAsync } = useSwitchChain();
  const [sortBy, setSortBy] = useState("recent");
  const [filterCategory, setFilterCategory] = useState("all");
  const [watchedMarkets, setWatchedMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [currentTrade, setCurrentTrade] = useState<{market: any, side: 'yes' | 'no', price: number} | null>(null);
  const [tradeAmount, setTradeAmount] = useState<string>('0');
  
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
        .order('added_at', { ascending: false });

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

    // Check if connected to provider
    const hasCredentials = market.provider === 'kalshi' 
      ? kalshiCredentials 
      : polymarketCredentials;
      
    if (!hasCredentials) {
      setConnectionDialogOpen(true);
      return;
    }

    const price = side === 'yes' ? market.yesPrice : market.noPrice;
    setCurrentTrade({ market, side, price });
    setTradeDialogOpen(true);
  };

  const executeTrade = async () => {
    if (!currentTrade) return;

    try {
      const shares = parseFloat(tradeAmount);
      if (isNaN(shares) || shares <= 0) {
        toast({
          title: "Invalid Amount",
          description: "Please enter a valid number of shares",
          variant: "destructive",
        });
        return;
      }

      // Show processing toast
      toast({
        title: "Processing Trade...",
        description: "Validating and submitting your order",
      });

      const market = currentTrade.market;

      if (market.provider === 'polymarket') {
        // Polymarket trading
        if (!polymarketCredentials?.walletAddress || !isConnected || !address) {
          toast({
            title: "Wallet Not Connected",
            description: "Please connect your Polymarket wallet first",
            variant: "destructive",
          });
          return;
        }

        // Get the token ID for the market
        let tokenId = market.clobTokenId;
        
        // Clean up tokenId if it has array brackets or quotes
        if (tokenId && typeof tokenId === 'string') {
          // Remove array brackets and extra quotes
          tokenId = tokenId.replace(/^\["|"\]$/g, '').replace(/^"|"$/g, '').trim();
          // If it's still an array string, try to parse it
          if (tokenId.startsWith('[')) {
            try {
              const parsed = JSON.parse(tokenId);
              tokenId = Array.isArray(parsed) ? parsed[0] : tokenId;
            } catch (e) {
              console.warn('Could not parse tokenId:', tokenId);
            }
          }
        }
        
        if (!tokenId) {
          toast({
            title: "Market Configuration Error",
            description: "This market is not properly configured for trading",
            variant: "destructive",
          });
          return;
        }

        try {
          // Check if wallet is on Polygon network
          if (chain?.id !== polygon.id) {
            console.log('Switching to Polygon network...');
            try {
              await switchChainAsync({ chainId: polygon.id });
            } catch (switchError: any) {
              toast({
                title: "Network Switch Required",
                description: "Please switch to Polygon network in your wallet to place trades on Polymarket.",
                variant: "destructive",
              });
              return;
            }
          }

          // Convert price to proper format (0-1 range)
          const price = currentTrade.price / 100;
          const side = currentTrade.side === 'yes' ? 'BUY' : 'SELL';
          
          console.log('Building order:', {
            tokenId,
            price,
            size: shares,
            side,
            walletAddress: address
          });

          // Build the order structure
          const order = buildPolymarketOrder({
            tokenId,
            price,
            size: shares,
            side,
            walletAddress: address,
          });

          // Sign the order with the user's wallet
          console.log('Requesting signature...');
          const signature = await signTypedDataAsync({
            account: address,
            domain: POLYMARKET_ORDER_DOMAIN,
            types: POLYMARKET_ORDER_TYPES,
            primaryType: 'Order',
            message: order,
          });

          // Format the signed order for API submission
          const signedOrder = formatSignedOrder(order, signature);

          console.log('Submitting order to Polymarket...');
          
          // Prepare headers
          const headers: HeadersInit = {
            'Content-Type': 'application/json',
          };

          // Add API key if available
          if (polymarketCredentials?.apiKey) {
            headers['Authorization'] = `Bearer ${polymarketCredentials.apiKey}`;
          }

          // Submit the order to Polymarket CLOB API
          const response = await fetch('https://clob.polymarket.com/order', {
            method: 'POST',
            headers,
            body: JSON.stringify(signedOrder),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Order submission failed: ${response.statusText}`);
          }

          const result = await response.json();
          console.log('Order placed successfully:', result);

          toast({
            title: "Trade Executed Successfully! ✅",
            description: `Your ${currentTrade.side.toUpperCase()} order for ${shares} shares at $${(price * 100).toFixed(2)}¢ has been placed.`,
          });

          setTradeDialogOpen(false);
          setTradeAmount('0');
          setCurrentTrade(null);

        } catch (error: any) {
          console.error('Polymarket trade error:', error);
          
          if (error.message?.includes('insufficient') || error.message?.includes('balance')) {
            toast({
              title: "Insufficient Funds ❌",
              description: "Your wallet doesn't have enough USDC to complete this trade. Please deposit funds to your Polymarket wallet.",
              variant: "destructive",
            });
          } else if (error.message?.includes('User rejected') || error.message?.includes('denied')) {
            toast({
              title: "Transaction Cancelled",
              description: "You cancelled the transaction in your wallet.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Trade Failed",
              description: error.message || "Could not execute trade. Please try again.",
              variant: "destructive",
            });
          }
          return;
        }

      } else {
        // Kalshi trading
        if (!kalshiCredentials) {
          toast({
            title: "Kalshi Not Connected",
            description: "Please connect your Kalshi account first",
            variant: "destructive",
          });
          return;
        }

        const response = await supabase.functions.invoke('kalshi-trade', {
          body: {
            apiKeyId: kalshiCredentials.apiKeyId,
            privateKey: kalshiCredentials.privateKey,
            ticker: market.ticker,
            action: 'buy',
            side: currentTrade.side,
            count: Math.floor(shares),
            type: 'limit',
            yesPrice: currentTrade.side === 'yes' ? currentTrade.price : undefined,
            noPrice: currentTrade.side === 'no' ? currentTrade.price : undefined,
          },
        });

        if (response.error) {
          const errorData = response.error as any;
          
          // Check for specific error types
          if (errorData.details?.includes('Insufficient funds') || errorData.details?.includes('balance')) {
            toast({
              title: "Insufficient Funds ❌",
              description: "Your Kalshi account doesn't have enough funds to complete this trade. Please deposit funds to your Kalshi account.",
              variant: "destructive",
            });
          } else {
            toast({
              title: errorData.error || "Trade Failed",
              description: errorData.details || "Could not execute trade. Please try again.",
              variant: "destructive",
            });
          }
          return;
        }

        const cost = (shares * currentTrade.price / 100).toFixed(2);
        toast({
          title: "Order Submitted Successfully! ✅",
          description: `Bought ${shares} shares of ${currentTrade.side.toUpperCase()} at ${currentTrade.price}¢ (Total: $${cost})`,
        });
      }

      setTradeDialogOpen(false);
      setTradeAmount('0');
      setCurrentTrade(null);
    } catch (error) {
      console.error('Trade error:', error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
      toast({
        title: "Trade Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
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
                            className="h-8 w-8 p-0 hover:bg-destructive/10 transition-colors"
                            onClick={() => removeFromWatchlist(market.id, market.dbId)}
                            title="Remove from watchlist"
                          >
                            <Star className="h-5 w-5 text-primary fill-primary hover:text-destructive hover:fill-destructive transition-colors" />
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

      {/* Trade Confirmation Dialog */}
      <Dialog open={tradeDialogOpen} onOpenChange={setTradeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Trade</DialogTitle>
            <DialogDescription>
              Review your trade details before confirming
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {currentTrade && (
              <>
                <div className="p-4 rounded-lg bg-card border border-border">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Market</span>
                      <span className="text-sm font-medium line-clamp-1">{currentTrade.market.title}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Side</span>
                      <Badge variant={currentTrade.side === 'yes' ? 'default' : 'destructive'}>
                        {currentTrade.side.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Price</span>
                      <span className="text-sm font-medium">{currentTrade.price}¢</span>
                    </div>
                    <div className="border-t border-border pt-3">
                      <label className="text-sm text-muted-foreground block mb-2">
                        Number of Shares
                      </label>
                      <Input
                        type="number"
                        value={tradeAmount}
                        onChange={(e) => setTradeAmount(e.target.value)}
                        placeholder="Enter amount"
                        min="0"
                        step="1"
                        className="mb-3"
                      />
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Total Cost</span>
                        <span className="font-bold">
                          ${((parseFloat(tradeAmount) || 0) * currentTrade.price / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setTradeDialogOpen(false);
                      setTradeAmount('0');
                      setCurrentTrade(null);
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={executeTrade}
                    className={`flex-1 ${
                      currentTrade.side === 'yes'
                        ? 'bg-emerald-500 hover:bg-emerald-600'
                        : 'bg-red-500 hover:bg-red-600'
                    }`}
                  >
                    Confirm Trade
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  By trading, you agree to the Terms of Use.
                </p>
              </>
            )}
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
              Connect your Kalshi or Polymarket account to start trading. Your credentials are stored securely.
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

export default Watchlist;
