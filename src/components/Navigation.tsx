import { Link, useLocation } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    { path: "/markets", label: "Markets" },
    { path: "/feed", label: "Feed" },
    { path: "/watchlist", label: "Watchlist" },
    { path: "/portfolio", label: "Portfolio" },
    { path: "/faq", label: "FAQ" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between gap-4">
          {/* Left: Logo + Nav Links */}
          <div className="flex items-center space-x-6">
            <Link to="/" className="flex items-center">
              <img src={logo} alt="khole" className="h-8 w-auto" />
            </Link>
            
            <div className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive(item.path)
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Center: Search Bar */}
          <div className="flex-1 max-w-md hidden lg:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search markets..." 
                className="pl-10 bg-muted/50 border-border"
              />
            </div>
          </div>

          {/* Right: Connect + Login */}
          <div className="flex items-center space-x-2">
            <Button 
              onClick={() => setShowConnectDialog(true)}
              variant={isConnected ? "outline" : "default"}
              className="font-medium text-sm"
            >
              {isConnected ? "Connected" : "Connect Kalshi"}
            </Button>
            <Button variant="outline" className="font-medium text-sm">
              Login
            </Button>
          </div>
        </div>
      </div>
      
      <ConnectKalshiDialog open={showConnectDialog} onOpenChange={setShowConnectDialog} />
    </nav>
  );
};

export default Navigation;
