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
      question: "What is FOMO App?",
      answer: "FOMO App is a comprehensive prediction markets platform that aggregates markets from Kalshi and Polymarket. Track real-time odds, manage your portfolio across multiple chains, and never miss trending prediction markets with our curated social feed.",
    },
    {
      question: "How do I connect to Polymarket?",
      answer: "Navigate to the Portfolio page and click 'Connect' under Polymarket. You'll connect your wallet using WalletConnect - simply scan the QR code with your mobile wallet or connect through your browser extension. Your wallet address is stored securely and used to fetch your positions.",
    },
    {
      question: "How do I connect to Kalshi?",
      answer: "Go to the Portfolio page and click 'Connect' under Kalshi. You'll need your Kalshi API credentials (API Key ID and Private Key) from your Kalshi account settings. Your credentials are encrypted and stored securely in our database.",
    },
    {
      question: "Is my data secure?",
      answer: "Yes. For Polymarket, we use WalletConnect which never exposes your private keys - you maintain full control through your wallet. Kalshi credentials are encrypted and stored securely. We never have access to execute trades without your explicit permission.",
    },
    {
      question: "What chains does FOMO App support?",
      answer: "FOMO App supports multiple chains for viewing your portfolio balances: Polygon (where Polymarket operates), Ethereum mainnet, Base, Arbitrum, and Optimism. You can switch between chains to view your native token balances on each network.",
    },
    {
      question: "How does the watchlist work?",
      answer: "Add any market to your watchlist by clicking the bookmark icon. Your watchlist is saved to your account and syncs across devices. Access it anytime from the Watchlist page to track markets you're interested in.",
    },
    {
      question: "Can I use FOMO App on mobile?",
      answer: "Yes! FOMO App is fully responsive and works great on mobile devices. For Polymarket connections, mobile wallet apps make it even easier to connect via WalletConnect.",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      
      <main className="flex-1 pt-10 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="mb-12 text-center">
              <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
              <p className="text-muted-foreground text-lg">
                Everything you need to know about FOMO App
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
