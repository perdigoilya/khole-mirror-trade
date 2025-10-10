import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-border py-4">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-2 md:space-y-0">
          <p className="text-sm text-muted-foreground">
            Built with precision for serious traders
          </p>
          
          <div className="flex items-center space-x-6">
            <Link 
              to="/markets" 
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Markets
            </Link>
            <Link 
              to="/portfolio" 
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Portfolio
            </Link>
            <Link 
              to="/faq" 
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              FAQ
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
