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
          fallback_used: boolean
          id: string
          input_tokens: number | null
          job_id: string | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          prompt_version: string | null
          provider: Database["public"]["Enums"]["api_provider"]
          purpose: string | null
          request_id: string | null
          safe_metadata: Json
          success: boolean
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          error_code?: string | null
          fallback_used?: boolean
          id?: string
          input_tokens?: number | null
          job_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          provider: Database["public"]["Enums"]["api_provider"]
          purpose?: string | null
          request_id?: string | null
          safe_metadata?: Json
          success: boolean
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          error_code?: string | null
          fallback_used?: boolean
          id?: string
          input_tokens?: number | null
          job_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          provider?: Database["public"]["Enums"]["api_provider"]
          purpose?: string | null
          request_id?: string | null
          safe_metadata?: Json
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
      device_push_tokens: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_seen_at: string
          permission_status: string
          platform: string
          push_token: string
          safe_metadata: Json
          token_hash: string
          token_last4: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_seen_at?: string
          permission_status: string
          platform: string
          push_token: string
          safe_metadata?: Json
          token_hash: string
          token_last4: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_seen_at?: string
          permission_status?: string
          platform?: string
          push_token?: string
          safe_metadata?: Json
          token_hash?: string
          token_last4?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_broadcasts: {
        Row: {
          batch_id: string
          broadcast_at: string
          expires_at: string | null
          id: string
          job_id: string
          responded_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["broadcast_status"]
          worker_id: string
        }
        Insert: {
          batch_id?: string
          broadcast_at?: string
          expires_at?: string | null
          id?: string
          job_id: string
          responded_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["broadcast_status"]
          worker_id: string
        }
        Update: {
          batch_id?: string
          broadcast_at?: string
          expires_at?: string | null
          id?: string
          job_id?: string
          responded_at?: string | null
          sent_at?: string | null
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
      job_events: {
        Row: {
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["user_role"] | null
          created_at: string
          event_type: string
          from_status: Database["public"]["Enums"]["job_status"] | null
          id: string
          job_id: string
          safe_metadata: Json
          to_status: Database["public"]["Enums"]["job_status"] | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          created_at?: string
          event_type: string
          from_status?: Database["public"]["Enums"]["job_status"] | null
          id?: string
          job_id: string
          safe_metadata?: Json
          to_status?: Database["public"]["Enums"]["job_status"] | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          created_at?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["job_status"] | null
          id?: string
          job_id?: string
          safe_metadata?: Json
          to_status?: Database["public"]["Enums"]["job_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "job_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_media_assets: {
        Row: {
          bucket_id: string
          created_at: string
          file_size_bytes: number | null
          id: string
          job_id: string
          mime_type: string | null
          object_path: string
          owner_id: string
          safe_metadata: Json
          service_type: Database["public"]["Enums"]["service_type"]
          stage: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          job_id: string
          mime_type?: string | null
          object_path: string
          owner_id: string
          safe_metadata?: Json
          service_type: Database["public"]["Enums"]["service_type"]
          stage: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          job_id?: string
          mime_type?: string | null
          object_path?: string
          owner_id?: string
          safe_metadata?: Json
          service_type?: Database["public"]["Enums"]["service_type"]
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_media_assets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_media_assets_owner_id_fkey"
            columns: ["owner_id"]
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
          address_lat: number | null
          address_lng: number | null
          address_unit: string | null
          arrived_at: string | null
          broadcast_at: string | null
          cancelled_at: string | null
          completed_at: string | null
          completion_notes: string | null
          completion_photo_urls: string[]
          confirmed_at: string | null
          confirmed_search_at: string | null
          created_at: string
          customer_id: string
          description: string
          estimate_ready_at: string | null
          final_price: number | null
          geo_source: string | null
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
          reviewed_at: string | null
          scheduled_at: string | null
          scope_change_customer_decision: string | null
          scope_change_description: string | null
          scope_change_price_max: number | null
          scope_change_price_min: number | null
          scope_change_reason: string | null
          service_problem_id: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          address_building?: string | null
          address_district?: string | null
          address_floor?: string | null
          address_lat?: number | null
          address_lng?: number | null
          address_unit?: string | null
          arrived_at?: string | null
          broadcast_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          completion_photo_urls?: string[]
          confirmed_at?: string | null
          confirmed_search_at?: string | null
          created_at?: string
          customer_id: string
          description: string
          estimate_ready_at?: string | null
          final_price?: number | null
          geo_source?: string | null
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
          reviewed_at?: string | null
          scheduled_at?: string | null
          scope_change_customer_decision?: string | null
          scope_change_description?: string | null
          scope_change_price_max?: number | null
          scope_change_price_min?: number | null
          scope_change_reason?: string | null
          service_problem_id?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          address_building?: string | null
          address_district?: string | null
          address_floor?: string | null
          address_lat?: number | null
          address_lng?: number | null
          address_unit?: string | null
          arrived_at?: string | null
          broadcast_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          completion_photo_urls?: string[]
          confirmed_at?: string | null
          confirmed_search_at?: string | null
          created_at?: string
          customer_id?: string
          description?: string
          estimate_ready_at?: string | null
          final_price?: number | null
          geo_source?: string | null
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
          reviewed_at?: string | null
          scheduled_at?: string | null
          scope_change_customer_decision?: string | null
          scope_change_description?: string | null
          scope_change_price_max?: number | null
          scope_change_price_min?: number | null
          scope_change_reason?: string | null
          service_problem_id?: string | null
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
            foreignKeyName: "jobs_service_problem_id_fkey"
            columns: ["service_problem_id"]
            isOneToOne: false
            referencedRelation: "service_problems"
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
      kael_chat_sessions: {
        Row: {
          abandoned_at: string | null
          created_at: string
          customer_id: string
          estimate_ready_at: string | null
          id: string
          job_id: string | null
          safe_metadata: Json
          service_type: Database["public"]["Enums"]["service_type"]
          started_at: string
          status: string
          total_cost_usd: number
          total_turns: number
          updated_at: string
        }
        Insert: {
          abandoned_at?: string | null
          created_at?: string
          customer_id: string
          estimate_ready_at?: string | null
          id?: string
          job_id?: string | null
          safe_metadata?: Json
          service_type: Database["public"]["Enums"]["service_type"]
          started_at?: string
          status?: string
          total_cost_usd?: number
          total_turns?: number
          updated_at?: string
        }
        Update: {
          abandoned_at?: string | null
          created_at?: string
          customer_id?: string
          estimate_ready_at?: string | null
          id?: string
          job_id?: string | null
          safe_metadata?: Json
          service_type?: Database["public"]["Enums"]["service_type"]
          started_at?: string
          status?: string
          total_cost_usd?: number
          total_turns?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_chat_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_chat_sessions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_chat_turns: {
        Row: {
          ai_model: string | null
          ai_provider: Database["public"]["Enums"]["api_provider"] | null
          content_type: string
          cost_usd: number | null
          created_at: string
          id: string
          latency_ms: number | null
          media_refs: string[]
          role: string
          safe_metadata: Json
          session_id: string
          text_content: string | null
          turn_index: number
        }
        Insert: {
          ai_model?: string | null
          ai_provider?: Database["public"]["Enums"]["api_provider"] | null
          content_type: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          media_refs?: string[]
          role: string
          safe_metadata?: Json
          session_id: string
          text_content?: string | null
          turn_index: number
        }
        Update: {
          ai_model?: string | null
          ai_provider?: Database["public"]["Enums"]["api_provider"] | null
          content_type?: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          media_refs?: string[]
          role?: string
          safe_metadata?: Json
          session_id?: string
          text_content?: string | null
          turn_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "kael_chat_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "kael_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_analysis_artifacts: {
        Row: {
          artifact_type: string
          confidence: number | null
          created_at: string
          id: string
          job_id: string | null
          provider: Database["public"]["Enums"]["api_provider"] | null
          safe_payload: Json
          service_problem_id: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          summary: string | null
        }
        Insert: {
          artifact_type: string
          confidence?: number | null
          created_at?: string
          id?: string
          job_id?: string | null
          provider?: Database["public"]["Enums"]["api_provider"] | null
          safe_payload?: Json
          service_problem_id?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          summary?: string | null
        }
        Update: {
          artifact_type?: string
          confidence?: number | null
          created_at?: string
          id?: string
          job_id?: string | null
          provider?: Database["public"]["Enums"]["api_provider"] | null
          safe_payload?: Json
          service_problem_id?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kael_analysis_artifacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_analysis_artifacts_service_problem_id_fkey"
            columns: ["service_problem_id"]
            isOneToOne: false
            referencedRelation: "service_problems"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_market_artifacts: {
        Row: {
          complexity: Database["public"]["Enums"]["complexity_level"]
          confidence: number | null
          created_at: string
          district_code: string
          failure_reason: string | null
          id: string
          market_range_max: number | null
          market_range_min: number | null
          problem_slug: string
          provider: Database["public"]["Enums"]["api_provider"]
          safe_metadata: Json
          service_problem_id: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          sources_summary: string | null
        }
        Insert: {
          complexity: Database["public"]["Enums"]["complexity_level"]
          confidence?: number | null
          created_at?: string
          district_code?: string
          failure_reason?: string | null
          id?: string
          market_range_max?: number | null
          market_range_min?: number | null
          problem_slug: string
          provider?: Database["public"]["Enums"]["api_provider"]
          safe_metadata?: Json
          service_problem_id?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          sources_summary?: string | null
        }
        Update: {
          complexity?: Database["public"]["Enums"]["complexity_level"]
          confidence?: number | null
          created_at?: string
          district_code?: string
          failure_reason?: string | null
          id?: string
          market_range_max?: number | null
          market_range_min?: number | null
          problem_slug?: string
          provider?: Database["public"]["Enums"]["api_provider"]
          safe_metadata?: Json
          service_problem_id?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          sources_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kael_market_artifacts_service_problem_id_fkey"
            columns: ["service_problem_id"]
            isOneToOne: false
            referencedRelation: "service_problems"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_candidates: {
        Row: {
          affected_district: string | null
          affected_problem: string | null
          affected_service: Database["public"]["Enums"]["service_type"] | null
          audit_reason: string | null
          candidate_type: string
          confidence: number
          created_at: string
          evidence_count: number
          id: string
          promoted_at: string | null
          rolled_back_at: string | null
          status: Database["public"]["Enums"]["learning_candidate_status"]
          suggested_payload: Json
          updated_at: string
        }
        Insert: {
          affected_district?: string | null
          affected_problem?: string | null
          affected_service?: Database["public"]["Enums"]["service_type"] | null
          audit_reason?: string | null
          candidate_type: string
          confidence?: number
          created_at?: string
          evidence_count?: number
          id?: string
          promoted_at?: string | null
          rolled_back_at?: string | null
          status?: Database["public"]["Enums"]["learning_candidate_status"]
          suggested_payload?: Json
          updated_at?: string
        }
        Update: {
          affected_district?: string | null
          affected_problem?: string | null
          affected_service?: Database["public"]["Enums"]["service_type"] | null
          audit_reason?: string | null
          candidate_type?: string
          confidence?: number
          created_at?: string
          evidence_count?: number
          id?: string
          promoted_at?: string | null
          rolled_back_at?: string | null
          status?: Database["public"]["Enums"]["learning_candidate_status"]
          suggested_payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      learning_rule_versions: {
        Row: {
          change_reason: string
          created_at: string
          id: string
          rule_id: string
          rule_payload: Json
          status: Database["public"]["Enums"]["learning_rule_status"]
          version: number
        }
        Insert: {
          change_reason: string
          created_at?: string
          id?: string
          rule_id: string
          rule_payload: Json
          status?: Database["public"]["Enums"]["learning_rule_status"]
          version: number
        }
        Update: {
          change_reason?: string
          created_at?: string
          id?: string
          rule_id?: string
          rule_payload?: Json
          status?: Database["public"]["Enums"]["learning_rule_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "learning_rule_versions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "learning_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_rules: {
        Row: {
          active_version: number
          affected_district: string | null
          affected_problem: string | null
          affected_service: Database["public"]["Enums"]["service_type"] | null
          confidence: number
          created_at: string
          evidence_count: number
          id: string
          rollback_available: boolean
          rule_payload: Json
          rule_type: string
          status: Database["public"]["Enums"]["learning_rule_status"]
          updated_at: string
        }
        Insert: {
          active_version?: number
          affected_district?: string | null
          affected_problem?: string | null
          affected_service?: Database["public"]["Enums"]["service_type"] | null
          confidence?: number
          created_at?: string
          evidence_count?: number
          id?: string
          rollback_available?: boolean
          rule_payload?: Json
          rule_type: string
          status?: Database["public"]["Enums"]["learning_rule_status"]
          updated_at?: string
        }
        Update: {
          active_version?: number
          affected_district?: string | null
          affected_problem?: string | null
          affected_service?: Database["public"]["Enums"]["service_type"] | null
          confidence?: number
          created_at?: string
          evidence_count?: number
          id?: string
          rollback_available?: boolean
          rule_payload?: Json
          rule_type?: string
          status?: Database["public"]["Enums"]["learning_rule_status"]
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          channel: string
          created_at: string
          event_type: string
          id: string
          job_id: string | null
          read_at: string | null
          safe_metadata: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          title: string
          user_id: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          event_type: string
          id?: string
          job_id?: string | null
          read_at?: string | null
          safe_metadata?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          job_id?: string | null
          read_at?: string | null
          safe_metadata?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_baselines: {
        Row: {
          complexity: Database["public"]["Enums"]["complexity_level"]
          created_at: string
          district_code: string
          id: string
          price_max: number
          price_min: number
          service_problem_id: string
          service_type: Database["public"]["Enums"]["service_type"]
          source: string
          updated_at: string
          version: number
        }
        Insert: {
          complexity: Database["public"]["Enums"]["complexity_level"]
          created_at?: string
          district_code?: string
          id?: string
          price_max: number
          price_min: number
          service_problem_id: string
          service_type: Database["public"]["Enums"]["service_type"]
          source?: string
          updated_at?: string
          version?: number
        }
        Update: {
          complexity?: Database["public"]["Enums"]["complexity_level"]
          created_at?: string
          district_code?: string
          id?: string
          price_max?: number
          price_min?: number
          service_problem_id?: string
          service_type?: Database["public"]["Enums"]["service_type"]
          source?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_baselines_service_problem_id_fkey"
            columns: ["service_problem_id"]
            isOneToOne: false
            referencedRelation: "service_problems"
            referencedColumns: ["id"]
          },
        ]
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
      scope_change_requests: {
        Row: {
          created_at: string
          customer_decision_at: string | null
          evidence_photo_urls: string[]
          id: string
          job_id: string
          kael_computed_max: number | null
          kael_computed_min: number | null
          kael_review: Json | null
          original_summary: string | null
          price_max: number | null
          price_min: number | null
          reason: string
          requested_description: string
          status: Database["public"]["Enums"]["scope_change_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          customer_decision_at?: string | null
          evidence_photo_urls?: string[]
          id?: string
          job_id: string
          kael_computed_max?: number | null
          kael_computed_min?: number | null
          kael_review?: Json | null
          original_summary?: string | null
          price_max?: number | null
          price_min?: number | null
          reason: string
          requested_description: string
          status?: Database["public"]["Enums"]["scope_change_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          customer_decision_at?: string | null
          evidence_photo_urls?: string[]
          id?: string
          job_id?: string
          kael_computed_max?: number | null
          kael_computed_min?: number | null
          kael_review?: Json | null
          original_summary?: string | null
          price_max?: number | null
          price_min?: number | null
          reason?: string
          requested_description?: string
          status?: Database["public"]["Enums"]["scope_change_status"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_change_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_change_requests_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label_vi: string
          service_type: Database["public"]["Enums"]["service_type"]
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label_vi: string
          service_type: Database["public"]["Enums"]["service_type"]
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label_vi?: string
          service_type?: Database["public"]["Enums"]["service_type"]
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      service_knowledge_boxes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label_vi: string
          purpose: string
          safe_metadata: Json
          service_type: Database["public"]["Enums"]["service_type"]
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label_vi: string
          purpose: string
          safe_metadata?: Json
          service_type: Database["public"]["Enums"]["service_type"]
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label_vi?: string
          purpose?: string
          safe_metadata?: Json
          service_type?: Database["public"]["Enums"]["service_type"]
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_problems: {
        Row: {
          created_at: string
          default_complexity: Database["public"]["Enums"]["complexity_level"]
          id: string
          is_active: boolean
          label_vi: string
          service_category_id: string
          service_type: Database["public"]["Enums"]["service_type"]
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_complexity?: Database["public"]["Enums"]["complexity_level"]
          id?: string
          is_active?: boolean
          label_vi: string
          service_category_id: string
          service_type: Database["public"]["Enums"]["service_type"]
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_complexity?: Database["public"]["Enums"]["complexity_level"]
          id?: string
          is_active?: boolean
          label_vi?: string
          service_category_id?: string
          service_type?: Database["public"]["Enums"]["service_type"]
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_problems_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_cancellation_requests: {
        Row: {
          admin_decision_at: string | null
          admin_decision_by: string | null
          created_at: string
          evidence_photo_urls: string[]
          id: string
          job_id: string
          kael_review: Json | null
          reason: string
          review_note: string | null
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          admin_decision_at?: string | null
          admin_decision_by?: string | null
          created_at?: string
          evidence_photo_urls?: string[]
          id?: string
          job_id: string
          kael_review?: Json | null
          reason: string
          review_note?: string | null
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          admin_decision_at?: string | null
          admin_decision_by?: string | null
          created_at?: string
          evidence_photo_urls?: string[]
          id?: string
          job_id?: string
          kael_review?: Json | null
          reason?: string
          review_note?: string | null
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_cancellation_requests_admin_decision_by_fkey"
            columns: ["admin_decision_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_cancellation_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_cancellation_requests_worker_id_fkey"
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
          date_of_birth: string | null
          districts: string[]
          gender: string | null
          home_lat: number | null
          home_lng: number | null
          id: string
          is_approved: boolean
          is_available: boolean
          is_suspended: boolean
          legal_name: string | null
          problem_specializations: string[]
          rating: number
          selfie_url: string | null
          service_radius_km: number
          service_types: Database["public"]["Enums"]["service_type"][]
          total_jobs: number
          updated_at: string
          verification_status: Database["public"]["Enums"]["worker_verification_status"]
          years_experience: number
        }
        Insert: {
          bank_account?: string | null
          bank_name?: string | null
          cccd_back_url?: string | null
          cccd_front_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          districts?: string[]
          gender?: string | null
          home_lat?: number | null
          home_lng?: number | null
          id: string
          is_approved?: boolean
          is_available?: boolean
          is_suspended?: boolean
          legal_name?: string | null
          problem_specializations?: string[]
          rating?: number
          selfie_url?: string | null
          service_radius_km?: number
          service_types?: Database["public"]["Enums"]["service_type"][]
          total_jobs?: number
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["worker_verification_status"]
          years_experience?: number
        }
        Update: {
          bank_account?: string | null
          bank_name?: string | null
          cccd_back_url?: string | null
          cccd_front_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          districts?: string[]
          gender?: string | null
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          is_approved?: boolean
          is_available?: boolean
          is_suspended?: boolean
          legal_name?: string | null
          problem_specializations?: string[]
          rating?: number
          selfie_url?: string | null
          service_radius_km?: number
          service_types?: Database["public"]["Enums"]["service_type"][]
          total_jobs?: number
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["worker_verification_status"]
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
      accept_broadcast_atomic: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: {
          address_building: string
          address_district: string
          address_floor: string
          address_unit: string
          error_code: string
          job_status: Database["public"]["Enums"]["job_status"]
          ok: boolean
        }[]
      }
      cancel_job_before_accept_atomic: {
        Args: { p_customer_id: string; p_job_id: string }
        Returns: {
          cancelled_at_ts: string
          error_code: string
          job_status: Database["public"]["Enums"]["job_status"]
          ok: boolean
        }[]
      }
      confirm_kael_chat_atomic: {
        Args: { p_customer_id: string; p_session_id: string }
        Returns: {
          district_code: string | null
          error_code: string | null
          job_id: string | null
          job_status: Database["public"]["Enums"]["job_status"] | null
          ok: boolean
          service_type: Database["public"]["Enums"]["service_type"] | null
        }[]
      }
      decide_scope_change_atomic: {
        Args: {
          p_customer_id: string
          p_decision: string
          p_scope_change_id: string
        }
        Returns: {
          decided_at_ts: string
          error_code: string
          job_id_out: string
          ok: boolean
          scope_status: Database["public"]["Enums"]["scope_change_status"]
        }[]
      }
      decide_worker_cancellation_atomic: {
        Args: {
          p_admin_id: string
          p_cancellation_id: string
          p_decision: string
          p_review_note?: string
        }
        Returns: {
          cancellation_status: string
          decided_at_ts: string
          district_code: string
          error_code: string
          job_id_out: string
          job_status: Database["public"]["Enums"]["job_status"]
          ok: boolean
          service_type_out: Database["public"]["Enums"]["service_type"]
          worker_id_out: string
        }[]
      }
      distance_km: {
        Args: { lat1: number; lng1: number; lat2: number; lng2: number }
        Returns: number | null
      }
      insert_notification_atomic: {
        Args: {
          p_body: string
          p_event_type: string
          p_job_id: string
          p_safe_metadata?: Json
          p_title: string
          p_user_id: string
        }
        Returns: {
          created_at_ts: string
          notification_id: string
        }[]
      }
      register_device_push_token_atomic: {
        Args: {
          p_permission_status: string
          p_platform: string
          p_push_token: string
          p_safe_metadata?: Json
          p_user_id: string
        }
        Returns: {
          enabled_out: boolean
          token_id: string
          updated_at_ts: string
        }[]
      }
      request_scope_change_atomic: {
        Args: {
          p_evidence_photo_urls: string[]
          p_job_id: string
          p_kael_computed_max: number
          p_kael_computed_min: number
          p_kael_review: Json
          p_worker_id: string
          p_new_description: string
          p_reason: string
        }
        Returns: {
          created_at_ts: string
          error_code: string
          ok: boolean
          scope_change_id: string
          scope_status: Database["public"]["Enums"]["scope_change_status"]
        }[]
      }
      request_worker_cancellation_atomic: {
        Args: {
          p_evidence_photo_urls?: string[]
          p_job_id: string
          p_reason: string
          p_worker_id: string
        }
        Returns: {
          cancellation_id: string
          cancellation_status: string
          created_at_ts: string
          district_code: string | null
          error_code: string | null
          job_id_out: string
          job_status: Database["public"]["Enums"]["job_status"] | null
          ok: boolean
          service_type_out: Database["public"]["Enums"]["service_type"] | null
          worker_id_out: string | null
        }[]
      }
      set_worker_availability_atomic: {
        Args: { p_is_available: boolean; p_worker_id: string }
        Returns: {
          error_code: string
          is_available: boolean
          ok: boolean
          updated_at_ts: string
        }[]
      }
      submit_review_atomic: {
        Args: {
          p_comment: string
          p_customer_id: string
          p_job_id: string
          p_rating: number
          p_tags: string[]
        }
        Returns: {
          error_code: string
          job_status: Database["public"]["Enums"]["job_status"]
          ok: boolean
          review_id: string
          reviewed_at_ts: string
        }[]
      }
    }
    Enums: {
      api_provider: "anthropic" | "perplexity" | "deepseek"
      broadcast_status:
        | "pending"
        | "sent"
        | "accepted"
        | "declined"
        | "expired"
        | "reassigned"
        | "cancelled"
      complexity_level: "small" | "medium" | "large"
      job_status:
        | "draft"
        | "analyzing"
        | "estimate_ready"
        | "awaiting_customer_confirm"
        | "broadcasting"
        | "worker_matched"
        | "worker_on_way"
        | "arrived"
        | "inspecting"
        | "repairing"
        | "scope_change_pending"
        | "completed_by_worker"
        | "confirmed_by_customer"
        | "payment_pending"
        | "paid"
        | "reviewed"
        | "cancelled"
      learning_candidate_status:
        | "created"
        | "pending_evidence"
        | "evidence_gate_passed"
        | "auto_promoted"
        | "rejected"
        | "rolled_back"
        | "archived"
      learning_rule_status:
        | "draft"
        | "active"
        | "monitoring"
        | "degraded"
        | "disabled"
        | "rolled_back"
      message_sender: "customer" | "worker" | "kael"
      notification_status:
        | "created"
        | "queued"
        | "sent"
        | "failed"
        | "read"
        | "archived"
      scope_change_status:
        | "requested_by_worker"
        | "reviewing_by_kael"
        | "waiting_customer_decision"
        | "approved_by_customer"
        | "rejected_by_customer"
        | "cancelled"
      service_type: "electrical" | "plumbing" | "cleaning"
      user_role: "customer" | "worker" | "admin"
      worker_verification_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "suspended"
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
      broadcast_status: [
        "pending",
        "sent",
        "accepted",
        "declined",
        "expired",
        "reassigned",
        "cancelled",
      ],
      complexity_level: ["small", "medium", "large"],
      job_status: [
        "draft",
        "analyzing",
        "estimate_ready",
        "awaiting_customer_confirm",
        "broadcasting",
        "worker_matched",
        "worker_on_way",
        "arrived",
        "inspecting",
        "repairing",
        "scope_change_pending",
        "completed_by_worker",
        "confirmed_by_customer",
        "payment_pending",
        "paid",
        "reviewed",
        "cancelled",
      ],
      learning_candidate_status: [
        "created",
        "pending_evidence",
        "evidence_gate_passed",
        "auto_promoted",
        "rejected",
        "rolled_back",
        "archived",
      ],
      learning_rule_status: [
        "draft",
        "active",
        "monitoring",
        "degraded",
        "disabled",
        "rolled_back",
      ],
      message_sender: ["customer", "worker", "kael"],
      notification_status: [
        "created",
        "queued",
        "sent",
        "failed",
        "read",
        "archived",
      ],
      scope_change_status: [
        "requested_by_worker",
        "reviewing_by_kael",
        "waiting_customer_decision",
        "approved_by_customer",
        "rejected_by_customer",
        "cancelled",
      ],
      service_type: ["electrical", "plumbing", "cleaning"],
      user_role: ["customer", "worker", "admin"],
      worker_verification_status: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "suspended",
      ],
    },
  },
} as const
