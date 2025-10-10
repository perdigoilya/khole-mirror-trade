import { Link, useLocation } from "react-router-dom";
import { Home, TrendingUp, Star, PieChart, HelpCircle, Twitter, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { useKalshi } from "@/contexts/KalshiContext";
import { ConnectKalshiDialog } from "@/components/ConnectKalshiDialog";
import { useState } from "react";

const Navigation = () => {
  const location = useLocation();
  const { isConnected } = useKalshi();
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  
  const isActive = (path: string) => location.pathname === path;
  
  const navItems = [
    { path: "/", label: "Home", icon: Home },
    { path: "/markets", label: "Markets", icon: TrendingUp },
    { path: "/watchlist", label: "Watchlist", icon: Star },
    { path: "/portfolio", label: "Portfolio", icon: PieChart },
    { path: "/faq", label: "FAQ", icon: HelpCircle },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <img src={logo} alt="khole" className="h-8 w-auto" />
          </Link>

          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center space-x-2 px-4 py-2 rounded-md text-base font-display tracking-wide transition-colors",
                  isActive(item.path)
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            ))}
            
            <a
              href="https://x.com/tryFOMOapp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-4 py-2 rounded-md text-base font-display tracking-wide text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Twitter className="h-4 w-4" />
              <span>Twitter</span>
            </a>
          </div>

          <Button 
            onClick={() => setShowConnectDialog(true)}
            className={cn(
              "font-display tracking-wide text-base",
              isConnected
                ? "bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50" 
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            )}
          >
            {isConnected ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Connected
              </>
            ) : (
              "Connect to Kalshi"
            )}
          </Button>
        </div>
      </div>
      
      <ConnectKalshiDialog open={showConnectDialog} onOpenChange={setShowConnectDialog} />
    </nav>
  );
};

export default Navigation;
