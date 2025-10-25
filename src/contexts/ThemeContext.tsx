import React, { createContext, useContext, useState, useEffect } from 'react';

type ThemeColor = 'golden' | 'emerald' | 'blue' | 'purple' | 'red' | 'teal' | 'grey';

interface ThemeContextType {
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const themeColors = {
  golden: {
    primary: '45 91% 49%',
    primaryBright: '45 95% 59%',
    primaryDim: '45 85% 39%',
  },
  emerald: {
    primary: '160 85% 45%',
    primaryBright: '160 90% 55%',
    primaryDim: '160 80% 35%',
  },
  blue: {
    primary: '217 91% 60%',
    primaryBright: '217 95% 70%',
    primaryDim: '217 85% 50%',
  },
  purple: {
    primary: '270 70% 60%',
    primaryBright: '270 75% 70%',
    primaryDim: '270 65% 50%',
  },
  red: {
    primary: '0 84% 60%',
    primaryBright: '0 90% 70%',
    primaryDim: '0 80% 50%',
  },
  teal: {
    primary: '180 75% 50%',
    primaryBright: '180 80% 60%',
    primaryDim: '180 70% 40%',
  },
  grey: {
    primary: '0 0% 75%',
    primaryBright: '0 0% 85%',
    primaryDim: '0 0% 65%',
  },
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeColor, setThemeColorState] = useState<ThemeColor>(() => {
    const saved = localStorage.getItem('themeColor');
    return (saved as ThemeColor) || 'grey';
  });

  useEffect(() => {
    const colors = themeColors[themeColor];
    const root = document.documentElement;
    
    root.style.setProperty('--primary', colors.primary);
    root.style.setProperty('--accent', colors.primary);
    root.style.setProperty('--ring', colors.primary);
    root.style.setProperty('--terminal-green', colors.primary);
    root.style.setProperty('--terminal-green-bright', colors.primaryBright);
    root.style.setProperty('--terminal-green-dim', colors.primaryDim);
    
    localStorage.setItem('themeColor', themeColor);
  }, [themeColor]);

  const setThemeColor = (color: ThemeColor) => {
    setThemeColorState(color);
  };

  return (
    <ThemeContext.Provider value={{ themeColor, setThemeColor }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
