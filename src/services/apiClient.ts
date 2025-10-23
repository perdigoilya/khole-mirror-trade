import { supabase } from "@/integrations/supabase/client";

/**
 * Centralized API client for all Supabase function calls
 */
class ApiClient {
  /**
   * Generic function invoker with error handling
   */
  async invoke<T = any>(functionName: string, body: any = {}): Promise<{ data: T | null; error: any }> {
    try {
      const result = await supabase.functions.invoke(functionName, { body });
      return result;
    } catch (error: any) {
      console.error(`[ApiClient] Error calling ${functionName}:`, error);
      return { data: null, error };
    }
  }

  /**
   * Get authenticated session
   */
  async getSession() {
    return await supabase.auth.getSession();
  }

  /**
   * Subscribe to realtime changes
   */
  channel(name: string) {
    return supabase.channel(name);
  }

  /**
   * Remove a channel subscription
   */
  removeChannel(channel: any) {
    return supabase.removeChannel(channel);
  }
}

export const apiClient = new ApiClient();
