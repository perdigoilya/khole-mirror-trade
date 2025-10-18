import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertCircle, Activity, MessageSquare, HelpCircle, X, Languages, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTrading } from "@/contexts/TradingContext";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Tweet {
  id: string;
  text: string;
  author_name: string;
  author_username: string;
  profile_image_url?: string;
  created_at: string;
  category?: string;
  likes_count?: number;
  retweets_count?: number;
}

const Footer = () => {
  const { language, setLanguage, t } = useLanguage();
  const { themeColor, setThemeColor } = useTheme();
  const { user } = useTrading();
  const [systemStatus, setSystemStatus] = useState<'operational' | 'degraded' | 'down'>('operational');
  const [latestTweets, setLatestTweets] = useState<Tweet[]>([]);
  const [isLoadingTweets, setIsLoadingTweets] = useState(false);

  const themeOptions = [
    { id: 'golden', name: 'Golden Yellow', color: 'hsl(45, 91%, 49%)' },
    { id: 'emerald', name: 'Emerald Green', color: 'hsl(160, 85%, 45%)' },
    { id: 'blue', name: 'Ocean Blue', color: 'hsl(217, 91%, 60%)' },
    { id: 'purple', name: 'Royal Purple', color: 'hsl(270, 70%, 60%)' },
    { id: 'red', name: 'Crimson Red', color: 'hsl(0, 84%, 60%)' },
    { id: 'teal', name: 'Teal Cyan', color: 'hsl(180, 75%, 50%)' },
    { id: 'grey', name: 'Light Grey', color: 'hsl(220, 9%, 60%)' },
  ] as const;

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return `${Math.floor(diffInMinutes / 1440)}d`;
  };

  const fetchLatestTweets = async () => {
    setIsLoadingTweets(true);
    try {
      const { data, error } = await supabase
        .from('twitter_feed')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      if (data) setLatestTweets(data);
    } catch (error) {
      console.error('Error fetching tweets:', error);
    } finally {
      setIsLoadingTweets(false);
    }
  };

  useEffect(() => {
    // Subscribe to realtime updates for system monitoring
    const channel = supabase
      .channel('twitter_feed_status')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'twitter_feed'
        },
        () => {
          setSystemStatus('operational');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const StatusIcon = systemStatus === 'operational' 
    ? CheckCircle2 
    : systemStatus === 'degraded' 
    ? AlertCircle 
    : AlertCircle;

  const statusColor = systemStatus === 'operational'
    ? 'text-emerald-500'
    : systemStatus === 'degraded'
    ? 'text-amber-500'
    : 'text-red-500';

  const statusText = systemStatus === 'operational'
    ? t.footer.systemOperational
    : systemStatus === 'degraded'
    ? t.footer.systemDegraded
    : t.footer.systemDown;

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-t border-border">
      <div className="container mx-auto px-6 h-12 flex items-center justify-between">
        {/* Left: System Status */}
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-4 w-4 ${statusColor}`} />
          <span className="text-sm font-medium text-foreground">{statusText}</span>
        </div>

        {/* Middle: Feed Tracker */}
        <Sheet onOpenChange={(open) => { if (open) fetchLatestTweets(); }}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <Activity className="h-4 w-4" />
              <span className="text-sm font-medium">{t.footer.feedTracker}</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[60vh]">
            <SheetHeader>
              <SheetTitle>{t.footer.feedTrackerTitle}</SheetTitle>
              <SheetDescription>
                {t.footer.feedTrackerDesc}
              </SheetDescription>
            </SheetHeader>
            
            <ScrollArea className="h-[calc(60vh-100px)] mt-4">
              {isLoadingTweets ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : latestTweets.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  {t.footer.noActivity}
                </div>
              ) : (
                <div className="space-y-3">
                  {latestTweets.map((tweet) => (
                    <div
                      key={tweet.id}
                      className="p-4 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors"
                    >
                      <div className="flex gap-3">
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarImage src={tweet.profile_image_url} />
                          <AvatarFallback>{tweet.author_username[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{tweet.author_name}</span>
                            <span className="text-xs text-muted-foreground">@{tweet.author_username}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{formatTimestamp(tweet.created_at)}</span>
                            {tweet.category && (
                              <Badge variant="outline" className="ml-auto text-xs">
                                {tweet.category}
                              </Badge>
                            )}
                          </div>
                          
                          <p className="text-sm text-foreground line-clamp-2">{tweet.text}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </SheetContent>
        </Sheet>

        {/* Right: Theme, Language, X Link & Help */}
        <div className="flex items-center gap-3">
          {user && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                >
                  <Palette className="h-4 w-4" />
                  <span className="text-sm font-medium">Theme</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end" side="top">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Choose Theme Color</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      Select your preferred accent color
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {themeOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setThemeColor(option.id)}
                        className={`flex items-center gap-2 p-3 rounded-lg border transition-all hover:border-primary/50 ${
                          themeColor === option.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-card'
                        }`}
                      >
                        <div
                          className="w-6 h-6 rounded-full border-2 border-background shadow-sm"
                          style={{ backgroundColor: option.color }}
                        />
                        <span className="text-xs font-medium">{option.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
            className="gap-2"
          >
            <Languages className="h-4 w-4" />
            <span className="text-sm font-medium">{language === 'en' ? '中文' : 'EN'}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            asChild
            className="gap-2"
          >
            <a
              href="https://x.com/FOMOAPPbet"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
            >
              <X className="h-4 w-4" />
              <span className="text-sm font-medium">X(twitter)</span>
            </a>
          </Button>

          <Button variant="outline" size="sm" asChild>
            <Link to="/faq" className="gap-2">
              <HelpCircle className="h-4 w-4" />
              <span className="text-sm">{t.footer.helpSupport}</span>
            </Link>
          </Button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
