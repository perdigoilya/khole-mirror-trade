import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useMemo, useRef } from "react";
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
import { KalshiTradeDialog } from "@/components/KalshiTradeDialog";
import { useAccount, useSignTypedData, useSwitchChain } from "wagmi";
import { polygon } from "wagmi/chains";
import { 
  buildPolymarketOrder, 
  formatSignedOrder, 
  POLYMARKET_ORDER_DOMAIN, 
  POLYMARKET_ORDER_TYPES 
} from "@/lib/polymarket-orders";
import { useEnsurePolymarketCredentials } from "@/hooks/usePolymarketCredentials";

// Component to display user's positions for this market
const UserPositionsTab = ({ marketId, ticker, provider, kalshiCredentials, polymarketCredentials }: {
  marketId: string;
  ticker?: string;
  provider: 'kalshi' | 'polymarket';
  kalshiCredentials: any;
  polymarketCredentials: any;
}) => {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellLoading, setSellLoading] = useState<string | null>(null);
  const { toast } = useToast();
  
  useEffect(() => {
    const fetchPositions = async () => {
      setLoading(true);
      try {
        if (provider === 'kalshi' && kalshiCredentials) {
          const { data, error } = await supabase.functions.invoke('kalshi-portfolio', {
            body: kalshiCredentials,
          });
          
          if (error) throw error;
          
          // Filter positions for this specific market ticker
          const marketPositions = (data.positions || []).filter((p: any) => 
            p.slug === ticker || p.slug === marketId
          );
          setPositions(marketPositions);
        } else if (provider === 'polymarket' && polymarketCredentials) {
          // Polymarket position fetching
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/polymarket-portfolio`,
            {
              headers: {
                Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
              },
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            const marketPositions = (data.positions || []).filter((p: any) => 
              p.slug === marketId || p.title.toLowerCase().includes(marketId.toLowerCase())
            );
            setPositions(marketPositions);
          }
        }
      } catch (error) {
        console.error('Error fetching positions:', error);
      } finally {
        setLoading(false);
      }
    };
    
    if ((kalshiCredentials || polymarketCredentials) && (ticker || marketId)) {
      fetchPositions();
    } else {
      setLoading(false);
    }
  }, [marketId, ticker, provider, kalshiCredentials, polymarketCredentials]);
  
  const handleSellPosition = async (position: any) => {
    if (!position.size || position.size <= 0) return;
    
    setSellLoading(position.slug);
    try {
      if (provider === 'kalshi' && kalshiCredentials) {
        const payload: any = {
          apiKeyId: kalshiCredentials.apiKeyId,
          privateKey: kalshiCredentials.privateKey,
          ticker: position.slug,
          action: 'sell',
          side: position.outcome.toLowerCase(),
          count: Math.floor(position.size),
          type: 'market',
          environment: kalshiCredentials.environment,
        };

        const { data, error } = await supabase.functions.invoke('kalshi-trade', {
          body: payload,
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast({
          title: 'Sell order placed',
          description: 'Checking fill status...'
        });

        // Poll for up to 10s to confirm the position size decreased
        let cleared = false;
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const { data: pData, error: pErr } = await supabase.functions.invoke('kalshi-portfolio', {
            body: kalshiCredentials,
          });
          if (pErr) break;
          const updated = (pData?.positions || []).find((p: any) => p.slug === position.slug);
          if (!updated || (updated.size ?? 0) < position.size) {
            cleared = true;
            // Refresh positions
            const marketPositions = (pData.positions || []).filter((p: any) => 
              p.slug === ticker || p.slug === marketId
            );
            setPositions(marketPositions);
            break;
          }
        }

        if (cleared) {
          toast({
            title: 'Shares sold',
            description: `Successfully submitted sale for ${Math.floor(position.size)} shares`,
          });
        } else {
          toast({
            title: 'Order pending',
            description: 'Your sell order is resting and will fill shortly at 2¢.',
          });
          // Refresh anyway
          const { data: refreshData } = await supabase.functions.invoke('kalshi-portfolio', {
            body: kalshiCredentials,
          });
          if (refreshData) {
            const marketPositions = (refreshData.positions || []).filter((p: any) => 
              p.slug === ticker || p.slug === marketId
            );
            setPositions(marketPositions);
          }
        }
      } else {
        // Polymarket sell logic
        toast({
          title: "Coming Soon",
          description: "Polymarket selling from market detail page coming soon",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Sell error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to sell shares",
        variant: "destructive",
      });
    } finally {
      setSellLoading(null);
    }
  };
  
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
        <p className="text-sm text-muted-foreground">Loading positions...</p>
      </div>
    );
  }
  
  if (positions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">You have no positions in this market</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {positions.map((position, idx) => (
        <div key={idx} className="p-4 bg-muted/30 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-medium">{position.outcome}</p>
              <p className="text-xs text-muted-foreground">{position.title}</p>
            </div>
            <Badge variant={position.percentPnl >= 0 ? "default" : "destructive"}>
              {position.percentPnl >= 0 ? '+' : ''}{position.percentPnl.toFixed(2)}%
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Shares</p>
              <p className="font-medium">{position.size}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Avg Price</p>
              <p className="font-medium">${position.avgPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Current Value</p>
              <p className="font-medium">${position.currentValue.toFixed(2)}</p>
            </div>
          </div>
          {position.pendingCount > 0 && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Pending: {position.pendingCount} @ ${position.pendingPrice?.toFixed(2)} (resting)
              </p>
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-border">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleSellPosition(position)}
              disabled={sellLoading === position.slug || position.size <= 0}
              className="w-full"
            >
              {sellLoading === position.slug ? 'Selling...' : `Sell ${Math.floor(position.size)} Shares`}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

interface Market {
  id: string;
  title: string;
  description: string;
  image?: string;
  yesPrice?: number;
  noPrice?: number;
  yesAsk?: number;
  yesBid?: number;
  noAsk?: number;
  noBid?: number;
  volume: string;
  liquidity: string;
  endDate: string;
  status: string;
  category: string;
  provider: 'kalshi' | 'polymarket';
  volumeRaw: number;
  liquidityRaw: number;
  clobTokenId?: string;
  ticker?: string;
  eventTicker?: string;
  isMultiOutcome?: boolean;
  subMarkets?: Market[];
}

const MarketDetail = () => {
  const { marketId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, kalshiCredentials, polymarketCredentials } = useTrading();
  const { toast } = useToast();
  const { address, isConnected, chain } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { switchChainAsync } = useSwitchChain();
  const { ensureApiCreds } = useEnsurePolymarketCredentials();
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
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [kalshiTradeDialogOpen, setKalshiTradeDialogOpen] = useState(false);
  const [currentTrade, setCurrentTrade] = useState<{outcome: string, side: 'yes' | 'no', price: number} | null>(null);

  // Platform-specific styling (after market state is declared)
  const isKalshi = market?.provider === 'kalshi';
  const platformBadgeClass = isKalshi 
    ? "bg-kalshi-teal/20 text-kalshi-teal border-kalshi-teal/30" 
    : "bg-polymarket-purple/20 text-polymarket-purple border-polymarket-purple/30";
  const platformAccentClass = isKalshi ? "border-kalshi-teal" : "border-polymarket-purple";
  const platformName = isKalshi ? "Kalshi" : "Polymarket";

  const displayTitle = useMemo(() => {
    if (isKalshi) {
      // For Kalshi: Clean up "yes/no" prefixes
      const raw = (selectedSubMarket || market)?.title || '';
      return raw.replace(/\b(yes|no)\s+/gi, '').trim();
    }
    const raw = (selectedSubMarket || market)?.title || '';
    return raw;
  }, [isKalshi, market, selectedSubMarket]);

  const marketDetailCacheRef = useRef<Map<string, { market: Market, timestamp: number }>>(new Map());
  const CACHE_DURATION = 60000; // 60 seconds
  
  useEffect(() => {
    const passed = (location.state as any)?.market;
    // Always fetch fresh details for Kalshi to ensure accurate rules
    if (passed?.provider === 'kalshi') {
      fetchMarket();
      return;
    }
    // Only fetch if we don't have complete market data
    if (!passed || !passed.clobTokenId || !passed.endDate || !passed.status) {
      fetchMarket();
    } else {
      setMarket(passed);
      setLoading(false);
    }
  }, [marketId]);

  const fetchMarket = async () => {
    if (!marketId) return;
    
    // Check cache
    const cached = marketDetailCacheRef.current.get(marketId);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setMarket(cached.market);
      return;
    }

    setLoading(true);
    try {
      // Determine provider from passed state or try to detect from marketId format
      const passedMarket = (location.state as any)?.market;
      const provider = passedMarket?.provider || (marketId.includes('-') ? 'kalshi' : 'polymarket');
      
      let result;
      if (provider === 'kalshi') {
        const { data, error } = await supabase.functions.invoke('kalshi-market-detail', {
          body: { ticker: marketId }
        });
        if (error) throw error;
        const marketResp = (data as any)?.market;
        if (marketResp) {
          marketDetailCacheRef.current.set(marketId, {
            market: marketResp,
            timestamp: Date.now()
          });
          setMarket(marketResp);
          return;
        } else {
          // If this looks like an event ticker, redirect to the event detail page
          navigate(`/kalshi/event/${marketId}`);
          return;
        }
      } else {
        // Fetch Polymarket market
        result = await supabase.functions.invoke('polymarket-markets', {
          body: { marketId }
        });
        const { data, error } = result;
        if (error) throw error;
        const foundMarket = data?.markets?.find((m: Market) => m.id === marketId);
        if (foundMarket) {
          marketDetailCacheRef.current.set(marketId, {
            market: foundMarket,
            timestamp: Date.now()
          });
          setMarket(foundMarket);
          return;
        }
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

  const handleTrade = async (outcome: string, side: 'yes' | 'no', price: number) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to trade",
        action: <a href="/auth" className="text-primary hover:underline">Sign in</a>,
      });
      return;
    }
    
    // Check if connected to provider - use selectedSubMarket if available
    const targetMarket = selectedSubMarket || market;
    const hasCredentials = targetMarket?.provider === 'kalshi'
      ? !!kalshiCredentials
      : !!(
          polymarketCredentials?.apiCredentials?.apiKey &&
          polymarketCredentials?.apiCredentials?.secret &&
          polymarketCredentials?.apiCredentials?.passphrase
        );
    
    if (!hasCredentials) {
      if (targetMarket?.provider === 'polymarket') {
        toast({
          title: "Polymarket Setup Required",
          description: "Open Connect and finish API key setup before trading.",
          variant: "destructive",
        });
      }
      setConnectionDialogOpen(true);
      return;
    }

    // For Kalshi: show the dedicated Kalshi trade dialog
    if (targetMarket?.provider === 'kalshi') {
      setKalshiTradeDialogOpen(true);
      return;
    }

    // For Polymarket: verify trading is enabled via L2 sanity check
    if (targetMarket?.provider === 'polymarket') {
      try {
        const { data, error } = await supabase.functions.invoke('polymarket-connect-status', {
          body: { connectedEOA: address }
        });
        if (error) throw error;
        if (!data?.tradingEnabled) {
          console.error('Trading not enabled:', data);
          if (data?.closed_only === true || data?.closedOnly === true) {
            toast({
              title: 'Account in Closed-Only Mode',
              description: "Your Polymarket account can't open new positions. Visit Polymarket to resolve restrictions.",
              variant: 'destructive',
            });
          } else if (data?.ownerMatch === false) {
            toast({
              title: 'Wallet Mismatch',
              description: 'Connected wallet does not match your Polymarket credentials. Reconnect in Portfolio.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Trading Not Available',
              description: 'L2 authentication failed. Please reconnect in Portfolio.',
              variant: 'destructive',
            });
          }
          return;
        }
        console.log('✓ Trading enabled - proceeding with trade');
      } catch (e: any) {
        console.error('Sanity check error:', e);
        toast({
          title: 'Connection Check Failed',
          description: 'Unable to verify trading status. Please try reconnecting.',
          variant: 'destructive',
        });
        return;
      }
    }
    
    setCurrentTrade({ outcome, side, price });
    setTradeDialogOpen(true);
  };

  const executeTrade = async () => {
    if (!currentTrade) return;

    // Use selectedSubMarket if available, otherwise use main market
    const targetMarket = selectedSubMarket || market;
    if (!targetMarket) return;

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
        description: `Trading on ${targetMarket.title}`,
      });

      if (targetMarket.provider === 'polymarket') {
        // Polymarket trading
        if (!polymarketCredentials?.walletAddress || !isConnected || !address) {
          toast({
            title: "Wallet Not Connected",
            description: "Please connect your Polymarket wallet first",
            variant: "destructive",
          });
          return;
        }

        // Get the token ID for the specific market being traded
        let tokenId = targetMarket.clobTokenId;
        
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
          const funderAddress = polymarketCredentials?.apiCredentials?.funderAddress || address;
          const order = buildPolymarketOrder({
            tokenId,
            price,
            size: shares,
            side,
            walletAddress: address,
            funderAddress,
            signatureType: 2, // Browser wallet
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
          
          // Submit order via backend (requires L2 API credentials)
          const apiCreds = polymarketCredentials?.apiCredentials;
          if (!apiCreds?.apiKey || !apiCreds?.secret || !apiCreds?.passphrase) {
            throw new Error('Missing Polymarket API credentials. Open Connect and set up trading first.');
          }

          // Submit order via backend (requires L2 API credentials held server-side)
          const { data, error } = await supabase.functions.invoke('polymarket-trade', {
            body: {
              walletAddress: address,
              tokenId,
              side,
              price,
              size: shares,
              signedOrder,
              funderAddress,
            }
          });

          if (error || !data?.success) {
            const errorData = data as any;
            
            // Log comprehensive diagnostics
            const diagnostics = {
              status: errorData?.status,
              statusText: errorData?.error || 'Unknown',
              upstreamJSON: errorData?.upstream,
              polyAddress: address,
              polyTimestamp: 'server-generated',
              funder: funderAddress,
              signatureType: 2, // browser wallet
              cfRay: errorData?.cfRay,
              cfCache: errorData?.cfCache,
              server: errorData?.server,
              contentType: errorData?.contentType,
            };
            
            console.error('Polymarket trade error - Full Diagnostics:', diagnostics);
            
            // Check for session expiry (401)
            if (errorData?.action === 'reconnect_required' || errorData?.status === 401) {
              toast({
                title: "Session Expired",
                description: "Your Polymarket session expired. Please disconnect and reconnect in Portfolio.",
                variant: "destructive",
              });
              throw new Error('Session expired - please reconnect');
            }
            
            // Check for Cloudflare block (403)
            if (errorData?.status === 403 && errorData?.cfRay) {
              const diagnosticMsg = `Cloudflare blocked (Ray: ${errorData.cfRay})\nServer: ${errorData.server || 'unknown'}\nCache: ${errorData.cfCache || 'unknown'}`;
              toast({
                title: "Request Blocked",
                description: diagnosticMsg,
                variant: "destructive",
              });
              console.error('Cloudflare 403 diagnostics:', {
                cfRay: errorData.cfRay,
                cfCache: errorData.cfCache,
                server: errorData.server,
                upstream: errorData.upstream,
              });
              throw new Error('Cloudflare 403 - egress blocked');
            }
            
            // Parse upstream JSON for specific CLOB errors
            let upstreamError = errorData?.upstream;
            if (typeof upstreamError === 'string') {
              try {
                const parsed = JSON.parse(upstreamError);
                upstreamError = parsed;
              } catch {
                // Keep as string if not JSON
              }
            }
            
            // Check for specific business errors from CLOB
            if (upstreamError?.error) {
              const errorMsg = upstreamError.error;
              console.error('CLOB Business Error:', errorMsg);
              
              if (errorMsg.includes('INVALID_ORDER_MIN_TICK_SIZE')) {
                toast({
                  title: "Invalid Order - Min Tick Size",
                  description: "Price increment too small. Try rounding to 2 decimal places.",
                  variant: "destructive",
                });
              } else if (errorMsg.includes('INVALID_ORDER_MIN_SIZE')) {
                toast({
                  title: "Invalid Order - Min Size",
                  description: "Order size too small. Minimum is typically 1 share.",
                  variant: "destructive",
                });
              } else if (errorMsg.includes('NOT_ENOUGH_BALANCE') || errorMsg.includes('INVALID_ORDER_NOT_ENOUGH_BALANCE')) {
                toast({
                  title: "Insufficient Balance",
                  description: `Your proxy/wallet doesn't have enough USDC for this trade.\nFunder: ${funderAddress.slice(0, 8)}...${funderAddress.slice(-6)}`,
                  variant: "destructive",
                });
              } else if (errorMsg.includes('MARKET_CLOSED')) {
                toast({
                  title: "Market Closed",
                  description: "This market is no longer accepting orders.",
                  variant: "destructive",
                });
              } else if (errorMsg.includes('CLOSED_ONLY')) {
                toast({
                  title: "Market Closing",
                  description: "This market only accepts orders that close positions.",
                  variant: "destructive",
                });
              } else {
                toast({
                  title: "Order Failed",
                  description: errorMsg,
                  variant: "destructive",
                });
              }
              throw new Error(errorMsg);
            }
            
            // Generic error with diagnostics
            const diagnosticSummary = `Status: ${errorData?.status}\nPOLY_ADDRESS: ${address}\nFunder: ${funderAddress}\nError: ${errorData?.error || 'Unknown'}`;
            toast({
              title: "Order Submission Failed",
              description: diagnosticSummary,
              variant: "destructive",
            });
            
            // Log full diagnostics for debugging
            console.error('Full diagnostic object:', diagnostics);
            throw new Error(errorData?.error || error?.message || 'Trade failed');
          }


          console.log('Order placed successfully:', data);
          
          // Log success diagnostics
          console.log('✓ Trade Success Diagnostics:', {
            orderId: data.orderId,
            polyAddress: address,
            funder: funderAddress,
            signatureType: 2,
            status: 'success',
          });

          toast({
            title: "Order Placed Successfully",
            description: `Order ID: ${data.orderId}\nYour ${currentTrade.side.toUpperCase()} order has been submitted.`,
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
            ticker: targetMarket.ticker,
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
          description: `Bought ${shares} shares of ${currentTrade.side.toUpperCase()} for ${targetMarket.title} at ${currentTrade.price}¢ (Total: $${cost})`,
        });
      }

      setTradeDialogOpen(false);
      setTradeAmount('0');
      setCurrentTrade(null);
      setSelectedOutcome(null);
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

            {/* Title Section */}
            <div className="mb-6">
              <div className="flex items-start gap-4 mb-4">
                {market.image && (
                  <img 
                    src={market.image} 
                    alt={market.title}
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant="outline" className={`${platformBadgeClass} text-xs px-2.5 py-0.5`}>
                      {platformName}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {market.category}
                    </Badge>
                  </div>
                  <h1 className="text-3xl font-bold mb-2">{displayTitle}</h1>
                  {isKalshi && (market.eventTicker) && (
                    <div className="mt-1">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/kalshi/event/${market.eventTicker}`)}>
                        View all markets in this event
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Market Metrics Card */}
              <Card className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Volume</p>
                    <p className="text-xl font-bold">{market.volume}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Liquidity</p>
                    <p className="text-xl font-bold">{market.liquidity}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">End Date</p>
                    <p className="text-xl font-bold">{new Date(market.endDate).toLocaleDateString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
                    <Badge variant={market.status === 'open' ? 'default' : 'secondary'} className="text-sm">
                      {market.status}
                    </Badge>
                  </div>
                </div>
              </Card>
            </div>

            {/* Charts and Outcomes - Single column layout */}
            <div className="space-y-4">
              {market.isMultiOutcome && market.subMarkets ? (
                // Multi-outcome market - show each outcome with its own chart
                market.subMarkets.map((outcome, idx) => {
                  const colorClasses = [
                    'bg-[hsl(var(--chart-orange))]',
                    'bg-[hsl(var(--chart-blue))]',
                    'bg-[hsl(var(--chart-green))]',
                    'bg-[hsl(var(--chart-yellow))]',
                  ];
                  
                  return (
                  <Card key={outcome.id} className="overflow-hidden">
                    {/* Outcome Header */}
                    <div className="p-4 border-b border-border">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="flex items-center gap-3 flex-1">
                          {outcome.image ? (
                            <img 
                              src={outcome.image}
                              alt={outcome.title}
                              className="w-12 h-12 rounded object-cover flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div 
                            className={`w-12 h-12 rounded flex items-center justify-center font-bold text-background ${colorClasses[idx % 4]} ${outcome.image ? 'hidden' : ''}`}
                          >
                            {outcome.title.split(':')[0].slice(0, 3).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-base mb-1">{outcome.title.replace(/\b(yes|no)\s+/gi, '').trim()}</h3>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>{outcome.volume} Vol.</span>
                              {outcome.liquidity && <span>{outcome.liquidity} Liq.</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Price</p>
                          <div className="text-3xl font-bold text-emerald-400">
                            {(typeof outcome.yesPrice === 'number' && outcome.yesPrice > 0) ? `${outcome.yesPrice}¢` : '—'}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="default"
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            onClick={() => {
                              setSelectedSubMarket(outcome);
                              handleTrade(outcome.title, 'yes', outcome.yesPrice || 50);
                            }}
                          >
                            Buy {(typeof outcome.yesPrice === 'number' && outcome.yesPrice > 0) ? `${outcome.yesPrice}¢` : '—'}
                          </Button>
                          <Button 
                            size="default"
                            variant="outline"
                            onClick={() => navigate(`/market/${outcome.id}`, { state: { market: outcome }})}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      </div>
                      
                      {/* Individual Chart */}
                      <>
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
                            marketId={(outcome as any).clobTokenId || (outcome as any).ticker || (outcome as any).id}
                            timeRange={timeRange}
                            provider={market.provider}
                          />
                        </div>
                      </>
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
                        marketId={market.clobTokenId || (market as any).ticker || market.id} 
                        timeRange={timeRange}
                        provider={market.provider}
                      />
                    </div>
                  </Card>
                  
                  <Card className="p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">YES</div>
                        <div className="text-3xl font-bold text-emerald-400">
                          {(typeof (market.yesAsk ?? market.yesPrice) === 'number' && (market.yesAsk ?? market.yesPrice)! > 0) ? `${(market.yesAsk ?? market.yesPrice)}¢` : '—'}
                        </div>
                        <Button 
                          className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          onClick={() => handleTrade(market.title, 'yes', (market.yesAsk ?? market.yesPrice) || 50)}
                        >
                          Buy Yes
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">NO</div>
                        <div className="text-3xl font-bold text-red-400">
                          {(typeof (market.noAsk ?? market.noPrice) === 'number' && (market.noAsk ?? market.noPrice)! > 0 && (market.noAsk ?? market.noPrice)! < 100) ? `${(market.noAsk ?? market.noPrice)}¢` : '—'}
                        </div>
                        <Button 
                          className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30"
                          onClick={() => handleTrade(market.title, 'no', (market.noAsk ?? market.noPrice) || 50)}
                        >
                          Buy No
                        </Button>
                      </div>
                    </div>
                  </Card>
                </>
              )}

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
                    <UserPositionsTab 
                      marketId={marketId || ''} 
                      ticker={market.ticker}
                      provider={market.provider}
                      kalshiCredentials={kalshiCredentials}
                      polymarketCredentials={polymarketCredentials}
                    />
                  </TabsContent>
                  
                  <TabsContent value="trades" className="mt-0">
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">Trade history coming soon</p>
                    </div>
                  </TabsContent>
                </Tabs>
              </Card>
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
                      <span className="text-sm font-medium line-clamp-1">{(selectedSubMarket || market)?.title}</span>
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

      {/* Kalshi Trade Dialog */}
      {market && market.provider === 'kalshi' && (
        <KalshiTradeDialog
          open={kalshiTradeDialogOpen}
          onOpenChange={setKalshiTradeDialogOpen}
          marketTicker={market.ticker || ''}
          marketTitle={market.title}
          currentPrice={currentTrade?.price ?? (market.yesAsk ?? market.yesPrice ?? 50)}
        />
      )}
      
      <Footer />
    </div>
  );
};

export default MarketDetail;
