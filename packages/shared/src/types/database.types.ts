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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_logs: {
        Row: {
          cost_usd: number | null
          created_at: string
          error_code: string | null
          id: string
          input_tokens: number | null
          job_id: string | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          provider: Database["public"]["Enums"]["api_provider"]
          success: boolean
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          error_code?: string | null
          id?: string
          input_tokens?: number | null
          job_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          provider: Database["public"]["Enums"]["api_provider"]
          success: boolean
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          error_code?: string | null
          id?: string
          input_tokens?: number | null
          job_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          provider?: Database["public"]["Enums"]["api_provider"]
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "api_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_read: boolean
          job_id: string
          sender_id: string | null
          sender_role: Database["public"]["Enums"]["message_sender"]
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          job_id: string
          sender_id?: string | null
          sender_role: Database["public"]["Enums"]["message_sender"]
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          job_id?: string
          sender_id?: string | null
          sender_role?: Database["public"]["Enums"]["message_sender"]
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          building_name: string | null
          created_at: string
          district: string | null
          floor: string | null
          id: string
          unit_number: string | null
          updated_at: string
        }
        Insert: {
          building_name?: string | null
          created_at?: string
          district?: string | null
          floor?: string | null
          id: string
          unit_number?: string | null
          updated_at?: string
        }
        Update: {
          building_name?: string | null
          created_at?: string
          district?: string | null
          floor?: string | null
          id?: string
          unit_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_broadcasts: {
        Row: {
          broadcast_at: string
          id: string
          job_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["broadcast_status"]
          worker_id: string
        }
        Insert: {
          broadcast_at?: string
          id?: string
          job_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["broadcast_status"]
          worker_id: string
        }
        Update: {
          broadcast_at?: string
          id?: string
          job_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["broadcast_status"]
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_broadcasts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_broadcasts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          address_building: string | null
          address_district: string | null
          address_floor: string | null
          address_unit: string | null
          broadcast_at: string | null
          cancelled_at: string | null
          completed_at: string | null
          completion_notes: string | null
          completion_photo_urls: string[]
          confirmed_at: string | null
          created_at: string
          customer_id: string
          description: string
          final_price: number | null
          id: string
          kael_advisory: string | null
          kael_complexity:
            | Database["public"]["Enums"]["complexity_level"]
            | null
          kael_price_max: number | null
          kael_price_min: number | null
          kael_problem_identified: string | null
          matched_at: string | null
          paid_at: string | null
          photo_urls: string[]
          price_context_1: Json | null
          price_context_2: Json | null
          problem_chips: string[]
          scheduled_at: string | null
          scope_change_customer_decision: string | null
          scope_change_description: string | null
          scope_change_price_max: number | null
          scope_change_price_min: number | null
          scope_change_reason: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          address_building?: string | null
          address_district?: string | null
          address_floor?: string | null
          address_unit?: string | null
          broadcast_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          completion_photo_urls?: string[]
          confirmed_at?: string | null
          created_at?: string
          customer_id: string
          description: string
          final_price?: number | null
          id?: string
          kael_advisory?: string | null
          kael_complexity?:
            | Database["public"]["Enums"]["complexity_level"]
            | null
          kael_price_max?: number | null
          kael_price_min?: number | null
          kael_problem_identified?: string | null
          matched_at?: string | null
          paid_at?: string | null
          photo_urls?: string[]
          price_context_1?: Json | null
          price_context_2?: Json | null
          problem_chips?: string[]
          scheduled_at?: string | null
          scope_change_customer_decision?: string | null
          scope_change_description?: string | null
          scope_change_price_max?: number | null
          scope_change_price_min?: number | null
          scope_change_reason?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          address_building?: string | null
          address_district?: string | null
          address_floor?: string | null
          address_unit?: string | null
          broadcast_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          completion_photo_urls?: string[]
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string
          description?: string
          final_price?: number | null
          id?: string
          kael_advisory?: string | null
          kael_complexity?:
            | Database["public"]["Enums"]["complexity_level"]
            | null
          kael_price_max?: number | null
          kael_price_min?: number | null
          kael_problem_identified?: string | null
          matched_at?: string | null
          paid_at?: string | null
          photo_urls?: string[]
          price_context_1?: Json | null
          price_context_2?: Json | null
          problem_chips?: string[]
          scheduled_at?: string | null
          scope_change_customer_decision?: string | null
          scope_change_description?: string | null
          scope_change_price_max?: number | null
          scope_change_price_min?: number | null
          scope_change_reason?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_baselines: {
        Row: {
          complexity: Database["public"]["Enums"]["complexity_level"]
          id: string
          price_max: number
          price_min: number
          service_type: Database["public"]["Enums"]["service_type"]
          updated_at: string
        }
        Insert: {
          complexity: Database["public"]["Enums"]["complexity_level"]
          id?: string
          price_max: number
          price_min: number
          service_type: Database["public"]["Enums"]["service_type"]
          updated_at?: string
        }
        Update: {
          complexity?: Database["public"]["Enums"]["complexity_level"]
          id?: string
          price_max?: number
          price_min?: number
          service_type?: Database["public"]["Enums"]["service_type"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          job_id: string
          rating: number
          tags: string[]
          worker_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          job_id: string
          rating: number
          tags?: string[]
          worker_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          job_id?: string
          rating?: number
          tags?: string[]
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_profiles: {
        Row: {
          bank_account: string | null
          bank_name: string | null
          cccd_back_url: string | null
          cccd_front_url: string | null
          created_at: string
          districts: string[]
          id: string
          is_approved: boolean
          is_available: boolean
          rating: number
          selfie_url: string | null
          service_types: Database["public"]["Enums"]["service_type"][]
          total_jobs: number
          updated_at: string
          years_experience: number
        }
        Insert: {
          bank_account?: string | null
          bank_name?: string | null
          cccd_back_url?: string | null
          cccd_front_url?: string | null
          created_at?: string
          districts?: string[]
          id: string
          is_approved?: boolean
          is_available?: boolean
          rating?: number
          selfie_url?: string | null
          service_types?: Database["public"]["Enums"]["service_type"][]
          total_jobs?: number
          updated_at?: string
          years_experience?: number
        }
        Update: {
          bank_account?: string | null
          bank_name?: string | null
          cccd_back_url?: string | null
          cccd_front_url?: string | null
          created_at?: string
          districts?: string[]
          id?: string
          is_approved?: boolean
          is_available?: boolean
          rating?: number
          selfie_url?: string | null
          service_types?: Database["public"]["Enums"]["service_type"][]
          total_jobs?: number
          updated_at?: string
          years_experience?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
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
      api_provider: "anthropic" | "perplexity" | "deepseek"
      broadcast_status: "pending" | "accepted" | "declined" | "expired"
      complexity_level: "small" | "medium" | "large"
      job_status:
        | "pending"
        | "broadcast"
        | "matched"
        | "worker_en_route"
        | "inspecting"
        | "in_progress"
        | "scope_change"
        | "completed"
        | "confirmed"
        | "paid"
        | "cancelled"
      message_sender: "customer" | "worker" | "kael"
      service_type: "electrical" | "plumbing"
      user_role: "customer" | "worker" | "admin"
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
    Enums: {
      api_provider: ["anthropic", "perplexity", "deepseek"],
      broadcast_status: ["pending", "accepted", "declined", "expired"],
      complexity_level: ["small", "medium", "large"],
      job_status: [
        "pending",
        "broadcast",
        "matched",
        "worker_en_route",
        "inspecting",
        "in_progress",
        "scope_change",
        "completed",
        "confirmed",
        "paid",
        "cancelled",
      ],
      message_sender: ["customer", "worker", "kael"],
      service_type: ["electrical", "plumbing"],
      user_role: ["customer", "worker", "admin"],
    },
  },
} as const

