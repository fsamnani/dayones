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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      job_runs: {
        Row: {
          errors: Json
          finished_at: string | null
          id: number
          notes: string | null
          snapshots_written: number
          started_at: string
          status: string
          talent_updated: number
          task: string
        }
        Insert: {
          errors?: Json
          finished_at?: string | null
          id?: never
          notes?: string | null
          snapshots_written?: number
          started_at?: string
          status?: string
          talent_updated?: number
          task: string
        }
        Update: {
          errors?: Json
          finished_at?: string | null
          id?: never
          notes?: string | null
          snapshots_written?: number
          started_at?: string
          status?: string
          talent_updated?: number
          task?: string
        }
        Relationships: []
      }
      league_members: {
        Row: {
          joined_at: string
          league_id: string
          scout_id: string
        }
        Insert: {
          joined_at?: string
          league_id: string
          scout_id: string
        }
        Update: {
          joined_at?: string
          league_id?: string
          scout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_scout_id_fkey"
            columns: ["scout_id"]
            isOneToOne: false
            referencedRelation: "scouts"
            referencedColumns: ["id"]
          },
        ]
      }
      league_posts: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          data: Json
          id: string
          kind: string
          league_id: string
          title: string | null
          week_start: string | null
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          league_id: string
          title?: string | null
          week_start?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          league_id?: string
          title?: string | null
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "scouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_posts_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          id: string
          invite_code: string
          is_solo: boolean
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code?: string
          is_solo?: boolean
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string
          is_solo?: boolean
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "scouts"
            referencedColumns: ["id"]
          },
        ]
      }
      live_samples: {
        Row: {
          category: string | null
          id: number
          sampled_at: string
          source: string
          talent_account_id: string
          title: string | null
          viewers: number
        }
        Insert: {
          category?: string | null
          id?: never
          sampled_at?: string
          source: string
          talent_account_id: string
          title?: string | null
          viewers: number
        }
        Update: {
          category?: string | null
          id?: never
          sampled_at?: string
          source?: string
          talent_account_id?: string
          title?: string | null
          viewers?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_samples_talent_account_id_fkey"
            columns: ["talent_account_id"]
            isOneToOne: false
            referencedRelation: "talent_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      matchups: {
        Row: {
          away_points: number | null
          away_scout_id: string | null
          home_points: number | null
          home_scout_id: string
          id: string
          is_playoff: boolean
          season_id: string
          status: string
          week: number
          winner_scout_id: string | null
        }
        Insert: {
          away_points?: number | null
          away_scout_id?: string | null
          home_points?: number | null
          home_scout_id: string
          id?: string
          is_playoff?: boolean
          season_id: string
          status?: string
          week: number
          winner_scout_id?: string | null
        }
        Update: {
          away_points?: number | null
          away_scout_id?: string | null
          home_points?: number | null
          home_scout_id?: string
          id?: string
          is_playoff?: boolean
          season_id?: string
          status?: string
          week?: number
          winner_scout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matchups_away_scout_id_fkey"
            columns: ["away_scout_id"]
            isOneToOne: false
            referencedRelation: "scouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchups_home_scout_id_fkey"
            columns: ["home_scout_id"]
            isOneToOne: false
            referencedRelation: "scouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchups_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchups_winner_scout_id_fkey"
            columns: ["winner_scout_id"]
            isOneToOne: false
            referencedRelation: "scouts"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          created_at: string
          description: string | null
          id: string
          kind: string
          logged_by: string
          occurred_on: string
          points: number
          source_url: string | null
          talent_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          logged_by?: string
          occurred_on: string
          points: number
          source_url?: string | null
          talent_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          logged_by?: string
          occurred_on?: string
          points?: number
          source_url?: string | null
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_rankings"
            referencedColumns: ["talent_id"]
          },
        ]
      }
      nominations: {
        Row: {
          created_at: string
          id: string
          links: string[]
          name: string
          note: string | null
          position: Database["public"]["Enums"]["talent_position"] | null
          reviewed_at: string | null
          scout_id: string
          status: string
          talent_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          links?: string[]
          name: string
          note?: string | null
          position?: Database["public"]["Enums"]["talent_position"] | null
          reviewed_at?: string | null
          scout_id: string
          status?: string
          talent_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          links?: string[]
          name?: string
          note?: string | null
          position?: Database["public"]["Enums"]["talent_position"] | null
          reviewed_at?: string | null
          scout_id?: string
          status?: string
          talent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nominations_scout_id_fkey"
            columns: ["scout_id"]
            isOneToOne: false
            referencedRelation: "scouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nominations_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nominations_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_rankings"
            referencedColumns: ["talent_id"]
          },
        ]
      }
      picks: {
        Row: {
          dropped_at: string | null
          id: string
          league_id: string
          multiplier: number
          picked_at: string
          scout_id: string
          size_at_draft: number
          slot: Database["public"]["Enums"]["roster_slot"]
          talent_id: string
        }
        Insert: {
          dropped_at?: string | null
          id?: string
          league_id: string
          multiplier: number
          picked_at?: string
          scout_id: string
          size_at_draft: number
          slot: Database["public"]["Enums"]["roster_slot"]
          talent_id: string
        }
        Update: {
          dropped_at?: string | null
          id?: string
          league_id?: string
          multiplier?: number
          picked_at?: string
          scout_id?: string
          size_at_draft?: number
          slot?: Database["public"]["Enums"]["roster_slot"]
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "picks_league_id_scout_id_fkey"
            columns: ["league_id", "scout_id"]
            isOneToOne: false
            referencedRelation: "league_members"
            referencedColumns: ["league_id", "scout_id"]
          },
          {
            foreignKeyName: "picks_scout_id_fkey"
            columns: ["scout_id"]
            isOneToOne: false
            referencedRelation: "scouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picks_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picks_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_rankings"
            referencedColumns: ["talent_id"]
          },
        ]
      }
      platforms: {
        Row: {
          audience_metric: string | null
          id: string
          is_tracked: boolean
          name: string
          notes: string | null
        }
        Insert: {
          audience_metric?: string | null
          id: string
          is_tracked?: boolean
          name: string
          notes?: string | null
        }
        Update: {
          audience_metric?: string | null
          id?: string
          is_tracked?: boolean
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      scoring_platform_config: {
        Row: {
          audience_weight: number | null
          heat_floor: number | null
          heat_floor_unit: string | null
          platform_id: string
          position: Database["public"]["Enums"]["talent_position"]
          updated_at: string
        }
        Insert: {
          audience_weight?: number | null
          heat_floor?: number | null
          heat_floor_unit?: string | null
          platform_id: string
          position: Database["public"]["Enums"]["talent_position"]
          updated_at?: string
        }
        Update: {
          audience_weight?: number | null
          heat_floor?: number | null
          heat_floor_unit?: string | null
          platform_id?: string
          position?: Database["public"]["Enums"]["talent_position"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_platform_config_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_settings: {
        Row: {
          description: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      scout_weekly_points: {
        Row: {
          base_points: number
          computed_at: string
          multiplier: number
          pick_id: string
          points: number
          week_start: string
        }
        Insert: {
          base_points: number
          computed_at?: string
          multiplier: number
          pick_id: string
          points: number
          week_start: string
        }
        Update: {
          base_points?: number
          computed_at?: string
          multiplier?: number
          pick_id?: string
          points?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "scout_weekly_points_pick_id_fkey"
            columns: ["pick_id"]
            isOneToOne: false
            referencedRelation: "picks"
            referencedColumns: ["id"]
          },
        ]
      }
      scouts: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          is_admin: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          is_admin?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          id: string
          league_id: string
          number: number
          playoff_weeks: number
          starts_on: string
          status: string
          weeks: number
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          number: number
          playoff_weeks?: number
          starts_on: string
          status?: string
          weeks?: number
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          number?: number
          playoff_weeks?: number
          starts_on?: string
          status?: string
          weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      stat_snapshots: {
        Row: {
          fetched_at: string
          id: number
          metric: string
          snapshot_date: string
          source: string
          source_url: string | null
          talent_account_id: string
          value: number
        }
        Insert: {
          fetched_at?: string
          id?: never
          metric: string
          snapshot_date: string
          source: string
          source_url?: string | null
          talent_account_id: string
          value: number
        }
        Update: {
          fetched_at?: string
          id?: never
          metric?: string
          snapshot_date?: string
          source?: string
          source_url?: string | null
          talent_account_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "stat_snapshots_talent_account_id_fkey"
            columns: ["talent_account_id"]
            isOneToOne: false
            referencedRelation: "talent_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      talent: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          image_url: string | null
          name: string
          position: Database["public"]["Enums"]["talent_position"]
          slug: string
          status: Database["public"]["Enums"]["talent_status"]
          tags: string[]
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          position: Database["public"]["Enums"]["talent_position"]
          slug: string
          status?: Database["public"]["Enums"]["talent_status"]
          tags?: string[]
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          position?: Database["public"]["Enums"]["talent_position"]
          slug?: string
          status?: Database["public"]["Enums"]["talent_status"]
          tags?: string[]
        }
        Relationships: []
      }
      talent_accounts: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          is_primary: boolean
          platform_id: string
          talent_id: string
          url: string
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          is_primary?: boolean
          platform_id: string
          talent_id: string
          url: string
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          is_primary?: boolean
          platform_id?: string
          talent_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_accounts_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_accounts_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_accounts_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_rankings"
            referencedColumns: ["talent_id"]
          },
        ]
      }
      talent_weekly_scores: {
        Row: {
          audience_index: number | null
          computed_at: string
          details: Json
          growth_points: number
          heat_points: number
          is_final: boolean
          milestone_points: number
          talent_id: string
          total_points: number | null
          week_start: string
        }
        Insert: {
          audience_index?: number | null
          computed_at?: string
          details?: Json
          growth_points?: number
          heat_points?: number
          is_final?: boolean
          milestone_points?: number
          talent_id: string
          total_points?: number | null
          week_start: string
        }
        Update: {
          audience_index?: number | null
          computed_at?: string
          details?: Json
          growth_points?: number
          heat_points?: number
          is_final?: boolean
          milestone_points?: number
          talent_id?: string
          total_points?: number | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_weekly_scores_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_weekly_scores_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_rankings"
            referencedColumns: ["talent_id"]
          },
        ]
      }
    }
    Views: {
      talent_latest_stats: {
        Row: {
          fetched_at: string | null
          metric: string | null
          platform_id: string | null
          snapshot_date: string | null
          source: string | null
          source_url: string | null
          talent_account_id: string | null
          talent_id: string | null
          value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stat_snapshots_talent_account_id_fkey"
            columns: ["talent_account_id"]
            isOneToOne: false
            referencedRelation: "talent_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_accounts_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_accounts_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_accounts_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_rankings"
            referencedColumns: ["talent_id"]
          },
        ]
      }
      talent_rankings: {
        Row: {
          adds_this_week: number | null
          audience_index: number | null
          growth_points: number | null
          growth_rank: number | null
          heat_points: number | null
          heat_rank: number | null
          image_url: string | null
          milestone_points: number | null
          name: string | null
          points_rank: number | null
          position: Database["public"]["Enums"]["talent_position"] | null
          rostered_count: number | null
          rostered_pct: number | null
          slug: string | null
          tags: string[] | null
          talent_id: string | null
          total_points: number | null
          week_start: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      call_daily_stats: { Args: { p_task: string }; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      join_league: { Args: { p_invite_code: string }; Returns: string }
      set_job_secret: { Args: { p_secret: string }; Returns: undefined }
      week_start_of: { Args: { ts: string }; Returns: string }
    }
    Enums: {
      roster_slot: "musician" | "creator" | "streamer" | "flex"
      talent_position: "musician" | "creator" | "streamer"
      talent_status: "nominated" | "draftable" | "retired"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      roster_slot: ["musician", "creator", "streamer", "flex"],
      talent_position: ["musician", "creator", "streamer"],
      talent_status: ["nominated", "draftable", "retired"],
    },
  },
} as const
