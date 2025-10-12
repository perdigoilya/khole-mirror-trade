import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import fomoLogo from "@/assets/fomo-logo.png";

interface ChartData {
  timestamp: number;
  date: string;
  price: number;
}

interface MarketChartProps {
  marketId: string;
  timeRange: '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';
}

export const MarketChart = ({ marketId, timeRange }: MarketChartProps) => {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Normalize incoming marketId into a numeric CLOB token id if possible
  const normalizeTokenId = (id: string): string | null => {
    if (!id) return null;
    // If already numeric
    if (/^[0-9]+$/.test(id)) return id;
    // Try JSON parse (sometimes arrives like ["12345", "67890"]) or "12345"
    try {
      const parsed = JSON.parse(id);
      if (Array.isArray(parsed) && parsed.length && /^[0-9]+$/.test(String(parsed[0]))) {
        return String(parsed[0]);
      }
      if (typeof parsed === 'string' && /^[0-9]+$/.test(parsed)) {
        return parsed;
      }
    } catch {
      // ignore parse errors
    }
    // Fallback: pick the first long run of digits
    const match = id.match(/\d{6,}/);
    return match ? match[0] : null;
  };

  useEffect(() => {
    const fetchPriceHistory = async () => {
      setLoading(true);
      setError(null);

      const tokenId = normalizeTokenId(marketId);
      if (!tokenId) {
        setError("No price data available");
        setLoading(false);
        return;
      }

      try {
        const { data: result, error: fetchError } = await supabase.functions.invoke(
          'polymarket-price-history',
          {
            body: { marketId: tokenId, timeRange }
          }
        );

        if (fetchError) throw fetchError;
        
        if (result?.data && result.data.length > 0) {
          setData(result.data);
        } else {
          setError("No price data available");
        }
      } catch (err) {
        console.error('Error fetching price history:', err);
        setError("Failed to load chart data");
      } finally {
        setLoading(false);
      }
    };

    if (marketId) {
      fetchPriceHistory();
    }
  }, [marketId, timeRange]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No price history available for this market yet
        </p>
      </div>
    );
  }

  const formatXAxis = (timestamp: number) => {
    const date = new Date(timestamp);
    if (timeRange === '1H' || timeRange === '6H') {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (timeRange === '1D' || timeRange === '1W') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-xl">
          <p className="text-base font-bold text-foreground">{payload[0].value}¢</p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(payload[0].payload.timestamp).toLocaleString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </p>
        </div>
      );
    }
    return null;
  };

  // Get the latest price for display
  const latestPrice = data[data.length - 1]?.price || 0;

  return (
    <div className="relative w-full h-full">
      {/* Logo Watermark */}
      <div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"
        style={{ 
          backgroundImage: `url(${fomoLogo})`,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '120px',
          opacity: 1
        }}
      />
      
      {/* Chart */}
      <div className="relative z-10 w-full h-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-orange))" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(var(--chart-orange))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="0" 
              stroke="hsl(var(--border))" 
              opacity={0.1}
              horizontal={true}
              vertical={false}
            />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatXAxis}
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
              tickLine={false}
            />
            <YAxis 
              domain={[0, 100]}
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => `${value}%`}
              axisLine={false}
              tickLine={false}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }} />
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke="hsl(var(--chart-orange))" 
              strokeWidth={2.5}
              dot={false}
              activeDot={{ 
                r: 5, 
                fill: "hsl(var(--chart-orange))",
                stroke: "hsl(var(--background))",
                strokeWidth: 2
              }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
