import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

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

  useEffect(() => {
    const fetchPriceHistory = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const { data: result, error: fetchError } = await supabase.functions.invoke(
          'polymarket-price-history',
          {
            body: { marketId, timeRange }
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

  if (error || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {error || "No price data available"}
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
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-semibold">{payload[0].value}¢</p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(payload[0].payload.timestamp).toLocaleString()}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis 
          dataKey="timestamp" 
          tickFormatter={formatXAxis}
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 12 }}
        />
        <YAxis 
          domain={[0, 100]}
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => `${value}¢`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line 
          type="monotone" 
          dataKey="price" 
          stroke="hsl(var(--primary))" 
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
