import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp, DollarSign } from "lucide-react";
import Footer from "@/components/Footer";

import kalshiSportsImg from "@/assets/kalshi-sports.png";
import kalshiPoliticsImg from "@/assets/kalshi-politics.png";
import kalshiEconomicsImg from "@/assets/kalshi-economics.png";
import kalshiWeatherImg from "@/assets/kalshi-weather.png";
import kalshiGeneralImg from "@/assets/kalshi-general.png";

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
  subtitle?: string;
  yesPrice: number;
  noPrice: number;
  volume: string;
  liquidity: string;
  volumeRaw: number;
  liquidityRaw: number;
  category: string;
  endDate: string;
  status: string;
}

interface EventDetail {
  eventTicker: string;
  title: string;
  subtitle?: string;
  description?: string;
  category: string;
  rules: string;
  image?: string | null;
  headlineTicker?: string | null;
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
        const { data, error } = await supabase.functions.invoke('kalshi-event-detail', { 
          body: { eventTicker } 
        });
        
        if (error) throw error;
        
        if (data?.event) {
          setEvent(data.event);
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

  const categoryImage = event.image || getKalshiCategoryImage(event.category);

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      <main className="flex-1 pt-6 pb-24">
        <div className="container mx-auto">
          <div className="max-w-[1400px] mx-auto">
            <Button
              variant="ghost"
              onClick={() => navigate('/markets')}
              className="gap-2 mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Markets
            </Button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Event Info */}
              <div className="lg:col-span-1 space-y-4">
                <Card className="p-6">
                  <img 
                    src={categoryImage} 
                    alt={event.category}
                    className="w-full h-48 object-cover rounded-lg mb-4"
                  />
                  
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="bg-kalshi-teal/20 text-kalshi-teal border-kalshi-teal/30">
                      Kalshi
                    </Badge>
                    <Badge variant="outline">
                      {event.category}
                    </Badge>
                  </div>

                  <h1 className="text-2xl font-bold mb-2">{event.title}</h1>
                  {event.subtitle && (
                    <p className="text-sm text-muted-foreground mb-4">{event.subtitle}</p>
                  )}

                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Volume</span>
                      </div>
                      <span className="font-semibold">{event.totalVolume}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Liquidity</span>
                      </div>
                      <span className="font-semibold">{event.totalLiquidity}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-2">Rules</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {event.rules}
                    </p>
                  </div>
                </Card>
              </div>

              {/* Right Column - Chart + Outcomes */}
              <div className="lg:col-span-2 space-y-4">

                <div className="mb-2">
                  <h2 className="text-xl font-bold mb-1">Available Outcomes</h2>
                  <p className="text-sm text-muted-foreground">
                    Select an outcome to trade • {event.markets.length} options available
                  </p>
                </div>

                <div className="grid gap-3">
                  {event.markets.map((market) => (
                    <Card 
                      key={market.ticker}
                      className="group relative overflow-hidden hover:border-kalshi-teal/50 transition-all cursor-pointer"
                      onClick={() => navigate(`/market/${market.ticker}`, { 
                        state: { 
                          market: {
                            id: market.ticker,
                            title: market.title,
                            subtitle: market.subtitle,
                            description: event.description || market.subtitle || market.title,
                            yesPrice: market.yesPrice,
                            noPrice: market.noPrice,
                            volume: market.volume,
                            liquidity: market.liquidity,
                            volumeRaw: market.volumeRaw,
                            liquidityRaw: market.liquidityRaw,
                            provider: 'kalshi',
                            eventTicker: event.eventTicker,
                            ticker: market.ticker,
                            category: market.category,
                            endDate: market.endDate,
                            status: market.status,
                            clobTokenId: market.ticker,
                            image: categoryImage,
                          }
                        }
                      })}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-base mb-1 group-hover:text-kalshi-teal transition-colors">
                              {market.title}
                            </h3>
                            {market.subtitle && (
                              <p className="text-xs text-muted-foreground line-clamp-1">{market.subtitle}</p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <div className="text-center px-3 py-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                              <div className="text-xs text-muted-foreground mb-0.5">YES</div>
                              <div className="text-xl font-bold text-emerald-400">
                                {market.yesPrice}¢
                              </div>
                            </div>
                            <div className="text-center px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
                              <div className="text-xs text-muted-foreground mb-0.5">NO</div>
                              <div className="text-xl font-bold text-red-400">
                                {market.noPrice}¢
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-4 text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" />
                              {market.volume}
                            </span>
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {market.liquidity}
                            </span>
                          </div>
                          
                          <Button 
                            size="sm" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/market/${market.ticker}`, { 
                                state: { 
                                  market: {
                                    id: market.ticker,
                                    title: market.title,
                                    subtitle: market.subtitle,
                                    description: event.description || market.subtitle || market.title,
                                    yesPrice: market.yesPrice,
                                    noPrice: market.noPrice,
                                    volume: market.volume,
                                    liquidity: market.liquidity,
                                    volumeRaw: market.volumeRaw,
                                    liquidityRaw: market.liquidityRaw,
                                    provider: 'kalshi',
                                    eventTicker: event.eventTicker,
                                    ticker: market.ticker,
                                    category: market.category,
                                    endDate: market.endDate,
                                    status: market.status,
                                    clobTokenId: market.ticker,
                                    image: categoryImage,
                                  }
                                }
                              });
                            }}
                          >
                            Trade
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
