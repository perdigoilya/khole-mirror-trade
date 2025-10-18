import { useEffect, useState, useRef, memo } from "react";
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
  provider?: 'kalshi' | 'polymarket';
  minimal?: boolean;
}

export const MarketChart = memo(({ marketId, timeRange, provider = 'polymarket', minimal = false }: MarketChartProps) => {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Cache for price history data
  const cacheRef = useRef<Map<string, { data: ChartData[], timestamp: number }>>(new Map());
  const CACHE_DURATION = 60000; // 60 seconds

  useEffect(() => {
    const fetchPriceHistory = async () => {
      const cacheKey = `${marketId}-${timeRange}-${provider}`;
      
      // Check cache first
      const cached = cacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setData(cached.data);
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setError(null);
      try {
        const functionName = provider === 'kalshi' ? 'kalshi-price-history' : 'polymarket-price-history';
        
        const { data: result, error: fetchError } = await supabase.functions.invoke(
          functionName,
          {
            body: { marketId, timeRange }
          }
        );

        if (fetchError) throw fetchError;
        
        if (result?.data && result.data.length > 0) {
          // Cache the result
          cacheRef.current.set(cacheKey, {
            data: result.data,
            timestamp: Date.now()
          });
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
  }, [marketId, timeRange, provider]);

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
      {/* Logo Watermark - only show if not minimal */}
      {!minimal && (
        <img 
          src={fomoLogo}
          alt=""
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0 select-none"
          style={{ width: '140px', height: 'auto', opacity: 1, filter: 'invert(1)' }}
        />
      )}
      
      {/* Chart */}
      <div className="relative z-10 w-full h-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={minimal ? { top: 5, right: 5, left: 5, bottom: 5 } : { top: 10, right: 30, left: 10, bottom: 10 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-orange))" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(var(--chart-orange))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="0" 
              stroke="hsl(var(--border))" 
              opacity={minimal ? 0.05 : 0.1}
              horizontal={true}
              vertical={false}
            />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatXAxis}
              stroke="hsl(var(--muted-foreground))"
              tick={false}
              axisLine={false}
              tickLine={false}
              height={0}
            />
            <YAxis 
              domain={[0, 100]}
              stroke="hsl(var(--muted-foreground))"
              tick={minimal ? false : { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => `${value}%`}
              axisLine={false}
              tickLine={false}
              width={minimal ? 0 : 45}
            />
            {!minimal && <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }} />}
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke="hsl(var(--chart-green))" 
              strokeWidth={minimal ? 1 : 1.5}
              dot={false}
              activeDot={minimal ? false : { 
                r: 4, 
                fill: "hsl(var(--chart-green))",
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
});
