import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import Footer from "@/components/Footer";
import kalshiSportsImg from "@/assets/kalshi-sports.png";
import kalshiPoliticsImg from "@/assets/kalshi-politics.png";
import kalshiEconomicsImg from "@/assets/kalshi-economics.png";
import kalshiWeatherImg from "@/assets/kalshi-weather.png";
import kalshiGeneralImg from "@/assets/kalshi-general.png";

// Utility function to get category image for Kalshi markets
const getKalshiCategoryImage = (category: string): string => {
  const categoryLower = category.toLowerCase();
  if (categoryLower.includes('sport') || categoryLower.includes('football') || categoryLower.includes('basketball') || categoryLower.includes('baseball')) {
    return kalshiSportsImg;
  } else if (categoryLower.includes('polit') || categoryLower.includes('election') || categoryLower.includes('government')) {
    return kalshiPoliticsImg;
  } else if (categoryLower.includes('econom') || categoryLower.includes('market') || categoryLower.includes('stock') || categoryLower.includes('financ')) {
    return kalshiEconomicsImg;
  } else if (categoryLower.includes('weather') || categoryLower.includes('climate') || categoryLower.includes('temperature')) {
    return kalshiWeatherImg;
  }
  return kalshiGeneralImg;
};

interface Market {
  ticker: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  volume: string;
  liquidity: string;
  volumeRaw: number;
  liquidityRaw: number;
  category: string;
  image: string;
}

interface EventDetail {
  eventTicker: string;
  title: string;
  subtitle?: string;
  category: string;
  markets: Market[];
  totalVolume: string;
  totalLiquidity: string;
}

export default function KalshiEventDetail() {
  const { eventTicker } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventDetail | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Fetch all markets for this event
        const { data, error } = await supabase.functions.invoke('kalshi-markets', { 
          body: { event_ticker: eventTicker } 
        });
        
        if (error) throw error;
        
        const markets: Market[] = (data?.markets || [])
          .filter((m: any) => m.eventTicker === eventTicker)
          .map((m: any) => {
            const category = m.category || 'General';
            return {
              ticker: m.ticker || m.id,
              title: m.title,
              yesPrice: m.yesPrice || 50,
              noPrice: m.noPrice || 50,
              volume: m.volume,
              liquidity: m.liquidity,
              volumeRaw: m.volumeRaw || 0,
              liquidityRaw: m.liquidityRaw || 0,
              category,
              image: getKalshiCategoryImage(category),
            };
          })
          .sort((a: Market, b: Market) => b.volumeRaw - a.volumeRaw);

        if (markets.length > 0) {
          const totalVol = markets.reduce((sum, m) => sum + m.volumeRaw, 0);
          const totalLiq = markets.reduce((sum, m) => sum + m.liquidityRaw, 0);
          
          setEvent({
            eventTicker: eventTicker || '',
            title: markets[0].title.split(/will|wins|gets/i)[0]?.trim() || eventTicker || 'Event',
            category: markets[0].category || 'General',
            markets,
            totalVolume: totalVol > 0 ? `${totalVol.toLocaleString()} contracts` : '$0',
            totalLiquidity: totalLiq > 0 ? `$${totalLiq.toLocaleString()}` : '$0',
          });
        }
      } catch (e) {
        console.error('KalshiEventDetail load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [eventTicker]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-14">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading event markets...</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-14">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Event not found</h2>
          <Button onClick={() => navigate('/markets')}>Back to Markets</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      <main className="flex-1 pt-6 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-[1200px] mx-auto">
            {/* Header */}
            <div className="mb-6">
              <Button
                variant="ghost"
                onClick={() => navigate('/markets')}
                className="gap-2 mb-4"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Markets
              </Button>
              
              <div className="flex items-center gap-3 mb-2">
                <Badge variant="outline" className="bg-kalshi-teal/20 text-kalshi-teal border-kalshi-teal/30 text-xs">
                  Kalshi Event
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {event.category}
                </Badge>
              </div>
              
              <h1 className="text-3xl font-bold mb-2">{event.title}</h1>
              {event.subtitle && (
                <p className="text-muted-foreground mb-4">{event.subtitle}</p>
              )}
              
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Volume: </span>
                  <span className="font-semibold">{event.totalVolume}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Liquidity: </span>
                  <span className="font-semibold">{event.totalLiquidity}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Markets: </span>
                  <span className="font-semibold">{event.markets.length}</span>
                </div>
              </div>
            </div>

            {/* Markets List */}
            <div className="space-y-3">
              {event.markets.map((market) => (
                <Card 
                  key={market.ticker} 
                  className="p-4 hover:bg-card/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/market/${market.ticker}`, { 
                    state: { 
                      market: {
                        ...market,
                        id: market.ticker,
                        provider: 'kalshi',
                        eventTicker: event.eventTicker,
                        category: market.category,
                        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                        status: 'Active',
                        clobTokenId: market.ticker,
                      }
                    }
                  })}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <img 
                        src={market.image} 
                        alt={market.category}
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base mb-1 line-clamp-2">
                          {market.title}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{market.volume} Vol.</span>
                          <span>{market.liquidity} Liq.</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-1">YES</div>
                        <div className="text-2xl font-bold text-emerald-400">
                          {market.yesPrice}¢
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground mb-1">NO</div>
                        <div className="text-2xl font-bold text-red-400">
                          {market.noPrice}¢
                        </div>
                      </div>
                      <Button size="sm">
                        Trade
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
