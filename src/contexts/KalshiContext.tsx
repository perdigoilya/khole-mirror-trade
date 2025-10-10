import React, { createContext, useContext, useState, useEffect } from "react";

interface KalshiCredentials {
  apiKeyId: string;
  privateKey: string;
}

interface KalshiContextType {
  isConnected: boolean;
  credentials: KalshiCredentials | null;
  connect: (credentials: KalshiCredentials) => void;
  disconnect: () => void;
}

const KalshiContext = createContext<KalshiContextType | undefined>(undefined);

export const KalshiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [credentials, setCredentials] = useState<KalshiCredentials | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("kalshi_credentials");
    if (stored) {
      try {
        setCredentials(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse stored credentials");
      }
    }
  }, []);

  const connect = (creds: KalshiCredentials) => {
    setCredentials(creds);
    localStorage.setItem("kalshi_credentials", JSON.stringify(creds));
  };

  const disconnect = () => {
    setCredentials(null);
    localStorage.removeItem("kalshi_credentials");
  };

  return (
    <KalshiContext.Provider value={{ isConnected: !!credentials, credentials, connect, disconnect }}>
      {children}
    </KalshiContext.Provider>
  );
};

export const useKalshi = () => {
  const context = useContext(KalshiContext);
  if (!context) {
    throw new Error("useKalshi must be used within KalshiProvider");
  }
  return context;
};
