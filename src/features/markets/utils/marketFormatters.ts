/**
 * Format volume/liquidity numbers into readable strings
 */
export function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * Format date to readable string
 */
export function formatEndDate(dateString?: string): string {
  if (!dateString || dateString === 'TBD') return 'TBD';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays < 0) return 'Ended';
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Tomorrow';
    if (diffInDays < 7) return `${diffInDays}d`;
    if (diffInDays < 30) return `${Math.ceil(diffInDays / 7)}w`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'TBD';
  }
}

/**
 * Get trend direction from price
 */
export function getTrend(yesPrice?: number): 'up' | 'down' | 'neutral' {
  if (!yesPrice) return 'neutral';
  if (yesPrice > 55) return 'up';
  if (yesPrice < 45) return 'down';
  return 'neutral';
}
