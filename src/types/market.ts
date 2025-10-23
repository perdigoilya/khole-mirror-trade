export type MarketProvider = 'kalshi' | 'polymarket';

export interface BaseMarket {
  id: string;
  title: string;
  provider: MarketProvider;
  category?: string;
  image?: string;
  yesPrice?: number;
  noPrice?: number;
  volume: string;
  liquidity: string;
  volumeRaw: number;
  liquidityRaw: number;
  endDate?: string;
  status?: string;
}

export interface KalshiMarket extends BaseMarket {
  provider: 'kalshi';
  ticker: string;
  eventTicker: string;
}

export interface PolymarketMarket extends BaseMarket {
  provider: 'polymarket';
  clobTokenId?: string;
  description?: string;
  outcomes?: any;
  outcome_prices?: any;
  isMultiOutcome?: boolean;
  subMarkets?: PolymarketMarket[];
}

export type Market = KalshiMarket | PolymarketMarket;

export interface KalshiEvent {
  eventTicker: string;
  title: string;
  subtitle?: string;
  category: string;
  image?: string;
  markets: KalshiMarket[];
  total_volume?: number;
  total_liquidity?: number;
  market_count?: number;
  endDate?: string;
  status?: string;
}

export interface MarketFilters {
  category: string;
  minVolume: number;
  maxVolume: number;
  minLiquidity: number;
  maxLiquidity: number;
  minPrice: number;
  maxPrice: number;
  status: string;
  timeFilter: string;
  sortBy: string;
}

export interface GroupedMarket {
  id: string;
  title: string;
  provider: MarketProvider;
  category?: string;
  image?: string;
  yesPrice?: number;
  noPrice?: number;
  volume: string;
  liquidity: string;
  volumeRaw: number;
  liquidityRaw: number;
  endDate?: string;
  status?: string;
  isMultiOutcome?: boolean;
  subMarkets?: Market[];
}
