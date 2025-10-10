import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ = () => {
  const faqs = [
    {
      question: "What is khole?",
      answer: "khole is a professional terminal for prediction market trading, designed for speed and efficiency. It provides real-time data, advanced charting, and seamless integration with Kalshi.",
    },
    {
      question: "How do I connect to Kalshi?",
      answer: "Click the 'Connect to Kalshi' button in the navigation bar. You'll need your Kalshi API credentials. Your keys are stored locally and never leave your device.",
    },
    {
      question: "Is my data secure?",
      answer: "Yes. khole uses local-only storage. All your API keys and trading data stay on your device. We never transmit or store your credentials on our servers.",
    },
    {
      question: "What are the system requirements?",
      answer: "khole works on all modern browsers. For the best experience, we recommend using the latest version of Chrome, Firefox, or Safari with a stable internet connection.",
    },
    {
      question: "How fast is the data feed?",
      answer: "khole uses WebSocket connections for real-time data feeds with sub-second latency. You'll see market updates as fast as they happen.",
    },
    {
      question: "Can I use khole on mobile?",
      answer: "Yes! khole is fully responsive and works on mobile devices. However, for the full professional trading experience, we recommend using a desktop or laptop.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="mb-12 text-center">
              <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
              <p className="text-muted-foreground text-lg">
                Everything you need to know about khole
              </p>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="border border-border rounded-lg px-6 bg-card"
                >
                  <AccordionTrigger className="text-left text-lg font-semibold hover:text-primary">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <div className="mt-12 p-8 rounded-lg border border-border bg-card text-center">
              <h2 className="text-2xl font-bold mb-2">Still have questions?</h2>
              <p className="text-muted-foreground mb-4">
                Reach out to us on Twitter or check our documentation
              </p>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-semibold"
              >
                Contact Support →
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FAQ;
