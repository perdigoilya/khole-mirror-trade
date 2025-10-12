-- Update user_polymarket_credentials to store wallet address instead of private key
ALTER TABLE public.user_polymarket_credentials 
DROP COLUMN private_key;

ALTER TABLE public.user_polymarket_credentials 
ADD COLUMN wallet_address text NOT NULL;

-- Add comment to clarify this is the connected wallet address
COMMENT ON COLUMN public.user_polymarket_credentials.wallet_address IS 'Connected Polymarket wallet address via WalletConnect';