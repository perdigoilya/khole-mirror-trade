import { TrendingUp, TrendingDown, BarChart3, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";

interface PortfolioSummaryProps {
  summary: {
    totalValue: number;
    totalPnl: number;
    totalRealizedPnl: number;
    activePositions: number;
    totalInvested: number;
  };
}

export function PortfolioSummary({ summary }: PortfolioSummaryProps) {
  const pnlPercentage = summary.totalInvested > 0
    ? ((summary.totalPnl / summary.totalInvested) * 100).toFixed(2)
    : '0.00';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Total Value</span>
        </div>
        <p className="text-2xl font-bold">
          ${summary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {summary.totalPnl >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm text-muted-foreground">Total P&L</span>
        </div>
        <p className={`text-2xl font-bold ${summary.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {summary.totalPnl >= 0 ? '+' : ''}${Math.abs(summary.totalPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {pnlPercentage}% return
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Active Positions</span>
        </div>
        <p className="text-2xl font-bold">{summary.activePositions}</p>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Total Invested</span>
        </div>
        <p className="text-2xl font-bold">
          ${summary.totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </Card>
    </div>
  );
}
