import { Link } from "react-router-dom";
import { ArrowRight, Zap, BarChart3, Shield, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

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
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="pt-32 pb-20">
        {/* Hero Section */}
        <section className="container mx-auto px-4 text-center">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-center space-x-3">
              <h1 className="text-6xl md:text-8xl font-bold">
                <span className="text-primary">k</span>
                <span className="text-foreground">hole</span>
              </h1>
              <Badge 
                variant="outline" 
                className="border-primary text-primary text-xs px-2 py-1"
              >
                ALPHA
              </Badge>
            </div>

            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              The professional terminal for prediction market trading. Built for speed. Designed for traders.
            </p>

            <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-md border border-primary/30 bg-primary/5">
              <span className="text-sm text-foreground">$KHOLE now live on Pump.fun</span>
              <ExternalLink className="h-4 w-4 text-primary" />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button 
                asChild
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold group"
              >
                <Link to="/markets">
                  Start Trading
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              
              <Button 
                asChild
                size="lg"
                variant="outline"
                className="border-border hover:bg-muted font-semibold"
              >
                <Link to="/portfolio">
                  View Portfolio
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="container mx-auto px-4 mt-32">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="group p-8 rounded-lg border border-border bg-card hover:border-primary/50 transition-all duration-300"
              >
                <div className="flex items-start space-x-4">
                  <div className="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2 text-foreground">
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
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
