import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker } = await req.json();

    if (!ticker) {
      return new Response(
        JSON.stringify({ error: 'Ticker is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrls = [
      'https://api.elections.kalshi.com',
      'https://api.kalshi.com'
    ];

    // Fetch market detail
    let marketData: any = null;
    let lastError = '';
    for (const base of baseUrls) {
      const url = `${base}/trade-api/v2/markets/${ticker}`;
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (resp.ok) {
        marketData = await resp.json();
        break;
      } else {
        lastError = await resp.text();
      }
    }

    if (!marketData || !marketData.market) {
      return new Response(
        JSON.stringify({ error: 'Market not found', details: lastError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const m = marketData.market;

    const toCents = (num: unknown, dollars: unknown): number | null => {
      if (typeof num === 'number' && !isNaN(num)) return Math.round(num);
      if (typeof dollars === 'string') {
        const f = parseFloat(dollars);
        if (!isNaN(f)) return Math.round(f * 100);
      }
      return null;
    };

    // Price derivation
    const lastPrice = toCents(m.last_price, m.last_price_dollars);
    const yesAsk = toCents(m.yes_ask, m.yes_ask_dollars);
    const yesBid = toCents(m.yes_bid, m.yes_bid_dollars);

    let yesPrice = lastPrice;
    if (yesPrice === null && yesAsk !== null && yesBid !== null) yesPrice = Math.round((yesAsk + yesBid) / 2);
    if (yesPrice === null && yesAsk !== null) yesPrice = yesAsk;
    if (yesPrice === null && yesBid !== null) yesPrice = yesBid;
    if (yesPrice === null) yesPrice = 50;

    const volume24h = typeof m.volume_24h === 'number' ? m.volume_24h : (typeof m.volume === 'number' ? m.volume : 0);
    const liquidityDollars = m.liquidity_dollars ? parseFloat(m.liquidity_dollars) : 0;

    // Build rules description
    const rules_primary = m.rules_primary || '';
    const rules_secondary = m.rules_secondary || '';
    const rules = [rules_primary, rules_secondary].filter(Boolean).join('\n\n');

    // Fetch event metadata (image)
    let image: string | null = null;
    for (const base of baseUrls) {
      const metaUrl = `${base}/trade-api/v2/events/${m.event_ticker}/metadata`;
      const metaResp = await fetch(metaUrl, { headers: { 'Accept': 'application/json' } });
      if (metaResp.ok) {
        const md = await metaResp.json();
        image = md?.image_url || null;
        break;
      }
    }

    const normalized = {
      id: m.ticker,
      ticker: m.ticker,
      eventTicker: m.event_ticker,
      title: m.title,
      subtitle: m.subtitle,
      description: rules || (m.subtitle || m.title),
      rules,
      rules_primary,
      rules_secondary,
      yesPrice,
      noPrice: 100 - yesPrice,
      volume: volume24h > 0 ? `${volume24h.toLocaleString('en-US')} contracts` : '$0',
      liquidity: liquidityDollars > 0 ? `$${liquidityDollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
      volumeRaw: volume24h,
      liquidityRaw: liquidityDollars,
      endDate: m.close_time || m.expiration_time,
      status: m.status || 'open',
      category: m.category || 'General',
      provider: 'kalshi' as const,
      image,
      clobTokenId: m.ticker,
    };

    return new Response(
      JSON.stringify({ market: normalized }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
