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
    let orderbookData: any = null;
    let lastError = '';
    for (const base of baseUrls) {
      const url = `${base}/trade-api/v2/markets/${ticker}`;
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (resp.ok) {
        marketData = await resp.json();
        
        // Fetch real-time orderbook
        const obUrl = `${base}/trade-api/v2/markets/${ticker}/orderbook`;
        const obResp = await fetch(obUrl, { headers: { 'Accept': 'application/json' } });
        if (obResp.ok) {
          orderbookData = await obResp.json();
        }
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

    // Get real-time prices from orderbook
    let yesAsk: number | null = null;
    let yesBid: number | null = null;
    let noAsk: number | null = null;
    let noBid: number | null = null;

    if (orderbookData?.orderbook) {
      const ob = orderbookData.orderbook;
      // Best YES bid is the highest price in the YES array (last element)
      if (ob.yes && ob.yes.length > 0) {
        yesBid = ob.yes[ob.yes.length - 1][0];
      }
      // Best NO bid is the highest price in the NO array (last element)
      if (ob.no && ob.no.length > 0) {
        noBid = ob.no[ob.no.length - 1][0];
      }
      // YES ask = 100 - NO bid (because buying YES at X = selling NO at 100-X)
      if (noBid !== null) {
        yesAsk = 100 - noBid;
      }
      // NO ask = 100 - YES bid
      if (yesBid !== null) {
        noAsk = 100 - yesBid;
      }
    }

    // Fallback to market data if orderbook is empty
    if (yesAsk === null) yesAsk = toCents(m.yes_ask, m.yes_ask_dollars);
    if (yesBid === null) yesBid = toCents(m.yes_bid, m.yes_bid_dollars);
    if (noAsk === null) noAsk = toCents((m as any).no_ask, (m as any).no_ask_dollars) ?? (yesBid !== null ? 100 - yesBid : null);
    if (noBid === null) noBid = toCents((m as any).no_bid, (m as any).no_bid_dollars) ?? (yesAsk !== null ? 100 - yesAsk : null);

    // Calculate mid-market price for display
    const lastPrice = toCents(m.last_price, m.last_price_dollars);
    let yesPrice: number;
    if (yesAsk !== null && yesBid !== null) {
      yesPrice = Math.round((yesAsk + yesBid) / 2);
    } else if (lastPrice !== null) {
      yesPrice = lastPrice;
    } else if (yesAsk !== null) {
      yesPrice = yesAsk;
    } else if (yesBid !== null) {
      yesPrice = yesBid;
    } else {
      yesPrice = 50;
    }

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
      // Mid price derived earlier
      yesPrice,
      noPrice: 100 - yesPrice,
      // Explicit orderbook levels for accurate display/trading
      yesAsk: yesAsk ?? null,
      yesBid: yesBid ?? null,
      noAsk: noAsk ?? null,
      noBid: noBid ?? null,
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
