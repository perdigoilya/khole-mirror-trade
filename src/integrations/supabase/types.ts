export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      followed_twitter_accounts: {
        Row: {
          account_category: string | null
          created_at: string | null
          display_name: string | null
          id: string
          last_fetched_at: string | null
          profile_image_url: string | null
          twitter_user_id: string | null
          twitter_username: string
        }
        Insert: {
          account_category?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          last_fetched_at?: string | null
          profile_image_url?: string | null
          twitter_user_id?: string | null
          twitter_username: string
        }
        Update: {
          account_category?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          last_fetched_at?: string | null
          profile_image_url?: string | null
          twitter_user_id?: string | null
          twitter_username?: string
        }
        Relationships: []
      }
      kalshi_events: {
        Row: {
          category: string | null
          created_at: string
          event_data: Json | null
          event_ticker: string
          id: string
          last_updated: string
          market_count: number | null
          subtitle: string | null
          title: string
          total_liquidity: number | null
          total_volume: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          event_data?: Json | null
          event_ticker: string
          id: string
          last_updated?: string
          market_count?: number | null
          subtitle?: string | null
          title: string
          total_liquidity?: number | null
          total_volume?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          event_data?: Json | null
          event_ticker?: string
          id?: string
          last_updated?: string
          market_count?: number | null
          subtitle?: string | null
          title?: string
          total_liquidity?: number | null
          total_volume?: number | null
        }
        Relationships: []
      }
      kalshi_markets: {
        Row: {
          category: string | null
          close_time: string | null
          created_at: string
          event_ticker: string | null
          id: string
          last_updated: string
          liquidity_dollars: number | null
          market_data: Json | null
          no_price: number | null
          status: string | null
          subtitle: string | null
          ticker: string
          title: string
          volume_24h_dollars: number | null
          volume_dollars: number | null
          yes_price: number | null
        }
        Insert: {
          category?: string | null
          close_time?: string | null
          created_at?: string
          event_ticker?: string | null
          id: string
          last_updated?: string
          liquidity_dollars?: number | null
          market_data?: Json | null
          no_price?: number | null
          status?: string | null
          subtitle?: string | null
          ticker: string
          title: string
          volume_24h_dollars?: number | null
          volume_dollars?: number | null
          yes_price?: number | null
        }
        Update: {
          category?: string | null
          close_time?: string | null
          created_at?: string
          event_ticker?: string | null
          id?: string
          last_updated?: string
          liquidity_dollars?: number | null
          market_data?: Json | null
          no_price?: number | null
          status?: string | null
          subtitle?: string | null
          ticker?: string
          title?: string
          volume_24h_dollars?: number | null
          volume_dollars?: number | null
          yes_price?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      twitter_feed: {
        Row: {
          author_name: string | null
          author_username: string
          category: string | null
          created_at: string
          fetched_at: string | null
          id: string
          likes_count: number | null
          profile_image_url: string | null
          relevant: boolean | null
          retweets_count: number | null
          text: string
          tweet_id: string
          views_count: number | null
        }
        Insert: {
          author_name?: string | null
          author_username: string
          category?: string | null
          created_at: string
          fetched_at?: string | null
          id?: string
          likes_count?: number | null
          profile_image_url?: string | null
          relevant?: boolean | null
          retweets_count?: number | null
          text: string
          tweet_id: string
          views_count?: number | null
        }
        Update: {
          author_name?: string | null
          author_username?: string
          category?: string | null
          created_at?: string
          fetched_at?: string | null
          id?: string
          likes_count?: number | null
          profile_image_url?: string | null
          relevant?: boolean | null
          retweets_count?: number | null
          text?: string
          tweet_id?: string
          views_count?: number | null
        }
        Relationships: []
      }
      user_kalshi_credentials: {
        Row: {
          api_key_id: string
          created_at: string | null
          environment: string | null
          id: string
          private_key: string
          user_id: string
        }
        Insert: {
          api_key_id: string
          created_at?: string | null
          environment?: string | null
          id?: string
          private_key: string
          user_id: string
        }
        Update: {
          api_key_id?: string
          created_at?: string | null
          environment?: string | null
          id?: string
          private_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_kalshi_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_polymarket_credentials: {
        Row: {
          api_credentials_key: string | null
          api_credentials_passphrase: string | null
          api_credentials_secret: string | null
          api_key: string | null
          created_at: string
          funder_address: string | null
          id: string
          updated_at: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          api_credentials_key?: string | null
          api_credentials_passphrase?: string | null
          api_credentials_secret?: string | null
          api_key?: string | null
          created_at?: string
          funder_address?: string | null
          id?: string
          updated_at?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          api_credentials_key?: string | null
          api_credentials_passphrase?: string | null
          api_credentials_secret?: string | null
          api_key?: string | null
          created_at?: string
          funder_address?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          added_at: string | null
          id: string
          market_data: Json | null
          market_id: string | null
          market_ticker: string
          market_title: string
          user_id: string
        }
        Insert: {
          added_at?: string | null
          id?: string
          market_data?: Json | null
          market_id?: string | null
          market_ticker: string
          market_title: string
          user_id: string
        }
        Update: {
          added_at?: string | null
          id?: string
          market_data?: Json | null
          market_id?: string | null
          market_ticker?: string
          market_title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
