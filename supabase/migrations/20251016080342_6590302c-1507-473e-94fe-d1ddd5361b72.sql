-- Add funder_address column to user_polymarket_credentials table
ALTER TABLE public.user_polymarket_credentials 
ADD COLUMN IF NOT EXISTS funder_address text;