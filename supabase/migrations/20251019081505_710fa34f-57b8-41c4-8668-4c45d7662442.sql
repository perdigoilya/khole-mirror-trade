-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant permissions for cron to use net extension
GRANT USAGE ON SCHEMA net TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO postgres;

-- Create index on kalshi_events for faster queries
CREATE INDEX IF NOT EXISTS idx_kalshi_events_volume ON public.kalshi_events(total_volume DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_kalshi_events_updated ON public.kalshi_events(last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_kalshi_events_category ON public.kalshi_events(category);

-- Schedule the sync job to run every 5 minutes
SELECT cron.schedule(
  'kalshi-sync-job',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://pxzwzayroweafcroouvc.supabase.co/functions/v1/kalshi-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4end6YXlyb3dlYWZjcm9vdXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMjM2MTAsImV4cCI6MjA3NTU5OTYxMH0.TKmW_GSqILBkBX2cs5Wn86sUyRJy_kpOzrSvLcwNTY0"}'::jsonb,
    body:='{"scheduled": true}'::jsonb
  ) as request_id;
  $$
);