import { Link } from "react-router-dom";
import { ArrowRight, Zap, BarChart3, Shield, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import nameLogo from "@/assets/name-logo.png";

const Index = () => {
  const features = [
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Real-time WebSocket feeds. Sub-second updates. Professional-grade performance.",
    },
    {
      icon: BarChart3,
      title: "Professional Interface",
      description: "Clean, focused design. Advanced charting. Intuitive portfolio management.",
    },
    {
      icon: Shield,
      title: "Secure & Private",
      description: "Direct Kalshi API integration. Local-only storage. Your keys never leave your device.",
    },
  ];

  return (
    <div className="h-screen bg-background overflow-hidden flex flex-col">
      <Navigation />
      
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        {/* Hero Section */}
        <section className="container mx-auto text-center">
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex items-center justify-center space-x-4">
              <img src={nameLogo} alt="FOMO APP" className="h-28 md:h-40 w-auto" />
              <Badge 
                variant="outline" 
                className="border-primary text-primary text-sm px-3 py-1 font-display"
              >
                ALPHA
              </Badge>
            </div>

            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              The professional terminal for prediction market trading. Built for speed. Designed for traders.
            </p>

            <div className="inline-flex items-center space-x-2 px-5 py-3 rounded-md border border-primary/30 bg-primary/5">
              <span className="text-base text-foreground font-medium">$KHOLE now live on Pump.fun</span>
              <ExternalLink className="h-5 w-5 text-primary" />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button 
                asChild
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-display text-lg px-8 py-6 group"
              >
                <Link to="/markets">
                  Start Trading
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              
              <Button 
                asChild
                size="lg"
                variant="outline"
                className="border-border hover:bg-muted font-display text-lg px-8 py-6"
              >
                <Link to="/portfolio">
                  View Portfolio
                </Link>
              </Button>
            </div>

            {/* Features Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto pt-6">
              {features.map((feature, index) => (
                <div 
                  key={index}
                  className="group p-6 rounded-lg border border-border bg-card hover:border-primary/50 transition-all duration-300"
                >
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <feature.icon className="h-7 w-7" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-2 text-foreground">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
