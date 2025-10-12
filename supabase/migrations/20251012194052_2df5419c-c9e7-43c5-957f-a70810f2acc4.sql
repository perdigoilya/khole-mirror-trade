-- Update user_polymarket_credentials table to use private_key instead of api_key
ALTER TABLE public.user_polymarket_credentials 
RENAME COLUMN api_key TO private_key;

-- Add comment to clarify this is the wallet private key
COMMENT ON COLUMN public.user_polymarket_credentials.private_key IS 'Polymarket wallet private key for L1 authentication';