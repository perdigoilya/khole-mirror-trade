-- Create table to cache Polymarket market data
CREATE TABLE IF NOT EXISTS public.polymarket_markets (
  id TEXT PRIMARY KEY,
  condition_id TEXT,
  question TEXT NOT NULL,
  description TEXT,
  category TEXT,
  outcomes JSONB,
  outcome_prices JSONB,
  volume NUMERIC,
  liquidity NUMERIC,
  end_date TIMESTAMPTZ,
  image TEXT,
  status TEXT,
  market_data JSONB,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_polymarket_markets_category ON public.polymarket_markets(category);
CREATE INDEX IF NOT EXISTS idx_polymarket_markets_volume ON public.polymarket_markets(volume DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_polymarket_markets_status ON public.polymarket_markets(status);
CREATE INDEX IF NOT EXISTS idx_polymarket_markets_last_updated ON public.polymarket_markets(last_updated DESC);

-- Enable RLS but allow public read access (this is market data, not user data)
ALTER TABLE public.polymarket_markets ENABLE ROW LEVEL SECURITY;

-- Allow public read access to market data
CREATE POLICY "Allow public read access to polymarket markets"
  ON public.polymarket_markets FOR SELECT
  USING (true);

-- Only service role can write (edge functions)
CREATE POLICY "Allow service role to manage polymarket markets"
  ON public.polymarket_markets FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');