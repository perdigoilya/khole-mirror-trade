-- Create table to cache Kalshi market data
CREATE TABLE IF NOT EXISTS public.kalshi_markets (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL UNIQUE,
  event_ticker TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  category TEXT,
  yes_price INTEGER,
  no_price INTEGER,
  volume_24h_dollars NUMERIC,
  volume_dollars NUMERIC,
  liquidity_dollars NUMERIC,
  close_time TIMESTAMPTZ,
  status TEXT,
  market_data JSONB,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_kalshi_markets_event_ticker ON public.kalshi_markets(event_ticker);
CREATE INDEX IF NOT EXISTS idx_kalshi_markets_category ON public.kalshi_markets(category);
CREATE INDEX IF NOT EXISTS idx_kalshi_markets_volume ON public.kalshi_markets(volume_24h_dollars DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_kalshi_markets_status ON public.kalshi_markets(status);
CREATE INDEX IF NOT EXISTS idx_kalshi_markets_last_updated ON public.kalshi_markets(last_updated DESC);

-- Create table to cache Kalshi event data
CREATE TABLE IF NOT EXISTS public.kalshi_events (
  id TEXT PRIMARY KEY,
  event_ticker TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  category TEXT,
  total_volume NUMERIC,
  total_liquidity NUMERIC,
  market_count INTEGER,
  event_data JSONB,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for events
CREATE INDEX IF NOT EXISTS idx_kalshi_events_category ON public.kalshi_events(category);
CREATE INDEX IF NOT EXISTS idx_kalshi_events_volume ON public.kalshi_events(total_volume DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_kalshi_events_last_updated ON public.kalshi_events(last_updated DESC);

-- Enable RLS but allow public read access (this is market data, not user data)
ALTER TABLE public.kalshi_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kalshi_events ENABLE ROW LEVEL SECURITY;

-- Allow public read access to market data
CREATE POLICY "Allow public read access to kalshi markets"
  ON public.kalshi_markets FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to kalshi events"
  ON public.kalshi_events FOR SELECT
  USING (true);

-- Only service role can write (edge functions)
CREATE POLICY "Allow service role to manage kalshi markets"
  ON public.kalshi_markets FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Allow service role to manage kalshi events"
  ON public.kalshi_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');