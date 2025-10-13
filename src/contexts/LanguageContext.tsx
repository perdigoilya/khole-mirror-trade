import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'zh';

interface Translations {
  nav: {
    markets: string;
    feed: string;
    portfolio: string;
    watchlist: string;
    faq: string;
  };
  home: {
    badge: string;
    tagline: string;
    liveLink: string;
    startTrading: string;
    viewMarkets: string;
    featureTitle1: string;
    featureDesc1: string;
    featureTitle2: string;
    featureDesc2: string;
    featureTitle3: string;
    featureDesc3: string;
  };
  footer: {
    systemOperational: string;
    systemDegraded: string;
    systemDown: string;
    feedTracker: string;
    feedTrackerTitle: string;
    feedTrackerDesc: string;
    noActivity: string;
    helpSupport: string;
  };
  common: {
    loading: string;
  };
}

const translations: Record<Language, Translations> = {
  en: {
    nav: {
      markets: 'Markets',
      feed: 'Feed',
      portfolio: 'Portfolio',
      watchlist: 'Watchlist',
      faq: 'FAQ',
    },
    home: {
      badge: 'Professional Trading Terminal',
      tagline: 'Match Breaking News with Prediction Markets in Real-Time',
      liveLink: '$FOMO is live on Solana',
      startTrading: 'Start Trading',
      viewMarkets: 'View Markets',
      featureTitle1: 'Real-Time Market Data',
      featureDesc1: 'Track prediction markets across Polymarket and Kalshi with live price updates and market movements.',
      featureTitle2: 'News Feed Integration',
      featureDesc2: 'Stay ahead with curated news that directly impacts your markets, powered by AI-driven insights.',
      featureTitle3: 'Portfolio Management',
      featureDesc3: 'Monitor your positions, track P&L, and manage your portfolio across multiple platforms in one place.',
    },
    footer: {
      systemOperational: 'Systems Operational',
      systemDegraded: 'Degraded Performance',
      systemDown: 'Service Down',
      feedTracker: 'Feed Tracker',
      feedTrackerTitle: 'Latest Feed Activity',
      feedTrackerDesc: 'Real-time updates from prediction market news sources',
      noActivity: 'No recent activity. Check back soon!',
      helpSupport: 'Help & Support',
    },
    common: {
      loading: 'Loading...',
    },
  },
  zh: {
    nav: {
      markets: '市场',
      feed: '动态',
      portfolio: '投资组合',
      watchlist: '关注列表',
      faq: '常见问题',
    },
    home: {
      badge: '专业交易终端',
      tagline: '实时匹配突发新闻与预测市场',
      liveLink: '$FOMO 已在 Solana 上线',
      startTrading: '开始交易',
      viewMarkets: '查看市场',
      featureTitle1: '实时市场数据',
      featureDesc1: '跟踪 Polymarket 和 Kalshi 的预测市场，获取实时价格更新和市场动态。',
      featureTitle2: '新闻动态集成',
      featureDesc2: '通过 AI 驱动的洞察，获取直接影响您市场的精选新闻，保持领先。',
      featureTitle3: '投资组合管理',
      featureDesc3: '在一个平台上监控您的持仓、跟踪损益并管理多个平台的投资组合。',
    },
    footer: {
      systemOperational: '系统运行正常',
      systemDegraded: '性能下降',
      systemDown: '服务中断',
      feedTracker: '动态追踪',
      feedTrackerTitle: '最新动态',
      feedTrackerDesc: '来自预测市场新闻源的实时更新',
      noActivity: '暂无最新动态，请稍后查看！',
      helpSupport: '帮助与支持',
    },
    common: {
      loading: '加载中...',
    },
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    return (saved === 'zh' ? 'zh' : 'en') as Language;
  });

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  const value = {
    language,
    setLanguage,
    t: translations[language],
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
