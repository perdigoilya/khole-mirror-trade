-- Add API key field to Polymarket credentials
ALTER TABLE user_polymarket_credentials 
ADD COLUMN IF NOT EXISTS api_key TEXT;