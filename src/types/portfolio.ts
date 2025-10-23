export interface Position {
  title: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  curPrice: number;
  slug: string;
  icon?: string;
  pendingCount?: number;
  pendingPrice?: number;
  pendingSide?: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalPnl: number;
  totalRealizedPnl: number;
  activePositions: number;
  totalInvested: number;
}

export interface PortfolioData {
  positions: Position[];
  summary: PortfolioSummary;
  balance?: number;
}

export type PositionStatus = 'open' | 'closed' | 'failed';
