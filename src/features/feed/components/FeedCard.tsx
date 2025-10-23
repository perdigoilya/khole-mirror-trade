import { Clock, Heart, Repeat, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface NewsItem {
  id: string;
  tweet_id: string;
  title: string;
  source: string;
  username: string;
  timestamp: string;
  category: string;
  profileImage?: string;
  likes?: number;
  retweets?: number;
  views?: number;
  relevant?: boolean;
}

interface FeedCardProps {
  item: NewsItem;
  onClick: () => void;
  formatTimestamp: (timestamp: string) => string;
}

export function FeedCard({ item, onClick, formatTimestamp }: FeedCardProps) {
  return (
    <Card
      className="p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10">
          {item.profileImage ? (
            <AvatarImage src={item.profileImage} alt={item.username} />
          ) : (
            <AvatarFallback>{item.username[0].toUpperCase()}</AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{item.source || item.username}</span>
            <span className="text-xs text-muted-foreground">@{item.username}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimestamp(item.timestamp)}
            </span>
          </div>
          <p className="text-sm leading-relaxed mb-2">{item.title}</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {item.likes !== undefined && (
              <span className="flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {item.likes.toLocaleString()}
              </span>
            )}
            {item.retweets !== undefined && (
              <span className="flex items-center gap-1">
                <Repeat className="h-3 w-3" />
                {item.retweets.toLocaleString()}
              </span>
            )}
            {item.views !== undefined && (
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {item.views.toLocaleString()}
              </span>
            )}
            <Badge variant="outline" className="text-xs">
              {item.category}
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}
