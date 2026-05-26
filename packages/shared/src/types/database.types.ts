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
      ai_provider_routing: {
        Row: {
          cost_ceiling_usd: number
          created_at: string
          daily_provider_cap_usd: number
          fallback_model: string | null
          fallback_provider: Database["public"]["Enums"]["api_provider"] | null
          is_enabled: boolean
          latency_budget_ms: number
          primary_model: string
          primary_provider: Database["public"]["Enums"]["api_provider"]
          purpose: string
          safe_metadata: Json
          updated_at: string
          user_visible: boolean
        }
        Insert: {
          cost_ceiling_usd: number
          created_at?: string
          daily_provider_cap_usd?: number
          fallback_model?: string | null
          fallback_provider?: Database["public"]["Enums"]["api_provider"] | null
          is_enabled?: boolean
          latency_budget_ms: number
          primary_model: string
          primary_provider: Database["public"]["Enums"]["api_provider"]
          purpose: string
          safe_metadata?: Json
          updated_at?: string
          user_visible?: boolean
        }
        Update: {
          cost_ceiling_usd?: number
          created_at?: string
          daily_provider_cap_usd?: number
          fallback_model?: string | null
          fallback_provider?: Database["public"]["Enums"]["api_provider"] | null
          is_enabled?: boolean
          latency_budget_ms?: number
          primary_model?: string
          primary_provider?: Database["public"]["Enums"]["api_provider"]
          purpose?: string
          safe_metadata?: Json
          updated_at?: string
          user_visible?: boolean
        }
        Relationships: []
      }
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
          purpose: string
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
          purpose: string
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
          purpose?: string
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
      customer_kael_memory: {
        Row: {
          created_at: string
          customer_id: string
          home_context: Json
          language: string
          last_observed_at: string | null
          memory_version: number
          preference_summary: string
          safe_metadata: Json
          service_preferences: Json
          trust_signals: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          home_context?: Json
          language?: string
          last_observed_at?: string | null
          memory_version?: number
          preference_summary?: string
          safe_metadata?: Json
          service_preferences?: Json
          trust_signals?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          home_context?: Json
          language?: string
          last_observed_at?: string | null
          memory_version?: number
          preference_summary?: string
          safe_metadata?: Json
          service_preferences?: Json
          trust_signals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_kael_memory_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
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
      customer_cancellation_reason_taxonomy: {
        Row: {
          admin_tunable: boolean
          category: string
          code: string
          created_at: string
          is_active: boolean
          label_vi: string
          safe_metadata: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          admin_tunable?: boolean
          category: string
          code: string
          created_at?: string
          is_active?: boolean
          label_vi: string
          safe_metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          admin_tunable?: boolean
          category?: string
          code?: string
          created_at?: string
          is_active?: boolean
          label_vi?: string
          safe_metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_cancellation_records: {
        Row: {
          abuse_signals: string[]
          admin_review_required: boolean
          created_at: string
          customer_id: string
          id: string
          job_id: string
          phase0_no_monetary_penalty: boolean
          reason_category: string
          reason_code: string
          reason_note: string | null
          safe_metadata: Json
          status: string
          sub_case: string
          updated_at: string
          worker_goodwill: Json
          worker_id: string | null
        }
        Insert: {
          abuse_signals?: string[]
          admin_review_required?: boolean
          created_at?: string
          customer_id: string
          id?: string
          job_id: string
          phase0_no_monetary_penalty?: boolean
          reason_category: string
          reason_code: string
          reason_note?: string | null
          safe_metadata?: Json
          status?: string
          sub_case: string
          updated_at?: string
          worker_goodwill?: Json
          worker_id?: string | null
        }
        Update: {
          abuse_signals?: string[]
          admin_review_required?: boolean
          created_at?: string
          customer_id?: string
          id?: string
          job_id?: string
          phase0_no_monetary_penalty?: boolean
          reason_category?: string
          reason_code?: string
          reason_note?: string | null
          safe_metadata?: Json
          status?: string
          sub_case?: string
          updated_at?: string
          worker_goodwill?: Json
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_cancellation_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_cancellation_records_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_cancellation_records_reason_code_fkey"
            columns: ["reason_code"]
            isOneToOne: false
            referencedRelation: "customer_cancellation_reason_taxonomy"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "customer_cancellation_records_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_snapshots: {
        Row: {
          created_at: string
          evidence_locked_at: string
          evidence_snapshot: Json
          id: string
          job_id: string
        }
        Insert: {
          created_at?: string
          evidence_locked_at?: string
          evidence_snapshot?: Json
          id?: string
          job_id: string
        }
        Update: {
          created_at?: string
          evidence_locked_at?: string
          evidence_snapshot?: Json
          id?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_snapshots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          abuse_signals: string[]
          admin_decision: Json | null
          admin_decision_at: string | null
          admin_decision_by: string | null
          admin_review: Json
          counter_party_id: string | null
          counter_party_response_deadline: string
          counter_party_statement: string | null
          created_at: string
          dispute_type: string
          evidence_locked_at: string
          evidence_snapshot_id: string
          id: string
          initiated_by: string
          initiated_by_id: string
          initiator_statement: string
          job_id: string
          kael_neutral_summary: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          abuse_signals?: string[]
          admin_decision?: Json | null
          admin_decision_at?: string | null
          admin_decision_by?: string | null
          admin_review?: Json
          counter_party_id?: string | null
          counter_party_response_deadline: string
          counter_party_statement?: string | null
          created_at?: string
          dispute_type: string
          evidence_locked_at?: string
          evidence_snapshot_id: string
          id?: string
          initiated_by: string
          initiated_by_id: string
          initiator_statement: string
          job_id: string
          kael_neutral_summary: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          abuse_signals?: string[]
          admin_decision?: Json | null
          admin_decision_at?: string | null
          admin_decision_by?: string | null
          admin_review?: Json
          counter_party_id?: string | null
          counter_party_response_deadline?: string
          counter_party_statement?: string | null
          created_at?: string
          dispute_type?: string
          evidence_locked_at?: string
          evidence_snapshot_id?: string
          id?: string
          initiated_by?: string
          initiated_by_id?: string
          initiator_statement?: string
          job_id?: string
          kael_neutral_summary?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_admin_decision_by_fkey"
            columns: ["admin_decision_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_counter_party_id_fkey"
            columns: ["counter_party_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_evidence_snapshot_id_fkey"
            columns: ["evidence_snapshot_id"]
            isOneToOne: false
            referencedRelation: "evidence_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_initiated_by_id_fkey"
            columns: ["initiated_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
          kael_estimate_card_v3: Json | null
          kael_price_max: number | null
          kael_price_min: number | null
          kael_problem_identified: string | null
          kael_progress: Json | null
          kael_worker_brief_core: Json | null
          kael_worker_brief_guidance: Json | null
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
          kael_estimate_card_v3?: Json | null
          kael_price_max?: number | null
          kael_price_min?: number | null
          kael_problem_identified?: string | null
          kael_progress?: Json | null
          kael_worker_brief_core?: Json | null
          kael_worker_brief_guidance?: Json | null
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
          kael_estimate_card_v3?: Json | null
          kael_price_max?: number | null
          kael_price_min?: number | null
          kael_problem_identified?: string | null
          kael_progress?: Json | null
          kael_worker_brief_core?: Json | null
          kael_worker_brief_guidance?: Json | null
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
      kael_ab_experiments: {
        Row: {
          comparison_provider: Database["public"]["Enums"]["api_provider"]
          created_at: string
          ended_at: string | null
          experiment_key: string
          fallback_provider: Database["public"]["Enums"]["api_provider"] | null
          id: string
          metric_thresholds: Json
          primary_provider: Database["public"]["Enums"]["api_provider"]
          purpose: string
          safe_metadata: Json
          sample_target: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          comparison_provider: Database["public"]["Enums"]["api_provider"]
          created_at?: string
          ended_at?: string | null
          experiment_key: string
          fallback_provider?: Database["public"]["Enums"]["api_provider"] | null
          id?: string
          metric_thresholds?: Json
          primary_provider: Database["public"]["Enums"]["api_provider"]
          purpose: string
          safe_metadata?: Json
          sample_target?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          comparison_provider?: Database["public"]["Enums"]["api_provider"]
          created_at?: string
          ended_at?: string | null
          experiment_key?: string
          fallback_provider?: Database["public"]["Enums"]["api_provider"] | null
          id?: string
          metric_thresholds?: Json
          primary_provider?: Database["public"]["Enums"]["api_provider"]
          purpose?: string
          safe_metadata?: Json
          sample_target?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      kael_ab_price_synthesis_cases: {
        Row: {
          actual_final_price: number | null
          anthropic_price_max: number | null
          anthropic_price_min: number | null
          anthropic_schema_valid: boolean | null
          case_key: string
          created_at: string
          district_code: string | null
          exclusion_reason: string | null
          experiment_id: string
          fallback_used: boolean
          id: string
          job_id: string | null
          perplexity_price_max: number | null
          perplexity_price_min: number | null
          perplexity_schema_valid: boolean | null
          problem_slug: string | null
          request_id: string | null
          safe_metadata: Json
          service_type: Database["public"]["Enums"]["service_type"] | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          actual_final_price?: number | null
          anthropic_price_max?: number | null
          anthropic_price_min?: number | null
          anthropic_schema_valid?: boolean | null
          case_key: string
          created_at?: string
          district_code?: string | null
          exclusion_reason?: string | null
          experiment_id: string
          fallback_used?: boolean
          id?: string
          job_id?: string | null
          perplexity_price_max?: number | null
          perplexity_price_min?: number | null
          perplexity_schema_valid?: boolean | null
          problem_slug?: string | null
          request_id?: string | null
          safe_metadata?: Json
          service_type?: Database["public"]["Enums"]["service_type"] | null
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          actual_final_price?: number | null
          anthropic_price_max?: number | null
          anthropic_price_min?: number | null
          anthropic_schema_valid?: boolean | null
          case_key?: string
          created_at?: string
          district_code?: string | null
          exclusion_reason?: string | null
          experiment_id?: string
          fallback_used?: boolean
          id?: string
          job_id?: string | null
          perplexity_price_max?: number | null
          perplexity_price_min?: number | null
          perplexity_schema_valid?: boolean | null
          problem_slug?: string | null
          request_id?: string | null
          safe_metadata?: Json
          service_type?: Database["public"]["Enums"]["service_type"] | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_ab_price_synthesis_cases_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "kael_ab_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_ab_price_synthesis_cases_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_optimization_metrics: {
        Row: {
          cost_actual: number | null
          cost_before_estimate: number | null
          cost_delta_estimate: number
          created_at: string
          enabled_options: string[]
          id: string
          input_tokens: number | null
          job_id: string | null
          latency_ms: number | null
          metric_source: string
          model: string | null
          option_flags: Json
          output_tokens: number | null
          provider: Database["public"]["Enums"]["api_provider"]
          purpose: string
          quality_pass: boolean | null
          quality_signal: string | null
          request_id: string | null
          safe_metadata: Json
        }
        Insert: {
          cost_actual?: number | null
          cost_before_estimate?: number | null
          created_at?: string
          enabled_options?: string[]
          id?: string
          input_tokens?: number | null
          job_id?: string | null
          latency_ms?: number | null
          metric_source?: string
          model?: string | null
          option_flags?: Json
          output_tokens?: number | null
          provider: Database["public"]["Enums"]["api_provider"]
          purpose: string
          quality_pass?: boolean | null
          quality_signal?: string | null
          request_id?: string | null
          safe_metadata?: Json
        }
        Update: {
          cost_actual?: number | null
          cost_before_estimate?: number | null
          created_at?: string
          enabled_options?: string[]
          id?: string
          input_tokens?: number | null
          job_id?: string | null
          latency_ms?: number | null
          metric_source?: string
          model?: string | null
          option_flags?: Json
          output_tokens?: number | null
          provider?: Database["public"]["Enums"]["api_provider"]
          purpose?: string
          quality_pass?: boolean | null
          quality_signal?: string | null
          request_id?: string | null
          safe_metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "kael_optimization_metrics_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_admin_queue: {
        Row: {
          actor_id: string | null
          actor_role: string
          created_at: string
          escalation_level: string
          id: string
          job_id: string | null
          priority: string
          queue_type: string
          reason_code: string
          response_summary: string | null
          safe_metadata: Json
          status: string
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          actor_role: string
          created_at?: string
          escalation_level: string
          id?: string
          job_id?: string | null
          priority: string
          queue_type: string
          reason_code: string
          response_summary?: string | null
          safe_metadata?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          escalation_level?: string
          id?: string
          job_id?: string | null
          priority?: string
          queue_type?: string
          reason_code?: string
          response_summary?: string | null
          safe_metadata?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_admin_queue_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_admin_queue_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_advisory_audit: {
        Row: {
          actor_id: string | null
          advisory_type: string
          artifact_id: string | null
          created_at: string
          id: string
          job_id: string | null
          purpose: string
          safe_metadata: Json
          template_key: string | null
        }
        Insert: {
          actor_id?: string | null
          advisory_type: string
          artifact_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          purpose: string
          safe_metadata?: Json
          template_key?: string | null
        }
        Update: {
          actor_id?: string | null
          advisory_type?: string
          artifact_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          purpose?: string
          safe_metadata?: Json
          template_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kael_advisory_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_advisory_audit_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
      kael_charter_audit: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          charter_version: string
          created_at: string
          file_name: string
          id: string
          operation: string
          safe_metadata: Json
          status: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          charter_version: string
          created_at?: string
          file_name: string
          id?: string
          operation: string
          safe_metadata?: Json
          status: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          charter_version?: string
          created_at?: string
          file_name?: string
          id?: string
          operation?: string
          safe_metadata?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_charter_audit_actor_id_fkey"
            columns: ["actor_id"]
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
      kael_interaction_log: {
        Row: {
          actor_id: string | null
          actor_role: string
          created_at: string
          escalation_level: string
          expected_nuance: string
          id: string
          interaction_type: string
          job_id: string | null
          legitimate_concern_signals: string[]
          nuance: string
          pressure_signals: string[]
          safe_metadata: Json
          sanitized_excerpt: string
          strategy_ids: string[]
        }
        Insert: {
          actor_id?: string | null
          actor_role: string
          created_at?: string
          escalation_level: string
          expected_nuance: string
          id?: string
          interaction_type: string
          job_id?: string | null
          legitimate_concern_signals?: string[]
          nuance: string
          pressure_signals?: string[]
          safe_metadata?: Json
          sanitized_excerpt: string
          strategy_ids?: string[]
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          escalation_level?: string
          expected_nuance?: string
          id?: string
          interaction_type?: string
          job_id?: string | null
          legitimate_concern_signals?: string[]
          nuance?: string
          pressure_signals?: string[]
          safe_metadata?: Json
          sanitized_excerpt?: string
          strategy_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "kael_interaction_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_interaction_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
      kael_memory_archive: {
        Row: {
          archived_from: string
          archived_reason: string
          created_at: string
          id: string
          memory_payload: Json
          subject_id: string | null
          subject_type: string
        }
        Insert: {
          archived_from: string
          archived_reason: string
          created_at?: string
          id?: string
          memory_payload: Json
          subject_id?: string | null
          subject_type: string
        }
        Update: {
          archived_from?: string
          archived_reason?: string
          created_at?: string
          id?: string
          memory_payload?: Json
          subject_id?: string | null
          subject_type?: string
        }
        Relationships: []
      }
      kael_memory_audit: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          layer: string
          operation: string
          purpose: string
          safe_metadata: Json
          subject_id: string | null
          subject_type: string
          token_count: number | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          layer: string
          operation: string
          purpose: string
          safe_metadata?: Json
          subject_id?: string | null
          subject_type: string
          token_count?: number | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          layer?: string
          operation?: string
          purpose?: string
          safe_metadata?: Json
          subject_id?: string | null
          subject_type?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kael_memory_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_permission_audit: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          created_at: string
          decision: string
          id: string
          job_id: string | null
          purpose: string
          reason_code: string
          safe_metadata: Json
          topic: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role: string
          created_at?: string
          decision: string
          id?: string
          job_id?: string | null
          purpose: string
          reason_code: string
          safe_metadata?: Json
          topic?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          decision?: string
          id?: string
          job_id?: string | null
          purpose?: string
          reason_code?: string
          safe_metadata?: Json
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kael_permission_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_permission_audit_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_quality_baseline: {
        Row: {
          advisory_accuracy_score: number | null
          api_log_count: number
          avg_review_rating: number | null
          baseline_key: string
          cost_summary: Json
          created_at: string
          id: string
          job_count: number
          provider_breakdown: Json
          purpose_breakdown: Json
          safe_metadata: Json
          sample_ended_at: string | null
          sample_size: number
          sample_started_at: string | null
          schema_validation_rate: number | null
          source: string
          updated_at: string
          vietnamese_tone_score: number | null
        }
        Insert: {
          advisory_accuracy_score?: number | null
          api_log_count?: number
          avg_review_rating?: number | null
          baseline_key: string
          cost_summary?: Json
          created_at?: string
          id?: string
          job_count?: number
          provider_breakdown?: Json
          purpose_breakdown?: Json
          safe_metadata?: Json
          sample_ended_at?: string | null
          sample_size: number
          sample_started_at?: string | null
          schema_validation_rate?: number | null
          source: string
          updated_at?: string
          vietnamese_tone_score?: number | null
        }
        Update: {
          advisory_accuracy_score?: number | null
          api_log_count?: number
          avg_review_rating?: number | null
          baseline_key?: string
          cost_summary?: Json
          created_at?: string
          id?: string
          job_count?: number
          provider_breakdown?: Json
          purpose_breakdown?: Json
          safe_metadata?: Json
          sample_ended_at?: string | null
          sample_size?: number
          sample_started_at?: string | null
          schema_validation_rate?: number | null
          source?: string
          updated_at?: string
          vietnamese_tone_score?: number | null
        }
        Relationships: []
      }
      kael_rule_application_log: {
        Row: {
          accuracy_delta: number | null
          actor_id: string | null
          actor_role: string | null
          applied_count: number
          applied_target: string
          candidate_id: string | null
          created_at: string
          id: string
          job_id: string | null
          override_count: number
          rule_id: string | null
          safe_metadata: Json
          satisfaction_delta: number | null
          skill_id: string
        }
        Insert: {
          accuracy_delta?: number | null
          actor_id?: string | null
          actor_role?: string | null
          applied_count?: number
          applied_target: string
          candidate_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          override_count?: number
          rule_id?: string | null
          safe_metadata?: Json
          satisfaction_delta?: number | null
          skill_id: string
        }
        Update: {
          accuracy_delta?: number | null
          actor_id?: string | null
          actor_role?: string | null
          applied_count?: number
          applied_target?: string
          candidate_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          override_count?: number
          rule_id?: string | null
          safe_metadata?: Json
          satisfaction_delta?: number | null
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_rule_application_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_rule_application_log_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "learning_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_rule_application_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_rule_application_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "learning_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_rule_lifecycle_log: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          candidate_id: string | null
          created_at: string
          id: string
          job_id: string | null
          next_state: string
          previous_state: string | null
          rule_id: string | null
          safe_metadata: Json
          skill_id: string
          transition_reason: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          candidate_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          next_state: string
          previous_state?: string | null
          rule_id?: string | null
          safe_metadata?: Json
          skill_id: string
          transition_reason: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          candidate_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          next_state?: string
          previous_state?: string | null
          rule_id?: string | null
          safe_metadata?: Json
          skill_id?: string
          transition_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_rule_lifecycle_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_rule_lifecycle_log_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "learning_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_rule_lifecycle_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_rule_lifecycle_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "learning_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_worker_qa_log: {
        Row: {
          answer: Json
          created_at: string
          id: string
          job_id: string
          question: string
          worker_id: string
        }
        Insert: {
          answer: Json
          created_at?: string
          id?: string
          job_id: string
          question: string
          worker_id: string
        }
        Update: {
          answer?: Json
          created_at?: string
          id?: string
          job_id?: string
          question?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_worker_qa_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_worker_qa_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      legal_awareness_patterns: {
        Row: {
          boundary_type: string
          created_at: string
          id: string
          is_enabled: boolean
          pattern_key: string
          response_guidance: string
          safe_metadata: Json
          topic: string
          updated_at: string
        }
        Insert: {
          boundary_type: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          pattern_key: string
          response_guidance: string
          safe_metadata?: Json
          topic: string
          updated_at?: string
        }
        Update: {
          boundary_type?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          pattern_key?: string
          response_guidance?: string
          safe_metadata?: Json
          topic?: string
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
          admin_review_required: boolean
          abuse_signals: string[]
          created_at: string
          evidence_photo_urls: string[]
          fallback_options: Json
          id: string
          job_id: string
          kael_review: Json | null
          reason: string
          reason_category: string | null
          reason_code: string | null
          review_note: string | null
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          admin_decision_at?: string | null
          admin_decision_by?: string | null
          admin_review_required?: boolean
          abuse_signals?: string[]
          created_at?: string
          evidence_photo_urls?: string[]
          fallback_options?: Json
          id?: string
          job_id: string
          kael_review?: Json | null
          reason: string
          reason_category?: string | null
          reason_code?: string | null
          review_note?: string | null
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          admin_decision_at?: string | null
          admin_decision_by?: string | null
          admin_review_required?: boolean
          abuse_signals?: string[]
          created_at?: string
          evidence_photo_urls?: string[]
          fallback_options?: Json
          id?: string
          job_id?: string
          kael_review?: Json | null
          reason?: string
          reason_category?: string | null
          reason_code?: string | null
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
            foreignKeyName: "worker_cancellation_requests_reason_code_fkey"
            columns: ["reason_code"]
            isOneToOne: false
            referencedRelation: "worker_cancellation_reason_taxonomy"
            referencedColumns: ["code"]
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
      worker_cancellation_reason_taxonomy: {
        Row: {
          admin_tunable: boolean
          category: string
          code: string
          created_at: string
          is_active: boolean
          label_vi: string
          safe_metadata: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          admin_tunable?: boolean
          category: string
          code: string
          created_at?: string
          is_active?: boolean
          label_vi: string
          safe_metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          admin_tunable?: boolean
          category?: string
          code?: string
          created_at?: string
          is_active?: boolean
          label_vi?: string
          safe_metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      worker_kael_memory: {
        Row: {
          archived_at: string | null
          created_at: string
          language: string
          last_observed_at: string | null
          memory_version: number
          red_flags: Json
          reliability_signals: Json
          safe_metadata: Json
          service_skill_proficiency: Json
          service_skill_summary: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          language?: string
          last_observed_at?: string | null
          memory_version?: number
          red_flags?: Json
          reliability_signals?: Json
          safe_metadata?: Json
          service_skill_proficiency?: Json
          service_skill_summary?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          language?: string
          last_observed_at?: string | null
          memory_version?: number
          red_flags?: Json
          reliability_signals?: Json
          safe_metadata?: Json
          service_skill_proficiency?: Json
          service_skill_summary?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_kael_memory_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
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
      worker_safety_patterns: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          pattern_key: string
          response_guidance: string
          safe_metadata: Json
          service_type: string
          severity: string
          trigger_topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          pattern_key: string
          response_guidance: string
          safe_metadata?: Json
          service_type: string
          severity?: string
          trigger_topic: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          pattern_key?: string
          response_guidance?: string
          safe_metadata?: Json
          service_type?: string
          severity?: string
          trigger_topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      worker_scope_change_stats: {
        Row: {
          last_scope_change_at: string | null
          scope_change_rate: number
          scope_change_requests: number
          total_completed_jobs: number
          updated_at: string
          worker_id: string
        }
        Insert: {
          last_scope_change_at?: string | null
          scope_change_rate?: number
          scope_change_requests?: number
          total_completed_jobs?: number
          updated_at?: string
          worker_id: string
        }
        Update: {
          last_scope_change_at?: string | null
          scope_change_rate?: number
          scope_change_requests?: number
          total_completed_jobs?: number
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_scope_change_stats_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      kael_cost_daily_summary: {
        Row: {
          avg_cost_per_call_usd: number | null
          avg_input_tokens: number | null
          avg_latency_ms: number | null
          avg_output_tokens: number | null
          call_count: number | null
          day: string | null
          failure_count: number | null
          failure_rate: number | null
          fallback_count: number | null
          p95_latency_ms: number | null
          provider: Database["public"]["Enums"]["api_provider"] | null
          purpose: string | null
          success_count: number | null
          total_cost_usd: number | null
        }
        Relationships: []
      }
      kael_cost_projection_daily: {
        Row: {
          cost_per_job_usd: number | null
          day: string | null
          observed_calls: number | null
          observed_cost_usd: number | null
          observed_jobs: number | null
          projected_10000_jobs_usd: number | null
          projected_1000_jobs_usd: number | null
        }
        Relationships: []
      }
      kael_monitoring_ab_price_synthesis: {
        Row: {
          collected_cases: number | null
          completed_cases: number | null
          comparison_provider: Database["public"]["Enums"]["api_provider"] | null
          experiment_id: string | null
          experiment_key: string | null
          failed_metric_count: number | null
          fallback_provider: Database["public"]["Enums"]["api_provider"] | null
          fallback_rate: number | null
          metric_thresholds: Json | null
          price_range_deviation_vs_actual: number | null
          price_range_deviation_vs_anthropic: number | null
          primary_provider: Database["public"]["Enums"]["api_provider"] | null
          purpose: string | null
          sample_target: number | null
          schema_validation_rate: number | null
          started_at: string | null
          status: string | null
          threshold_decision: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kael_ab_price_synthesis_cases_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "kael_ab_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_monitoring_provider_daily: {
        Row: {
          avg_latency_ms: number | null
          call_count: number | null
          day: string | null
          failure_count: number | null
          fallback_count: number | null
          p95_latency_ms: number | null
          provider: Database["public"]["Enums"]["api_provider"] | null
          purpose: string | null
          success_count: number | null
          total_cost_usd: number | null
        }
        Relationships: []
      }
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
      archive_stale_kael_memory: {
        Args: { p_archive_before?: string }
        Returns: {
          archived_from: string
          subject_id: string
          subject_type: string
        }[]
      }
      cleanup_orphan_analyzing_jobs: {
        Args: { p_cutoff?: string }
        Returns: {
          cleaned_count: number
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
      cancel_job_after_accept_atomic: {
        Args: {
          p_abuse_signals?: string[]
          p_customer_id: string
          p_job_id: string
          p_reason_category?: string
          p_reason_code: string
          p_reason_note?: string
        }
        Returns: {
          abuse_signals: string[]
          admin_review_required: boolean
          cancellation_id: string
          created_at_ts: string
          error_code: string
          job_id_out: string
          job_status: Database["public"]["Enums"]["job_status"]
          ok: boolean
          phase0_no_monetary_penalty: boolean
          reason_category: string
          reason_code: string
          sub_case: string
          worker_goodwill: Json
          worker_id_out: string | null
        }[]
      }
      open_dispute_atomic: {
        Args: {
          p_dispute_type: string
          p_evidence_photo_urls?: string[]
          p_initiated_by: string
          p_initiated_by_id: string
          p_initiator_statement: string
          p_job_id: string
          p_kael_neutral_summary?: string | null
        }
        Returns: {
          admin_review_required: boolean
          created_at_ts: string
          dispute_id: string
          dispute_status: string
          error_code: string | null
          evidence_locked_at: string
          evidence_snapshot_id: string
          ok: boolean
          priority: string
        }[]
      }
      confirm_kael_chat_atomic: {
        Args: { p_customer_id: string; p_session_id: string }
        Returns: {
          district_code: string
          error_code: string
          job_id: string
          job_status: Database["public"]["Enums"]["job_status"]
          ok: boolean
          service_type: Database["public"]["Enums"]["service_type"]
        }[]
      }
      enqueue_worker_no_show_reviews: {
        Args: { p_now?: string }
        Returns: {
          fallback_options: Json
          job_id_out: string
          reason_code: string
          worker_id_out: string | null
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
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
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
          p_new_description: string
          p_reason: string
          p_worker_id: string
        }
        Returns: {
          created_at_ts: string
          error_code: string
          ok: boolean
          scope_change_id: string
          scope_status: Database["public"]["Enums"]["scope_change_status"]
        }[]
      }
      request_customer_cancellation_atomic: {
        Args: {
          p_customer_id: string
          p_job_id: string
          p_reason_code: string
          p_reason_note?: string
        }
        Returns: {
          abuse_signals: string[]
          admin_review_required: boolean
          cancellation_id: string
          created_at_ts: string
          error_code: string
          job_id_out: string
          job_status: Database["public"]["Enums"]["job_status"]
          ok: boolean
          phase0_no_monetary_penalty: boolean
          reason_category: string
          reason_code: string
          sub_case: string
          worker_goodwill: Json
          worker_id_out: string
        }[]
      }
      submit_counter_statement_atomic: {
        Args: {
          p_actor_id: string
          p_dispute_id: string
          p_statement: string
        }
        Returns: {
          dispute_id: string
          dispute_status: string
          error_code: string | null
          ok: boolean
          updated_at_ts: string
        }[]
      }
      admin_decide_dispute_atomic: {
        Args: {
          p_admin_id: string
          p_customer_trust_impact?: string
          p_dispute_id: string
          p_outcome: string
          p_reasoning?: string
          p_refund_amount?: number | null
          p_worker_action?: string
          p_worker_credit_amount?: number | null
        }
        Returns: {
          decided_at_ts: string
          dispute_id: string
          dispute_status: string
          error_code: string | null
          ok: boolean
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
          abuse_signals: string[]
          admin_review_required: boolean
          cancellation_id: string
          cancellation_status: string
          created_at_ts: string
          district_code: string
          error_code: string
          fallback_options: Json
          job_id_out: string
          job_status: Database["public"]["Enums"]["job_status"]
          ok: boolean
          reason_category: string
          reason_code: string
          service_type_out: Database["public"]["Enums"]["service_type"]
          worker_id_out: string
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
