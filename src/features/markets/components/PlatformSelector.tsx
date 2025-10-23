import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import polymarketLogo from "@/assets/polymarket-logo.png";
import kalshiLogo from "@/assets/kalshi-logo.png";

interface PlatformSelectorProps {
  platform: 'kalshi' | 'polymarket';
  onPlatformChange: (platform: 'kalshi' | 'polymarket') => void;
}

export function PlatformSelector({ platform, onPlatformChange }: PlatformSelectorProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      <Button
        variant={platform === 'polymarket' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onPlatformChange('polymarket')}
        className={platform === 'polymarket' ? 'bg-polymarket-purple hover:bg-polymarket-purple/90' : ''}
      >
        <img src={polymarketLogo} alt="Polymarket" className="h-4 w-4 mr-2 rounded" />
        Polymarket
        <Badge variant="secondary" className="ml-2">Beta</Badge>
      </Button>
      <Button
        variant={platform === 'kalshi' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onPlatformChange('kalshi')}
        className={platform === 'kalshi' ? 'bg-kalshi-teal hover:bg-kalshi-teal/90' : ''}
      >
        <img src={kalshiLogo} alt="Kalshi" className="h-4 w-4 mr-2 rounded" />
        Kalshi
      </Button>
    </div>
  );
}
