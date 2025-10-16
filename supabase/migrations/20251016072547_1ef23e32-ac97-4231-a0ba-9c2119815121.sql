-- Add API credential fields to user_polymarket_credentials table
ALTER TABLE public.user_polymarket_credentials 
ADD COLUMN IF NOT EXISTS api_credentials_key TEXT,
ADD COLUMN IF NOT EXISTS api_credentials_secret TEXT,
ADD COLUMN IF NOT EXISTS api_credentials_passphrase TEXT;