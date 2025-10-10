import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface KalshiCredentials {
  apiKeyId: string;
  privateKey: string;
}

interface KalshiContextType {
  isConnected: boolean;
  credentials: KalshiCredentials | null;
  user: User | null;
  session: Session | null;
  loading: boolean;
  connect: (credentials: KalshiCredentials) => Promise<void>;
  disconnect: () => Promise<void>;
}

const KalshiContext = createContext<KalshiContextType | undefined>(undefined);

export const KalshiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [credentials, setCredentials] = useState<KalshiCredentials | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Load credentials when user logs in
        if (session?.user) {
          setTimeout(() => {
            loadCredentials(session.user.id);
          }, 0);
        } else {
          setCredentials(null);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadCredentials(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadCredentials = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_kalshi_credentials")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setCredentials({
          apiKeyId: data.api_key_id,
          privateKey: data.private_key,
        });
      }
    } catch (error) {
      console.error("Failed to load credentials:", error);
    }
  };

  const connect = async (creds: KalshiCredentials) => {
    if (!user) throw new Error("Must be logged in to save credentials");

    try {
      const { error } = await supabase
        .from("user_kalshi_credentials")
        .upsert({
          user_id: user.id,
          api_key_id: creds.apiKeyId,
          private_key: creds.privateKey,
        });

      if (error) throw error;

      setCredentials(creds);
    } catch (error) {
      console.error("Failed to save credentials:", error);
      throw error;
    }
  };

  const disconnect = async () => {
    if (!user) return;

    try {
      await supabase
        .from("user_kalshi_credentials")
        .delete()
        .eq("user_id", user.id);

      setCredentials(null);
    } catch (error) {
      console.error("Failed to delete credentials:", error);
    }
  };

  return (
    <KalshiContext.Provider 
      value={{ 
        isConnected: !!credentials, 
        credentials, 
        user, 
        session, 
        loading,
        connect, 
        disconnect 
      }}
    >
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
