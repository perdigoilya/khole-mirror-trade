import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { useTrading } from "@/contexts/TradingContext";
import { ConnectKalshiDialog } from "@/components/ConnectKalshiDialog";
import { ConnectPolymarketDialog } from "@/components/ConnectPolymarketDialog";
import { ConnectPlatformDialog } from "@/components/ConnectPlatformDialog";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";

const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isKalshiConnected, isPolymarketConnected, user, kalshiCredentials } = useTrading();
  const [showPlatformDialog, setShowPlatformDialog] = useState(false);
  const [showKalshiDialog, setShowKalshiDialog] = useState(false);
  const [showPolymarketDialog, setShowPolymarketDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    
    if (!isKalshiConnected || !kalshiCredentials) {
      toast({
        title: t.nav.connectKalshi,
        description: t.nav.connectKalshiDesc,
        variant: "destructive",
      });
      setShowPlatformDialog(true);
      return;
    }

    // Navigate to markets page with search term
    navigate(`/markets?search=${encodeURIComponent(searchTerm)}`);
  };
  
  const navItems = [
    { path: "/markets", label: t.nav.markets },
    { path: "/feed", label: t.nav.feed },
    { path: "/watchlist", label: t.nav.watchlist },
    { path: "/portfolio", label: t.nav.portfolio },
    { path: "/faq", label: t.nav.faq },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between gap-2 sm:gap-4">
          {/* Left: Logo */}
          <Link to="/" className="flex items-center flex-shrink-0">
            <img src={logo} alt="FOMO App" className="h-7 sm:h-8 w-auto" />
          </Link>
          
          {/* Desktop Nav Links */}
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

          {/* Desktop Search Bar */}
          <div className="flex-1 max-w-md hidden lg:block">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={t.nav.searchPlaceholder}
                className="pl-10 bg-muted/50 border-border"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </form>
          </div>

          {/* Desktop Auth Buttons */}
          <div className="hidden sm:flex items-center space-x-2">
            {user ? (
              <>
                <Button 
                  onClick={() => setShowPlatformDialog(true)}
                  variant={(isKalshiConnected || isPolymarketConnected) ? "outline" : "default"}
                  className="font-medium text-sm hidden lg:flex"
                >
                  {(isKalshiConnected || isPolymarketConnected) ? t.nav.connected : t.nav.connect}
                </Button>
                <Button 
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate("/auth");
                  }}
                  variant="outline" 
                  className="font-medium text-sm"
                >
                  {t.nav.logout}
                </Button>
              </>
            ) : (
              <Button 
                onClick={() => navigate("/auth")}
                variant="default" 
                className="font-medium text-sm"
              >
                {t.nav.login}
              </Button>
            )}
          </div>

          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="flex-shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] sm:w-[350px]">
              <div className="flex flex-col gap-6 mt-6">
                {/* Mobile Search */}
                <form onSubmit={(e) => {
                  handleSearch(e);
                  setMobileMenuOpen(false);
                }} className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder={t.nav.searchPlaceholder}
                    className="pl-10 bg-muted/50 border-border"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </form>

                {/* Mobile Nav Links */}
                <div className="flex flex-col space-y-1">
                  {navItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "px-4 py-3 rounded-md text-base font-medium transition-colors",
                        isActive(item.path)
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>

                {/* Mobile Auth Buttons */}
                <div className="flex flex-col space-y-2 pt-4 border-t">
                  {user ? (
                    <>
                      <Button 
                        onClick={() => {
                          setShowPlatformDialog(true);
                          setMobileMenuOpen(false);
                        }}
                        variant={(isKalshiConnected || isPolymarketConnected) ? "outline" : "default"}
                        className="w-full font-medium"
                      >
                        {(isKalshiConnected || isPolymarketConnected) ? t.nav.connected : t.nav.connectPlatform}
                      </Button>
                      <Button 
                        onClick={async () => {
                          await supabase.auth.signOut();
                          navigate("/auth");
                          setMobileMenuOpen(false);
                        }}
                        variant="outline" 
                        className="w-full font-medium"
                      >
                        {t.nav.logout}
                      </Button>
                    </>
                  ) : (
                    <Button 
                      onClick={() => {
                        navigate("/auth");
                        setMobileMenuOpen(false);
                      }}
                      variant="default" 
                      className="w-full font-medium"
                    >
                      {t.nav.login}
                    </Button>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      
      <ConnectPlatformDialog 
        open={showPlatformDialog} 
        onOpenChange={setShowPlatformDialog}
        onSelectKalshi={() => setShowKalshiDialog(true)}
        onSelectPolymarket={() => setShowPolymarketDialog(true)}
        isKalshiConnected={isKalshiConnected}
        isPolymarketConnected={isPolymarketConnected}
      />
      <ConnectKalshiDialog open={showKalshiDialog} onOpenChange={setShowKalshiDialog} />
      <ConnectPolymarketDialog open={showPolymarketDialog} onOpenChange={setShowPolymarketDialog} />
    </nav>
  );
};

export default Navigation;
