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
      question: "What is FOMO APP?",
      answer: "FOMO APP is a unified prediction market trading platform that connects you to multiple markets including Polymarket and Kalshi. Trade on real-world events, politics, sports, and more from one convenient interface.",
    },
    {
      question: "How do I get started?",
      answer: "Simply connect your wallet or create an account, then link your Polymarket or Kalshi credentials. You'll have instant access to thousands of prediction markets across multiple platforms.",
    },
    {
      question: "What markets can I trade?",
      answer: "Trade on a wide variety of prediction markets including politics, economics, sports, weather, and current events. Both Polymarket and Kalshi offer unique markets with real money trading.",
    },
    {
      question: "Is my data secure?",
      answer: "Yes, we take security seriously. Your credentials are encrypted and stored securely. We never have access to your private keys or passwords.",
    },
    {
      question: "What are the fees?",
      answer: "FOMO APP itself is free to use. You'll only pay the standard fees charged by the underlying platforms (Polymarket and Kalshi) when you execute trades.",
    },
    {
      question: "Can I use FOMO APP on mobile?",
      answer: "Yes! FOMO APP is fully responsive and works great on mobile devices. Access your markets anywhere, anytime.",
    },
    {
      question: "How do I withdraw my funds?",
      answer: "Withdrawals are processed through the respective platforms (Polymarket or Kalshi). Visit your portfolio and follow the withdrawal instructions for each platform.",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      
      <main className="flex-1 pt-10 pb-24">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto">
            <div className="mb-12 text-center">
              <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
              <p className="text-muted-foreground text-lg">
                Everything you need to know about FOMO APP
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
                We're here to help! Reach out to our support team.
              </p>
              <a
                href="https://x.com/FOMOAPPbet"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-semibold"
              >
                Contact Support
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
