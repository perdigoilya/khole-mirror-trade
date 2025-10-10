import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { KalshiProvider } from "@/contexts/KalshiContext";
import Navigation from "@/components/Navigation";
import Index from "./pages/Index";
import Markets from "./pages/Markets";
import Feed from "./pages/Feed";
import Portfolio from "./pages/Portfolio";
import Watchlist from "./pages/Watchlist";
import FAQ from "./pages/FAQ";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <KalshiProvider>
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
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/faq" element={<FAQ />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </KalshiProvider>
  </QueryClientProvider>
);

export default App;
