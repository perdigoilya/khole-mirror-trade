import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Market {
  id: string;
  title: string;
  description?: string;
  volume: string;
  liquidity: string;
  endDate: string;
  status: string;
  category: string;
  provider: 'kalshi' | 'polymarket';
  eventTicker?: string;
}

export default function KalshiEvent() {
  const { eventTicker } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [markets, setMarkets] = useState<Market[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('kalshi-markets', { body: {} });
        if (error) throw error;
        const all: Market[] = data?.markets || [];
        const filtered = all.filter(m => m.eventTicker === eventTicker);
        setMarkets(filtered);
      } catch (e) {
        console.error('KalshiEvent load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [eventTicker]);

  const eventTitle = useMemo(() => {
    if (markets.length === 0) return eventTicker || 'Kalshi Event';
    const first = markets[0].title || '';
    const cleaned = first.replace(/\b(yes|no)\s+/gi, '').trim();
    const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
    return parts[0] || eventTicker || 'Kalshi Event';
  }, [markets, eventTicker]);

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

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      <main className="flex-1 pt-6 pb-24">
        <div className="container mx-auto">
          <div className="max-w-[1200px] mx-auto">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <Badge variant="outline" className="text-xs">Kalshi</Badge>
                <Badge variant="outline" className="text-xs">Event</Badge>
              </div>
              <h1 className="text-3xl font-bold mb-2">{eventTitle}</h1>
              <p className="text-sm text-muted-foreground">
                {markets.length} market{markets.length === 1 ? '' : 's'} in this event
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {markets.map((m) => {
                const cleaned = (m.title || '').replace(/\b(yes|no)\s+/gi, '').trim();
                const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
                const primary = parts[0] || cleaned;
                const rest = parts.slice(1);
                return (
                  <Card key={m.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-base mb-2">{primary}</h3>
                        {rest.length > 0 && (
                          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                            {rest.slice(0, 6).map((r, idx) => (
                              <li key={idx}>{r}</li>
                            ))}
                            {rest.length > 6 && (
                              <li className="italic">+{rest.length - 6} more</li>
                            )}
                          </ul>
                        )}
                      </div>
                      <div className="text-right w-40 shrink-0">
                        <div className="text-xs text-muted-foreground">Volume</div>
                        <div className="font-medium">{m.volume}</div>
                        <div className="mt-2 text-xs text-muted-foreground">Liquidity</div>
                        <div className="font-medium">{m.liquidity}</div>
                        <div className="mt-4">
                          <Button size="sm" onClick={() => navigate(`/market/${m.id}`, { state: { market: m } })}>
                            View market
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
