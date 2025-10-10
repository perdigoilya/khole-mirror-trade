import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { useKalshi } from "@/contexts/KalshiContext";
import { ConnectKalshiDialog } from "@/components/ConnectKalshiDialog";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isConnected, user, credentials } = useKalshi();
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  
  const isActive = (path: string) => location.pathname === path;
  
  // Redirect to auth if trying to access protected pages without login
  useEffect(() => {
    const protectedRoutes = ["/portfolio", "/watchlist"];
    if (protectedRoutes.includes(location.pathname) && !user) {
      navigate("/auth");
    }
  }, [location.pathname, user, navigate]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!searchTerm.trim()) return;
    
    if (!isConnected || !credentials) {
      toast({
        title: "Connect Kalshi",
        description: "Please connect your Kalshi account to search markets",
        variant: "destructive",
      });
      setShowConnectDialog(true);
      return;
    }

    // Navigate to markets page with search term
    navigate(`/markets?search=${encodeURIComponent(searchTerm)}`);
  };
  
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
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search markets..." 
                className="pl-10 bg-muted/50 border-border"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </form>
          </div>

          {/* Right: Connect + Login */}
          <div className="flex items-center space-x-2">
            {user ? (
              <>
                <Button 
                  onClick={() => setShowConnectDialog(true)}
                  variant={isConnected ? "outline" : "default"}
                  className="font-medium text-sm"
                >
                  {isConnected ? "Connected" : "Connect Kalshi"}
                </Button>
                <Button 
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate("/auth");
                  }}
                  variant="outline" 
                  className="font-medium text-sm"
                >
                  Logout
                </Button>
              </>
            ) : (
              <Button 
                onClick={() => navigate("/auth")}
                variant="default" 
                className="font-medium text-sm"
              >
                Login
              </Button>
            )}
          </div>
        </div>
      </div>
      
      <ConnectKalshiDialog open={showConnectDialog} onOpenChange={setShowConnectDialog} />
    </nav>
  );
};

export default Navigation;
