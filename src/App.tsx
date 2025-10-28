import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TradingProvider } from "@/contexts/TradingContext";
import { Web3Provider } from "@/contexts/Web3Provider";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Navigation from "@/components/Navigation";
import Index from "./pages/Index";
import Markets from "./pages/Markets";
import Feed from "./pages/Feed";
import Portfolio from "./pages/Portfolio";
import Watchlist from "./pages/Watchlist";
import FAQ from "./pages/FAQ";
import Auth from "./pages/Auth";
import MarketDetail from "./pages/MarketDetail";
import KalshiEvent from "./pages/KalshiEvent";
import KalshiEventDetail from "./pages/KalshiEventDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // Data is fresh for 30 seconds
      gcTime: 5 * 60 * 1000, // Keep unused data in cache for 5 minutes
      refetchOnWindowFocus: false, // Don't refetch on window focus
      refetchOnMount: true, // Always refetch in background on mount
      retry: 1, // Retry failed requests once
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <Web3Provider>
        <TradingProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Navigation />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/markets" element={<Markets />} />
                <Route path="/feed" element={<Feed />} />
                <Route path="/market/:marketId" element={<MarketDetail />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/faq" element={<FAQ />} />
                <Route path="/kalshi/event/:eventTicker" element={<KalshiEventDetail />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </TradingProvider>
      </Web3Provider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
