-- Add missing columns to watchlist table
ALTER TABLE public.watchlist 
  ADD COLUMN IF NOT EXISTS market_id TEXT,
  ADD COLUMN IF NOT EXISTS market_data JSONB;

-- Update the unique constraint to use market_id instead of market_ticker
ALTER TABLE public.watchlist 
  DROP CONSTRAINT IF EXISTS watchlist_user_id_market_ticker_key;

ALTER TABLE public.watchlist 
  ADD CONSTRAINT watchlist_user_id_market_id_key UNIQUE(user_id, market_id);