import Footer from "@/components/Footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useLanguage } from "@/contexts/LanguageContext";

const FAQ = () => {
  const { t } = useLanguage();
  
  const faqs = [
    {
      question: t.faq.question1,
      answer: t.faq.answer1,
    },
    {
      question: t.faq.question2,
      answer: t.faq.answer2,
    },
    {
      question: t.faq.question3,
      answer: t.faq.answer3,
    },
    {
      question: t.faq.question4,
      answer: t.faq.answer4,
    },
    {
      question: t.faq.question5,
      answer: t.faq.answer5,
    },
    {
      question: t.faq.question6,
      answer: t.faq.answer6,
    },
    {
      question: t.faq.question7,
      answer: t.faq.answer7,
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      
      <main className="flex-1 pt-10 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="mb-12 text-center">
              <h1 className="text-4xl font-bold mb-4">{t.faq.title}</h1>
              <p className="text-muted-foreground text-lg">
                {t.faq.subtitle}
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
              <h2 className="text-2xl font-bold mb-2">{t.faq.stillHaveQuestions}</h2>
              <p className="text-muted-foreground mb-4">
                {t.faq.reachOut}
              </p>
              <a
                href="https://x.com/FOMOAPPbet"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-semibold"
              >
                {t.faq.contactSupport}
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
