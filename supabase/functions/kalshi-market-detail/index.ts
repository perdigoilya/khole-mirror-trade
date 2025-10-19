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

      console.log(`[kalshi-market-detail] incoming request ticker=${ticker}`);

      if (!ticker) {
        return new Response(
          JSON.stringify({ error: 'Ticker is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

    const baseUrls = [
      'https://api.elections.kalshi.com',
      'https://demo-api.kalshi.co',
      'https://api.kalshi.com'
    ];

    // Fetch market detail
    let marketData: any = null;
    let orderbookData: any = null;
    let lastError = '';
    let usedBase: string | null = null;
    for (const base of baseUrls) {
      const tEnc = encodeURIComponent(ticker);
      const url = `${base}/trade-api/v2/markets/${tEnc}`;
      try {
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (resp.ok) {
          marketData = await resp.json();
          usedBase = base;

          // Fetch real-time orderbook from the same base
          const obUrl = `${base}/trade-api/v2/markets/${tEnc}/orderbook`;
          try {
            const obResp = await fetch(obUrl, { headers: { 'Accept': 'application/json' } });
            if (obResp.ok) {
              orderbookData = await obResp.json();
            } else {
              lastError = `orderbook ${obResp.status} ${await obResp.text()}`;
            }
          } catch (e) {
            lastError = e instanceof Error ? e.message : 'Unknown orderbook error';
          }
          break;
        } else {
          lastError = `${resp.status} ${await resp.text()}`;
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'Network error';
      }
    }

    const marketObj = marketData?.market ?? marketData;
    if (!marketObj || typeof marketObj !== 'object' || !('ticker' in marketObj)) {
      try { console.log(`[kalshi-market-detail] market not found for ${ticker}. lastError=${lastError} base=${usedBase}`); } catch {}
      return new Response(
        JSON.stringify({ error: 'Market not found', details: lastError, baseTried: usedBase }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const m = (marketData?.market ?? marketData) as any;

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

    const bestBid = (levels?: unknown[], levelsDollars?: unknown[]): number | null => {
      let best: number | null = null;
      if (Array.isArray(levels)) {
        for (const lvl of levels as any[]) {
          const price = typeof lvl?.[0] === 'number' ? lvl[0] : null;
          if (price !== null) best = best === null ? price : Math.max(best, price);
        }
      }
      if (best === null && Array.isArray(levelsDollars)) {
        for (const lvl of levelsDollars as any[]) {
          const str = typeof lvl?.[0] === 'string' ? lvl[0] : null;
          if (str) {
            const f = parseFloat(str);
            if (!isNaN(f)) {
              const cents = Math.round(f * 100);
              best = best === null ? cents : Math.max(best, cents);
            }
          }
        }
      }
      return best;
    };

    if (orderbookData?.orderbook) {
      const ob = orderbookData.orderbook;
      yesBid = bestBid(ob.yes, ob.yes_dollars);
      noBid = bestBid(ob.no, ob.no_dollars);
      if (typeof noBid === 'number') yesAsk = Math.max(0, Math.min(100, 100 - noBid));
      if (typeof yesBid === 'number') noAsk = Math.max(0, Math.min(100, 100 - yesBid));
    }

    // Debug logging for verification
    try {
      console.log(`[kalshi-market-detail] ticker=${ticker} base=${usedBase} yesBid=${yesBid} yesAsk=${yesAsk} noBid=${noBid} noAsk=${noAsk}`);
    } catch (_) {}


    // Fallback to market data if orderbook is empty
    if (yesAsk === null) yesAsk = toCents(m.yes_ask, m.yes_ask_dollars);
    if (yesBid === null) yesBid = toCents(m.yes_bid, m.yes_bid_dollars);
    if (noAsk === null) noAsk = toCents((m as any).no_ask, (m as any).no_ask_dollars) ?? (yesBid !== null ? 100 - yesBid : null);
    if (noBid === null) noBid = toCents((m as any).no_bid, (m as any).no_bid_dollars) ?? (yesAsk !== null ? 100 - yesAsk : null);

    // Calculate mid-market price for display (favor orderbook if present)
    const lastPrice = toCents(m.last_price, m.last_price_dollars);
    let yesPrice: number;
    if (yesAsk !== null && yesBid !== null) {
      yesPrice = Math.round((yesAsk + yesBid) / 2);
    } else if (yesAsk !== null) {
      yesPrice = yesAsk;
    } else if (yesBid !== null) {
      yesPrice = yesBid;
    } else if (lastPrice !== null) {
      yesPrice = lastPrice;
    } else {
      yesPrice = 50;
    }

    const volume24hContracts = typeof m.volume_24h === 'number' ? m.volume_24h : (typeof m.volume === 'number' ? m.volume : 0);
    const liquidityDollars = m.liquidity_dollars ? parseFloat(m.liquidity_dollars) : 0;

    // Prefer official dollar-based 24h volume if provided; otherwise compute best-effort from recent trades
    let volumeDollars24h = 0;
    const volDollarStr = (m as any).volume_24h_dollars || (m as any).volume_dollars || null;
    if (typeof volDollarStr === 'string') {
      const v = parseFloat(volDollarStr);
      if (!isNaN(v)) volumeDollars24h = v;
    }

    if (volumeDollars24h <= 0) {
      try {
        const nowTs = Math.floor(Date.now() / 1000);
        const minTs = nowTs - 24 * 3600;
        for (const base of baseUrls) {
          const tradesUrl = `${base}/trade-api/v2/markets/trades?ticker=${encodeURIComponent(m.ticker)}&min_ts=${minTs}&limit=1000`;
          const tResp = await fetch(tradesUrl, { headers: { 'Accept': 'application/json' } });
          if (tResp.ok) {
            const t = await tResp.json();
            const trades = Array.isArray(t?.trades) ? t.trades : [];
            for (const tr of trades) {
              const priceStr = typeof tr?.yes_price_dollars === 'string' ? tr.yes_price_dollars : (typeof tr?.no_price_dollars === 'string' ? tr.no_price_dollars : null);
              const count = typeof tr?.count === 'number' ? tr.count : 0;
              if (priceStr && count > 0) {
                const p = parseFloat(priceStr);
                if (!isNaN(p)) volumeDollars24h += p * count;
              }
            }
            break;
          }
        }
      } catch (_) {
        // Ignore failures and fall back gracefully
      }
    }

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
      // Prefer dollar-based metrics for display consistency with Kalshi UI
      volume: volumeDollars24h > 0 ? `$${Math.round(volumeDollars24h).toLocaleString('en-US')}` : `${volume24hContracts.toLocaleString('en-US')} contracts`,
      liquidity: liquidityDollars > 0 ? `$${liquidityDollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
      volumeRaw: volumeDollars24h > 0 ? volumeDollars24h : volume24hContracts,
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
