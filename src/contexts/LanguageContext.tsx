import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'zh';

interface Translations {
  nav: {
    markets: string;
    feed: string;
    portfolio: string;
    watchlist: string;
    faq: string;
    searchPlaceholder: string;
    connect: string;
    connected: string;
    connectPlatform: string;
    login: string;
    logout: string;
    connectKalshi: string;
    connectKalshiDesc: string;
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
  auth: {
    welcomeBack: string;
    createAccount: string;
    signInDesc: string;
    signUpDesc: string;
    email: string;
    password: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    signIn: string;
    signUp: string;
    pleaseWait: string;
    noAccount: string;
    hasAccount: string;
    welcomeBackToast: string;
    loggedInSuccess: string;
    accountCreated: string;
    canLoginNow: string;
    error: string;
  };
  faq: {
    title: string;
    subtitle: string;
    question1: string;
    answer1: string;
    question2: string;
    answer2: string;
    question3: string;
    answer3: string;
    question4: string;
    answer4: string;
    question5: string;
    answer5: string;
    question6: string;
    answer6: string;
    question7: string;
    answer7: string;
    stillHaveQuestions: string;
    reachOut: string;
    contactSupport: string;
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
      searchPlaceholder: 'Search markets...',
      connect: 'Connect',
      connected: 'Connected',
      connectPlatform: 'Connect Platform',
      login: 'Login',
      logout: 'Logout',
      connectKalshi: 'Connect Kalshi',
      connectKalshiDesc: 'Please connect your Kalshi account to search markets',
    },
    home: {
      badge: 'Professional Trading Terminal',
      tagline: 'Match Breaking News with Prediction Markets in Real-Time',
      liveLink: '$FOMO is live on BSC',
      startTrading: 'Start Trading',
      viewMarkets: 'News Feed',
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
    auth: {
      welcomeBack: 'Welcome back',
      createAccount: 'Create your account',
      signInDesc: 'Sign in to access your portfolio',
      signUpDesc: 'Sign up to start trading',
      email: 'Email',
      password: 'Password',
      emailPlaceholder: 'you@example.com',
      passwordPlaceholder: '••••••••',
      signIn: 'Sign in',
      signUp: 'Sign up',
      pleaseWait: 'Please wait...',
      noAccount: "Don't have an account? Sign up",
      hasAccount: 'Already have an account? Sign in',
      welcomeBackToast: 'Welcome back!',
      loggedInSuccess: 'Successfully logged in',
      accountCreated: 'Account created!',
      canLoginNow: 'You can now log in',
      error: 'Error',
    },
    faq: {
      title: 'Frequently Asked Questions',
      subtitle: 'Everything you need to know about FOMO App',
      question1: 'What is FOMO App?',
      answer1: 'FOMO App is a comprehensive prediction markets platform that aggregates markets from Kalshi and Polymarket. Track real-time odds, manage your portfolio across multiple chains, and never miss trending prediction markets with our curated social feed.',
      question2: 'How do I connect to Polymarket?',
      answer2: "Navigate to the Portfolio page and click 'Connect' under Polymarket. You'll connect your wallet using WalletConnect - simply scan the QR code with your mobile wallet or connect through your browser extension. Your wallet address is stored securely and used to fetch your positions.",
      question3: 'How do I connect to Kalshi?',
      answer3: "Go to the Portfolio page and click 'Connect' under Kalshi. You'll need your Kalshi API credentials (API Key ID and Private Key) from your Kalshi account settings. Your credentials are encrypted and stored securely in our database.",
      question4: 'Is my data secure?',
      answer4: 'Yes. For Polymarket, we use WalletConnect which never exposes your private keys - you maintain full control through your wallet. Kalshi credentials are encrypted and stored securely. We never have access to execute trades without your explicit permission.',
      question5: 'What chains does FOMO App support?',
      answer5: 'FOMO App supports multiple chains for viewing your portfolio balances: Polygon (where Polymarket operates), Ethereum mainnet, Base, Arbitrum, and Optimism. You can switch between chains to view your native token balances on each network.',
      question6: 'How does the watchlist work?',
      answer6: "Add any market to your watchlist by clicking the bookmark icon. Your watchlist is saved to your account and syncs across devices. Access it anytime from the Watchlist page to track markets you're interested in.",
      question7: 'Can I use FOMO App on mobile?',
      answer7: 'Yes! FOMO App is fully responsive and works great on mobile devices. For Polymarket connections, mobile wallet apps make it even easier to connect via WalletConnect.',
      stillHaveQuestions: 'Still have questions?',
      reachOut: 'Reach out to us on Twitter or check our documentation',
      contactSupport: 'Contact Support →',
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
      searchPlaceholder: '搜索市场...',
      connect: '连接',
      connected: '已连接',
      connectPlatform: '连接平台',
      login: '登录',
      logout: '登出',
      connectKalshi: '连接 Kalshi',
      connectKalshiDesc: '请连接您的 Kalshi 账户以搜索市场',
    },
    home: {
      badge: '专业交易终端',
      tagline: '实时匹配突发新闻与预测市场',
      liveLink: '$FOMO 已在 BSC 上线',
      startTrading: '开始交易',
      viewMarkets: '新闻动态',
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
    auth: {
      welcomeBack: '欢迎回来',
      createAccount: '创建您的账户',
      signInDesc: '登录以访问您的投资组合',
      signUpDesc: '注册以开始交易',
      email: '邮箱',
      password: '密码',
      emailPlaceholder: 'you@example.com',
      passwordPlaceholder: '••••••••',
      signIn: '登录',
      signUp: '注册',
      pleaseWait: '请稍候...',
      noAccount: '没有账户？立即注册',
      hasAccount: '已有账户？立即登录',
      welcomeBackToast: '欢迎回来！',
      loggedInSuccess: '登录成功',
      accountCreated: '账户创建成功！',
      canLoginNow: '您现在可以登录了',
      error: '错误',
    },
    faq: {
      title: '常见问题',
      subtitle: '关于 FOMO App 您需要了解的一切',
      question1: '什么是 FOMO App？',
      answer1: 'FOMO App 是一个综合性预测市场平台，汇集了 Kalshi 和 Polymarket 的市场。跟踪实时赔率，管理多链投资组合，通过我们精选的社交动态，不错过任何热门预测市场。',
      question2: '如何连接到 Polymarket？',
      answer2: '导航到投资组合页面，点击 Polymarket 下的"连接"。您将使用 WalletConnect 连接您的钱包 - 只需使用您的移动钱包扫描二维码，或通过浏览器扩展连接。您的钱包地址将被安全存储，用于获取您的持仓。',
      question3: '如何连接到 Kalshi？',
      answer3: '前往投资组合页面，点击 Kalshi 下的"连接"。您需要从 Kalshi 账户设置中获取 API 凭据（API 密钥 ID 和私钥）。您的凭据将被加密并安全存储在我们的数据库中。',
      question4: '我的数据安全吗？',
      answer4: '是的。对于 Polymarket，我们使用 WalletConnect，它从不暴露您的私钥 - 您通过钱包保持完全控制。Kalshi 凭据经过加密并安全存储。未经您明确许可，我们无法执行交易。',
      question5: 'FOMO App 支持哪些链？',
      answer5: 'FOMO App 支持多条链查看您的投资组合余额：Polygon（Polymarket 运行的地方）、以太坊主网、Base、Arbitrum 和 Optimism。您可以在链之间切换以查看每个网络上的原生代币余额。',
      question6: '关注列表如何工作？',
      answer6: '通过点击书签图标将任何市场添加到您的关注列表。您的关注列表保存到您的账户并在设备间同步。随时从关注列表页面访问，跟踪您感兴趣的市场。',
      question7: '我可以在移动设备上使用 FOMO App 吗？',
      answer7: '可以！FOMO App 完全响应式，在移动设备上运行良好。对于 Polymarket 连接，移动钱包应用程序使通过 WalletConnect 连接变得更加容易。',
      stillHaveQuestions: '还有问题？',
      reachOut: '在 Twitter 上联系我们或查看我们的文档',
      contactSupport: '联系支持 →',
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
