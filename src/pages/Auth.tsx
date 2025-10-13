import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";
import { useLanguage } from "@/contexts/LanguageContext";

const Auth = () => {
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        toast({
          title: t.auth.welcomeBackToast,
          description: t.auth.loggedInSuccess,
        });
        navigate("/markets");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/markets`,
          },
        });
        
        if (error) throw error;
        
        toast({
          title: t.auth.accountCreated,
          description: t.auth.canLoginNow,
        });
        setIsLogin(true);
      }
    } catch (error: any) {
      toast({
        title: t.auth.error,
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <img src={logo} alt="khole" className="h-16 w-auto mx-auto mb-4" />
          <h2 className="text-3xl font-bold">
            {isLogin ? t.auth.welcomeBack : t.auth.createAccount}
          </h2>
          <p className="text-muted-foreground mt-2">
            {isLogin ? t.auth.signInDesc : t.auth.signUpDesc}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">{t.auth.email}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t.auth.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="password">{t.auth.password}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t.auth.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1"
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t.auth.pleaseWait : isLogin ? t.auth.signIn : t.auth.signUp}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-primary hover:underline"
            >
              {isLogin ? t.auth.noAccount : t.auth.hasAccount}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Auth;
