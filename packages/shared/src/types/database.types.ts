export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      customer_account_deletion_requests: {
        Row: {
          avatar_storage_ref: string | null
          checkpoint: string
          client_request_id: string
          completed_at: string | null
          created_at: string
          customer_id: string
          database_scrubbed_at: string | null
          id: string
          requested_at: string
          status: string
          updated_at: string
        }
        Insert: {
          avatar_storage_ref?: string | null
          checkpoint?: string
          client_request_id: string
          completed_at?: string | null
          created_at?: string
          customer_id: string
          database_scrubbed_at?: string | null
          id?: string
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_storage_ref?: string | null
          checkpoint?: string
          client_request_id?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          database_scrubbed_at?: string | null
          id?: string
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_account_deletion_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
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
      customer_favorite_workers: {
        Row: {
          created_at: string
          customer_id: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          worker_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_favorite_workers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_favorite_workers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_favorite_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "customer_favorite_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_kael_feedback: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          language: string
          message: string
          message_scrubbed: string
          rating: string | null
          reason_scrubbed: string | null
          response_id: string | null
          safe_metadata: Json
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          language?: string
          message: string
          message_scrubbed: string
          rating?: string | null
          reason_scrubbed?: string | null
          response_id?: string | null
          safe_metadata?: Json
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          language?: string
          message?: string
          message_scrubbed?: string
          rating?: string | null
          reason_scrubbed?: string | null
          response_id?: string | null
          safe_metadata?: Json
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_kael_feedback_customer_id_fkey"
            columns: ["customer_id"]
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
      customer_payment_methods: {
        Row: {
          account_holder_name: string
          bank_account: string
          bank_account_masked: string
          bank_key: string
          bank_name: string
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          status: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          account_holder_name: string
          bank_account: string
          bank_account_masked: string
          bank_key: string
          bank_name: string
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          account_holder_name?: string
          bank_account?: string
          bank_account_masked?: string
          bank_key?: string
          bank_name?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_methods_customer_id_fkey"
            columns: ["customer_id"]
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
      customer_stats: {
        Row: {
          bookings_30d: number
          bookings_total: number
          customer_id: string
          dispute_free_rate: number | null
          last_recomputed_at: string
          total_spent: number
        }
        Insert: {
          bookings_30d?: number
          bookings_total?: number
          customer_id: string
          dispute_free_rate?: number | null
          last_recomputed_at?: string
          total_spent?: number
        }
        Update: {
          bookings_30d?: number
          bookings_total?: number
          customer_id?: string
          dispute_free_rate?: number | null
          last_recomputed_at?: string
          total_spent?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_stats_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customer_overview"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_stats_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customer_profiles"
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
          evidence_locked_at: string
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
      harness_dependency_circuits: {
        Row: {
          dependency: string
          environment: string
          failure_count: number
          half_open_probes: number
          last_error_code: string | null
          open_until: string | null
          opened_at: string | null
          state: string
          success_count: number
          updated_at: string
          window_started_at: string
        }
        Insert: {
          dependency: string
          environment: string
          failure_count?: number
          half_open_probes?: number
          last_error_code?: string | null
          open_until?: string | null
          opened_at?: string | null
          state?: string
          success_count?: number
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          dependency?: string
          environment?: string
          failure_count?: number
          half_open_probes?: number
          last_error_code?: string | null
          open_until?: string | null
          opened_at?: string | null
          state?: string
          success_count?: number
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      harness_dependency_probes: {
        Row: {
          completed_at: string | null
          dependency: string
          environment: string
          error_code: string | null
          expires_at: string
          leased_at: string
          probe_token: string
          success: boolean | null
        }
        Insert: {
          completed_at?: string | null
          dependency: string
          environment: string
          error_code?: string | null
          expires_at: string
          leased_at?: string
          probe_token?: string
          success?: boolean | null
        }
        Update: {
          completed_at?: string | null
          dependency?: string
          environment?: string
          error_code?: string | null
          expires_at?: string
          leased_at?: string
          probe_token?: string
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "harness_dependency_probes_dependency_environment_fkey"
            columns: ["dependency", "environment"]
            isOneToOne: false
            referencedRelation: "harness_dependency_circuits"
            referencedColumns: ["dependency", "environment"]
          },
        ]
      }
      harness_evaluation_runs: {
        Row: {
          artifact_sha256: string | null
          evaluation_id: string
          evaluator_id: string
          evaluator_kind: string
          evaluator_version: string
          evidence_class: string
          finished_at: string | null
          git_sha: string
          metrics: Json
          policy_bundle_sha256: string
          prompt_bundle_sha256: string
          release_id: string
          safe_metadata: Json
          sample_count: number
          started_at: string
          status: string
          variance: Json
        }
        Insert: {
          artifact_sha256?: string | null
          evaluation_id: string
          evaluator_id: string
          evaluator_kind: string
          evaluator_version: string
          evidence_class: string
          finished_at?: string | null
          git_sha: string
          metrics?: Json
          policy_bundle_sha256: string
          prompt_bundle_sha256: string
          release_id: string
          safe_metadata?: Json
          sample_count?: number
          started_at?: string
          status?: string
          variance?: Json
        }
        Update: {
          artifact_sha256?: string | null
          evaluation_id?: string
          evaluator_id?: string
          evaluator_kind?: string
          evaluator_version?: string
          evidence_class?: string
          finished_at?: string | null
          git_sha?: string
          metrics?: Json
          policy_bundle_sha256?: string
          prompt_bundle_sha256?: string
          release_id?: string
          safe_metadata?: Json
          sample_count?: number
          started_at?: string
          status?: string
          variance?: Json
        }
        Relationships: [
          {
            foreignKeyName: "harness_evaluation_runs_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "harness_releases"
            referencedColumns: ["release_id"]
          },
        ]
      }
      harness_evaluation_samples: {
        Row: {
          authorization_bypass: boolean
          case_class: string
          case_id: string
          confirmation_bypass: boolean
          cost_usd: number | null
          critical_safety_failure: boolean
          error_code: string | null
          evaluation_id: string
          latency_ms: number | null
          occurred_at: string
          provider: string | null
          provider_attempt_id: string | null
          repetition: number
          resolved_model: string | null
          safe_metadata: Json
          sample_id: string
          success: boolean
          tool_call_correct: boolean | null
        }
        Insert: {
          authorization_bypass?: boolean
          case_class: string
          case_id: string
          confirmation_bypass?: boolean
          cost_usd?: number | null
          critical_safety_failure?: boolean
          error_code?: string | null
          evaluation_id: string
          latency_ms?: number | null
          occurred_at?: string
          provider?: string | null
          provider_attempt_id?: string | null
          repetition: number
          resolved_model?: string | null
          safe_metadata?: Json
          sample_id?: string
          success: boolean
          tool_call_correct?: boolean | null
        }
        Update: {
          authorization_bypass?: boolean
          case_class?: string
          case_id?: string
          confirmation_bypass?: boolean
          cost_usd?: number | null
          critical_safety_failure?: boolean
          error_code?: string | null
          evaluation_id?: string
          latency_ms?: number | null
          occurred_at?: string
          provider?: string | null
          provider_attempt_id?: string | null
          repetition?: number
          resolved_model?: string | null
          safe_metadata?: Json
          sample_id?: string
          success?: boolean
          tool_call_correct?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "harness_evaluation_samples_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "harness_evaluation_runs"
            referencedColumns: ["evaluation_id"]
          },
        ]
      }
      harness_events: {
        Row: {
          attempt_number: number
          cost_usd: number | null
          environment: string
          error_code: string | null
          event_class: string
          event_id: string
          latency_ms: number | null
          model: string | null
          occurred_at: string
          parent_event_id: string | null
          provider: string | null
          release_id: string
          run_id: string
          safe_metadata: Json
          stage: string | null
          status: string
          tool_call_id: string | null
          tool_id: string | null
          trace_id: string
          turn_id: string | null
        }
        Insert: {
          attempt_number?: number
          cost_usd?: number | null
          environment: string
          error_code?: string | null
          event_class: string
          event_id?: string
          latency_ms?: number | null
          model?: string | null
          occurred_at?: string
          parent_event_id?: string | null
          provider?: string | null
          release_id: string
          run_id: string
          safe_metadata?: Json
          stage?: string | null
          status: string
          tool_call_id?: string | null
          tool_id?: string | null
          trace_id: string
          turn_id?: string | null
        }
        Update: {
          attempt_number?: number
          cost_usd?: number | null
          environment?: string
          error_code?: string | null
          event_class?: string
          event_id?: string
          latency_ms?: number | null
          model?: string | null
          occurred_at?: string
          parent_event_id?: string | null
          provider?: string | null
          release_id?: string
          run_id?: string
          safe_metadata?: Json
          stage?: string | null
          status?: string
          tool_call_id?: string | null
          tool_id?: string | null
          trace_id?: string
          turn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "harness_events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "harness_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "harness_events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "harness_run_timeline"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "harness_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "harness_run_timeline"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "harness_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "harness_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      harness_idempotency_keys: {
        Row: {
          actor_id_hash: string | null
          completed_at: string | null
          environment: string
          error_code: string | null
          expires_at: string
          key_hash: string
          operation_id: string
          release_id: string
          request_hash: string
          reservation_id: string
          reserved_at: string
          response_hash: string | null
          status: string
        }
        Insert: {
          actor_id_hash?: string | null
          completed_at?: string | null
          environment: string
          error_code?: string | null
          expires_at: string
          key_hash: string
          operation_id: string
          release_id: string
          request_hash: string
          reservation_id?: string
          reserved_at?: string
          response_hash?: string | null
          status?: string
        }
        Update: {
          actor_id_hash?: string | null
          completed_at?: string | null
          environment?: string
          error_code?: string | null
          expires_at?: string
          key_hash?: string
          operation_id?: string
          release_id?: string
          request_hash?: string
          reservation_id?: string
          reserved_at?: string
          response_hash?: string | null
          status?: string
        }
        Relationships: []
      }
      harness_kill_switch_events: {
        Row: {
          actor_id: string
          enabled: boolean
          environment: string
          event_id: string
          occurred_at: string
          previous_enabled: boolean
          reason_code: string | null
          release_id: string | null
          safe_metadata: Json
          switch_id: string
        }
        Insert: {
          actor_id: string
          enabled: boolean
          environment: string
          event_id?: string
          occurred_at?: string
          previous_enabled: boolean
          reason_code?: string | null
          release_id?: string | null
          safe_metadata?: Json
          switch_id: string
        }
        Update: {
          actor_id?: string
          enabled?: boolean
          environment?: string
          event_id?: string
          occurred_at?: string
          previous_enabled?: boolean
          reason_code?: string | null
          release_id?: string | null
          safe_metadata?: Json
          switch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harness_kill_switch_events_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "harness_releases"
            referencedColumns: ["release_id"]
          },
        ]
      }
      harness_kill_switches: {
        Row: {
          changed_at: string
          changed_by: string | null
          enabled: boolean
          environment: string
          reason_code: string | null
          release_id: string | null
          safe_metadata: Json
          switch_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          enabled?: boolean
          environment: string
          reason_code?: string | null
          release_id?: string | null
          safe_metadata?: Json
          switch_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          enabled?: boolean
          environment?: string
          reason_code?: string | null
          release_id?: string | null
          safe_metadata?: Json
          switch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harness_kill_switches_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "harness_releases"
            referencedColumns: ["release_id"]
          },
        ]
      }
      harness_privileged_operations: {
        Row: {
          actor_id_hash: string | null
          actor_role: string | null
          capability: string
          environment: string
          error_code: string | null
          occurred_at: string
          operation_event_id: string
          operation_id: string
          reason: string
          release_id: string
          resource_id_hash: string | null
          resource_type: string
          result: string
          run_id: string
          safe_metadata: Json
          trace_id: string
        }
        Insert: {
          actor_id_hash?: string | null
          actor_role?: string | null
          capability: string
          environment: string
          error_code?: string | null
          occurred_at?: string
          operation_event_id?: string
          operation_id: string
          reason: string
          release_id: string
          resource_id_hash?: string | null
          resource_type: string
          result: string
          run_id: string
          safe_metadata?: Json
          trace_id: string
        }
        Update: {
          actor_id_hash?: string | null
          actor_role?: string | null
          capability?: string
          environment?: string
          error_code?: string | null
          occurred_at?: string
          operation_event_id?: string
          operation_id?: string
          reason?: string
          release_id?: string
          resource_id_hash?: string | null
          resource_type?: string
          result?: string
          run_id?: string
          safe_metadata?: Json
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harness_privileged_operations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "harness_run_timeline"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "harness_privileged_operations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "harness_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      harness_promotion_events: {
        Row: {
          actor_id: string | null
          actor_role: string
          approval_id: string | null
          environment: string
          event_id: string
          evidence_sha256: string | null
          next_state: string
          occurred_at: string
          previous_state: string | null
          promotion_id: string
          reason_code: string | null
          release_id: string
          result: string
          safe_metadata: Json
        }
        Insert: {
          actor_id?: string | null
          actor_role: string
          approval_id?: string | null
          environment: string
          event_id?: string
          evidence_sha256?: string | null
          next_state: string
          occurred_at?: string
          previous_state?: string | null
          promotion_id: string
          reason_code?: string | null
          release_id: string
          result: string
          safe_metadata?: Json
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          approval_id?: string | null
          environment?: string
          event_id?: string
          evidence_sha256?: string | null
          next_state?: string
          occurred_at?: string
          previous_state?: string | null
          promotion_id?: string
          reason_code?: string | null
          release_id?: string
          result?: string
          safe_metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "harness_promotion_events_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "harness_promotions"
            referencedColumns: ["promotion_id"]
          },
          {
            foreignKeyName: "harness_promotion_events_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "harness_releases"
            referencedColumns: ["release_id"]
          },
        ]
      }
      harness_promotions: {
        Row: {
          cohort: string | null
          created_at: string
          environment: string
          evaluation_report_id: string | null
          human_approval_id: string | null
          observation_window_minutes: number | null
          packet_sha256: string
          promotion_id: string
          release_id: string
          rollback_release_id: string | null
          safe_metadata: Json
          state: string
          updated_at: string
        }
        Insert: {
          cohort?: string | null
          created_at?: string
          environment: string
          evaluation_report_id?: string | null
          human_approval_id?: string | null
          observation_window_minutes?: number | null
          packet_sha256: string
          promotion_id?: string
          release_id: string
          rollback_release_id?: string | null
          safe_metadata?: Json
          state?: string
          updated_at?: string
        }
        Update: {
          cohort?: string | null
          created_at?: string
          environment?: string
          evaluation_report_id?: string | null
          human_approval_id?: string | null
          observation_window_minutes?: number | null
          packet_sha256?: string
          promotion_id?: string
          release_id?: string
          rollback_release_id?: string | null
          safe_metadata?: Json
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "harness_promotions_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "harness_releases"
            referencedColumns: ["release_id"]
          },
          {
            foreignKeyName: "harness_promotions_rollback_release_id_fkey"
            columns: ["rollback_release_id"]
            isOneToOne: false
            referencedRelation: "harness_releases"
            referencedColumns: ["release_id"]
          },
        ]
      }
      harness_release_events: {
        Row: {
          actor_role: string
          approval_id: string | null
          created_at: string
          environment: string
          event_type: string
          evidence_sha256: string | null
          id: number
          release_id: string
          safe_metadata: Json
        }
        Insert: {
          actor_role: string
          approval_id?: string | null
          created_at?: string
          environment: string
          event_type: string
          evidence_sha256?: string | null
          id?: never
          release_id: string
          safe_metadata?: Json
        }
        Update: {
          actor_role?: string
          approval_id?: string | null
          created_at?: string
          environment?: string
          event_type?: string
          evidence_sha256?: string | null
          id?: never
          release_id?: string
          safe_metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "harness_release_events_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "harness_releases"
            referencedColumns: ["release_id"]
          },
        ]
      }
      harness_releases: {
        Row: {
          access_matrix_sha256: string
          bundle_sha256: string
          capability_registry_sha256: string
          created_at: string
          created_by: string
          database_types_sha256: string
          edge_function_digests: Json
          environment: string
          evaluation_suite_sha256: string
          evaluation_suite_version: string
          git_sha: string
          manifest_sha256: string
          migration_inventory_sha256: string
          policy_bundle_sha256: string
          previous_release_id: string | null
          promotion_policy_sha256: string
          prompt_bundle_sha256: string
          release_artifact: Json
          release_id: string
          reliability_policy_sha256: string
          runtime_configuration_sha256: string
          safe_metadata: Json
        }
        Insert: {
          access_matrix_sha256: string
          bundle_sha256: string
          capability_registry_sha256: string
          created_at?: string
          created_by: string
          database_types_sha256: string
          edge_function_digests: Json
          environment: string
          evaluation_suite_sha256: string
          evaluation_suite_version: string
          git_sha: string
          manifest_sha256: string
          migration_inventory_sha256: string
          policy_bundle_sha256: string
          previous_release_id?: string | null
          promotion_policy_sha256: string
          prompt_bundle_sha256: string
          release_artifact: Json
          release_id: string
          reliability_policy_sha256: string
          runtime_configuration_sha256: string
          safe_metadata?: Json
        }
        Update: {
          access_matrix_sha256?: string
          bundle_sha256?: string
          capability_registry_sha256?: string
          created_at?: string
          created_by?: string
          database_types_sha256?: string
          edge_function_digests?: Json
          environment?: string
          evaluation_suite_sha256?: string
          evaluation_suite_version?: string
          git_sha?: string
          manifest_sha256?: string
          migration_inventory_sha256?: string
          policy_bundle_sha256?: string
          previous_release_id?: string | null
          promotion_policy_sha256?: string
          prompt_bundle_sha256?: string
          release_artifact?: Json
          release_id?: string
          reliability_policy_sha256?: string
          runtime_configuration_sha256?: string
          safe_metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "harness_releases_previous_release_id_fkey"
            columns: ["previous_release_id"]
            isOneToOne: false
            referencedRelation: "harness_releases"
            referencedColumns: ["release_id"]
          },
        ]
      }
      harness_reliability_events: {
        Row: {
          dependency: string | null
          environment: string
          error_code: string | null
          event_class: string
          event_id: string
          occurred_at: string
          operation_id: string | null
          release_id: string
          result: string
          safe_metadata: Json
        }
        Insert: {
          dependency?: string | null
          environment: string
          error_code?: string | null
          event_class: string
          event_id?: string
          occurred_at?: string
          operation_id?: string | null
          release_id: string
          result: string
          safe_metadata?: Json
        }
        Update: {
          dependency?: string | null
          environment?: string
          error_code?: string | null
          event_class?: string
          event_id?: string
          occurred_at?: string
          operation_id?: string | null
          release_id?: string
          result?: string
          safe_metadata?: Json
        }
        Relationships: []
      }
      harness_runs: {
        Row: {
          actor_id_hash: string | null
          actor_role: string | null
          capability: string | null
          duration_ms: number | null
          environment: string
          error_code: string | null
          finished_at: string | null
          job_id: string | null
          parent_run_id: string | null
          release_id: string
          route_kind: string
          run_id: string
          safe_metadata: Json
          started_at: string
          status: string
          trace_id: string
        }
        Insert: {
          actor_id_hash?: string | null
          actor_role?: string | null
          capability?: string | null
          duration_ms?: number | null
          environment: string
          error_code?: string | null
          finished_at?: string | null
          job_id?: string | null
          parent_run_id?: string | null
          release_id: string
          route_kind: string
          run_id: string
          safe_metadata?: Json
          started_at?: string
          status?: string
          trace_id: string
        }
        Update: {
          actor_id_hash?: string | null
          actor_role?: string | null
          capability?: string | null
          duration_ms?: number | null
          environment?: string
          error_code?: string | null
          finished_at?: string | null
          job_id?: string | null
          parent_run_id?: string | null
          release_id?: string
          route_kind?: string
          run_id?: string
          safe_metadata?: Json
          started_at?: string
          status?: string
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harness_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harness_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "harness_run_timeline"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "harness_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "harness_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      harness_slo_observations: {
        Row: {
          actual: number
          created_at: string
          environment: string
          observation_id: string
          owner: string
          passed: boolean | null
          release_id: string
          runbook: string
          safe_metadata: Json
          slo_id: string
          target: number
          window_ended_at: string
          window_started_at: string
        }
        Insert: {
          actual: number
          created_at?: string
          environment: string
          observation_id?: string
          owner: string
          passed?: boolean | null
          release_id: string
          runbook: string
          safe_metadata?: Json
          slo_id: string
          target: number
          window_ended_at: string
          window_started_at: string
        }
        Update: {
          actual?: number
          created_at?: string
          environment?: string
          observation_id?: string
          owner?: string
          passed?: boolean | null
          release_id?: string
          runbook?: string
          safe_metadata?: Json
          slo_id?: string
          target?: number
          window_ended_at?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "harness_slo_observations_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "harness_releases"
            referencedColumns: ["release_id"]
          },
        ]
      }
      job_broadcast_retry_claims: {
        Row: {
          claim_token: string
          claimed_at: string
          customer_id: string
          expires_at: string
          job_id: string
        }
        Insert: {
          claim_token: string
          claimed_at: string
          customer_id: string
          expires_at: string
          job_id: string
        }
        Update: {
          claim_token?: string
          claimed_at?: string
          customer_id?: string
          expires_at?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_broadcast_retry_claims_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
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
      job_media_upload_intents: {
        Row: {
          attached_at: string | null
          bucket_id: string
          cleaned_at: string | null
          cleanup_claim_token: string | null
          cleanup_claimed_at: string | null
          created_at: string
          delete_after: string | null
          expires_at: string
          file_size_bytes: number
          id: string
          job_id: string
          mime_type: string
          object_path: string
          owner_id: string
          stage: string
          status: string
          updated_at: string
        }
        Insert: {
          attached_at?: string | null
          bucket_id?: string
          cleaned_at?: string | null
          cleanup_claim_token?: string | null
          cleanup_claimed_at?: string | null
          created_at?: string
          delete_after?: string | null
          expires_at: string
          file_size_bytes: number
          id?: string
          job_id: string
          mime_type: string
          object_path: string
          owner_id: string
          stage: string
          status?: string
          updated_at?: string
        }
        Update: {
          attached_at?: string | null
          bucket_id?: string
          cleaned_at?: string | null
          cleanup_claim_token?: string | null
          cleanup_claimed_at?: string | null
          created_at?: string
          delete_after?: string | null
          expires_at?: string
          file_size_bytes?: number
          id?: string
          job_id?: string
          mime_type?: string
          object_path?: string
          owner_id?: string
          stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_media_upload_intents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_worker_candidates: {
        Row: {
          broadcast_id: string | null
          created_at: string
          customer_decided_at: string | null
          expires_at: string | null
          id: string
          job_id: string
          proposed_at: string
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          broadcast_id?: string | null
          created_at?: string
          customer_decided_at?: string | null
          expires_at?: string | null
          id?: string
          job_id: string
          proposed_at?: string
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          broadcast_id?: string | null
          created_at?: string
          customer_decided_at?: string | null
          expires_at?: string | null
          id?: string
          job_id?: string
          proposed_at?: string
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_worker_candidates_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "job_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_worker_candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_worker_candidates_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "job_worker_candidates_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
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
          apartment_access_profile: Json
          apartment_access_state: Json
          arrived_at: string | null
          broadcast_at: string | null
          cancelled_at: string | null
          client_request_id: string | null
          completed_at: string | null
          completion_notes: string | null
          completion_photo_urls: string[]
          confirmed_at: string | null
          confirmed_search_at: string | null
          created_at: string
          customer_id: string
          description: string
          diagnosis_scope: Json | null
          display_code: string
          estimate_ready_at: string | null
          final_price: number | null
          geo_source: string | null
          gross_amount: number | null
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
          kael_reference_price_max: number | null
          kael_reference_price_min: number | null
          kael_worker_brief_core: Json | null
          kael_worker_brief_guidance: Json | null
          matched_at: string | null
          paid_at: string | null
          payment_amount_received: number | null
          payment_code: string | null
          payment_expires_at: string | null
          payment_failure_reason: string | null
          payment_provider: string | null
          payment_qr_image_url: string | null
          payment_received_at: string | null
          payment_status: string
          payment_transfer_content: string | null
          payment_updated_at: string | null
          photo_urls: string[]
          platform_fee: number | null
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
          sepay_reference_code: string | null
          sepay_transaction_id: string | null
          service_problem_id: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          worker_commission_level: number | null
          worker_commission_rate_bps: number | null
          worker_id: string | null
          worker_net: number | null
        }
        Insert: {
          address_building?: string | null
          address_district?: string | null
          address_floor?: string | null
          address_lat?: number | null
          address_lng?: number | null
          address_unit?: string | null
          apartment_access_profile?: Json
          apartment_access_state?: Json
          arrived_at?: string | null
          broadcast_at?: string | null
          cancelled_at?: string | null
          client_request_id?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          completion_photo_urls?: string[]
          confirmed_at?: string | null
          confirmed_search_at?: string | null
          created_at?: string
          customer_id: string
          description: string
          diagnosis_scope?: Json | null
          display_code?: string
          estimate_ready_at?: string | null
          final_price?: number | null
          geo_source?: string | null
          gross_amount?: number | null
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
          kael_reference_price_max?: number | null
          kael_reference_price_min?: number | null
          kael_worker_brief_core?: Json | null
          kael_worker_brief_guidance?: Json | null
          matched_at?: string | null
          paid_at?: string | null
          payment_amount_received?: number | null
          payment_code?: string | null
          payment_expires_at?: string | null
          payment_failure_reason?: string | null
          payment_provider?: string | null
          payment_qr_image_url?: string | null
          payment_received_at?: string | null
          payment_status?: string
          payment_transfer_content?: string | null
          payment_updated_at?: string | null
          photo_urls?: string[]
          platform_fee?: number | null
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
          sepay_reference_code?: string | null
          sepay_transaction_id?: string | null
          service_problem_id?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          worker_commission_level?: number | null
          worker_commission_rate_bps?: number | null
          worker_id?: string | null
          worker_net?: number | null
        }
        Update: {
          address_building?: string | null
          address_district?: string | null
          address_floor?: string | null
          address_lat?: number | null
          address_lng?: number | null
          address_unit?: string | null
          apartment_access_profile?: Json
          apartment_access_state?: Json
          arrived_at?: string | null
          broadcast_at?: string | null
          cancelled_at?: string | null
          client_request_id?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          completion_photo_urls?: string[]
          confirmed_at?: string | null
          confirmed_search_at?: string | null
          created_at?: string
          customer_id?: string
          description?: string
          diagnosis_scope?: Json | null
          display_code?: string
          estimate_ready_at?: string | null
          final_price?: number | null
          geo_source?: string | null
          gross_amount?: number | null
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
          kael_reference_price_max?: number | null
          kael_reference_price_min?: number | null
          kael_worker_brief_core?: Json | null
          kael_worker_brief_guidance?: Json | null
          matched_at?: string | null
          paid_at?: string | null
          payment_amount_received?: number | null
          payment_code?: string | null
          payment_expires_at?: string | null
          payment_failure_reason?: string | null
          payment_provider?: string | null
          payment_qr_image_url?: string | null
          payment_received_at?: string | null
          payment_status?: string
          payment_transfer_content?: string | null
          payment_updated_at?: string | null
          photo_urls?: string[]
          platform_fee?: number | null
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
          sepay_reference_code?: string | null
          sepay_transaction_id?: string | null
          service_problem_id?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          worker_commission_level?: number | null
          worker_commission_rate_bps?: number | null
          worker_id?: string | null
          worker_net?: number | null
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
            foreignKeyName: "kael_ab_price_synthesis_cases_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "kael_monitoring_ab_price_synthesis"
            referencedColumns: ["experiment_id"]
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
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          response_summary: string
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
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          response_summary: string
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
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          response_summary?: string
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
          {
            foreignKeyName: "kael_admin_queue_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      kael_ai_batch_items: {
        Row: {
          batch_id: string
          created_at: string
          custom_id: string
          error_payload: Json
          id: string
          processed_at: string | null
          queue_id: string | null
          request_payload: Json
          response_payload: Json
          skill_id: string
          status: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          custom_id: string
          error_payload?: Json
          id?: string
          processed_at?: string | null
          queue_id?: string | null
          request_payload?: Json
          response_payload?: Json
          skill_id: string
          status?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          custom_id?: string
          error_payload?: Json
          id?: string
          processed_at?: string | null
          queue_id?: string | null
          request_payload?: Json
          response_payload?: Json
          skill_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_ai_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "kael_ai_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_ai_batch_items_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "kael_learning_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_ai_batches: {
        Row: {
          canceled_count: number
          created_at: string
          ended_at: string | null
          error_code: string | null
          errored_count: number
          expired_count: number
          expires_at: string | null
          id: string
          next_poll_at: string | null
          processing_count: number
          provider: Database["public"]["Enums"]["api_provider"]
          provider_batch_id: string | null
          purpose: string
          request_count: number
          results_url: string | null
          safe_metadata: Json
          status: string
          submitted_at: string | null
          succeeded_count: number
          updated_at: string
        }
        Insert: {
          canceled_count?: number
          created_at?: string
          ended_at?: string | null
          error_code?: string | null
          errored_count?: number
          expired_count?: number
          expires_at?: string | null
          id?: string
          next_poll_at?: string | null
          processing_count?: number
          provider?: Database["public"]["Enums"]["api_provider"]
          provider_batch_id?: string | null
          purpose?: string
          request_count?: number
          results_url?: string | null
          safe_metadata?: Json
          status?: string
          submitted_at?: string | null
          succeeded_count?: number
          updated_at?: string
        }
        Update: {
          canceled_count?: number
          created_at?: string
          ended_at?: string | null
          error_code?: string | null
          errored_count?: number
          expired_count?: number
          expires_at?: string | null
          id?: string
          next_poll_at?: string | null
          processing_count?: number
          provider?: Database["public"]["Enums"]["api_provider"]
          provider_batch_id?: string | null
          purpose?: string
          request_count?: number
          results_url?: string | null
          safe_metadata?: Json
          status?: string
          submitted_at?: string | null
          succeeded_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      kael_ai_spend_log: {
        Row: {
          actor_id: string | null
          cost_usd: number
          created_at: string
          harness_release_id: string | null
          harness_run_id: string | null
          harness_trace_id: string | null
          id: number
          provider_attempt_id: string | null
          purpose: string
          reservation_expires_at: string | null
          reservation_status: string
        }
        Insert: {
          actor_id?: string | null
          cost_usd: number
          created_at?: string
          harness_release_id?: string | null
          harness_run_id?: string | null
          harness_trace_id?: string | null
          id?: never
          provider_attempt_id?: string | null
          purpose: string
          reservation_expires_at?: string | null
          reservation_status?: string
        }
        Update: {
          actor_id?: string | null
          cost_usd?: number
          created_at?: string
          harness_release_id?: string | null
          harness_run_id?: string | null
          harness_trace_id?: string | null
          id?: never
          provider_attempt_id?: string | null
          purpose?: string
          reservation_expires_at?: string | null
          reservation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_ai_spend_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      kael_autonomy_decision_audit: {
        Row: {
          actor_id: string | null
          actor_role: string
          confidence: number | null
          created_at: string
          decision: Json | null
          decision_source: string
          evidence_refs: string[]
          from_status: Database["public"]["Enums"]["job_status"]
          gate_result: string
          id: string
          job_id: string | null
          reason_code: string
          resulting_event: string | null
          safe_metadata: Json
          to_status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          actor_id?: string | null
          actor_role: string
          confidence?: number | null
          created_at?: string
          decision?: Json | null
          decision_source: string
          evidence_refs?: string[]
          from_status: Database["public"]["Enums"]["job_status"]
          gate_result: string
          id?: string
          job_id?: string | null
          reason_code: string
          resulting_event?: string | null
          safe_metadata?: Json
          to_status: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          confidence?: number | null
          created_at?: string
          decision?: Json | null
          decision_source?: string
          evidence_refs?: string[]
          from_status?: Database["public"]["Enums"]["job_status"]
          gate_result?: string
          id?: string
          job_id?: string | null
          reason_code?: string
          resulting_event?: string | null
          safe_metadata?: Json
          to_status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "kael_autonomy_decision_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_autonomy_decision_audit_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
      kael_chat_media_upload_intents: {
        Row: {
          bucket_id: string
          cleaned_at: string | null
          cleanup_attempts: number
          cleanup_claim_token: string | null
          cleanup_claimed_at: string | null
          consumed_at: string | null
          created_at: string
          customer_id: string
          delete_after: string
          expires_at: string
          file_size_bytes: number
          id: string
          mime_type: string
          object_path: string
          purpose: string
          status: string
          updated_at: string
        }
        Insert: {
          bucket_id?: string
          cleaned_at?: string | null
          cleanup_attempts?: number
          cleanup_claim_token?: string | null
          cleanup_claimed_at?: string | null
          consumed_at?: string | null
          created_at?: string
          customer_id: string
          delete_after: string
          expires_at: string
          file_size_bytes: number
          id?: string
          mime_type: string
          object_path: string
          purpose: string
          status?: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          cleaned_at?: string | null
          cleanup_attempts?: number
          cleanup_claim_token?: string | null
          cleanup_claimed_at?: string | null
          consumed_at?: string | null
          created_at?: string
          customer_id?: string
          delete_after?: string
          expires_at?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          object_path?: string
          purpose?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      kael_chat_pre_intake_memory: {
        Row: {
          access_profile: Json
          address_district: string | null
          address_fingerprint: string
          address_label_safe: string | null
          created_at: string
          customer_id: string
          id: string
          last_used_job_id: string | null
          updated_at: string
        }
        Insert: {
          access_profile?: Json
          address_district?: string | null
          address_fingerprint: string
          address_label_safe?: string | null
          created_at?: string
          customer_id: string
          id?: string
          last_used_job_id?: string | null
          updated_at?: string
        }
        Update: {
          access_profile?: Json
          address_district?: string | null
          address_fingerprint?: string
          address_label_safe?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          last_used_job_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_chat_pre_intake_memory_last_used_job_id_fkey"
            columns: ["last_used_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_chat_rate_limit_log: {
        Row: {
          ts: string
          user_id: string
        }
        Insert: {
          ts?: string
          user_id: string
        }
        Update: {
          ts?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_chat_rate_limit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_chat_sessions: {
        Row: {
          abandoned_at: string | null
          case_phase: string
          client_request_id: string | null
          created_at: string
          customer_id: string
          diagnosis_scope: Json | null
          estimate_ready_at: string | null
          id: string
          job_id: string | null
          kael_progress: Json | null
          safe_metadata: Json
          scheduled_at: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          started_at: string
          status: string
          total_cost_usd: number
          total_turns: number
          updated_at: string
        }
        Insert: {
          abandoned_at?: string | null
          case_phase?: string
          client_request_id?: string | null
          created_at?: string
          customer_id: string
          diagnosis_scope?: Json | null
          estimate_ready_at?: string | null
          id?: string
          job_id?: string | null
          kael_progress?: Json | null
          safe_metadata?: Json
          scheduled_at?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          started_at?: string
          status?: string
          total_cost_usd?: number
          total_turns?: number
          updated_at?: string
        }
        Update: {
          abandoned_at?: string | null
          case_phase?: string
          client_request_id?: string | null
          created_at?: string
          customer_id?: string
          diagnosis_scope?: Json | null
          estimate_ready_at?: string | null
          id?: string
          job_id?: string | null
          kael_progress?: Json | null
          safe_metadata?: Json
          scheduled_at?: string | null
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
      kael_customer_conversation_turns: {
        Row: {
          client_request_id: string | null
          conversation_id: string
          created_at: string
          customer_id: string
          id: string
          role: string
          text_content: string
          turn_index: number
        }
        Insert: {
          client_request_id?: string | null
          conversation_id: string
          created_at?: string
          customer_id: string
          id?: string
          role: string
          text_content: string
          turn_index: number
        }
        Update: {
          client_request_id?: string | null
          conversation_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          role?: string
          text_content?: string
          turn_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "kael_customer_conversation_turns_owner_fk"
            columns: ["conversation_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "kael_customer_conversations"
            referencedColumns: ["id", "customer_id"]
          },
        ]
      }
      kael_customer_conversations: {
        Row: {
          archived_at: string | null
          case_session_id: string | null
          chat_mode: string
          client_request_id: string
          created_at: string
          customer_id: string
          id: string
          pinned_at: string | null
          title: string | null
          total_turns: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          case_session_id?: string | null
          chat_mode: string
          client_request_id: string
          created_at?: string
          customer_id: string
          id?: string
          pinned_at?: string | null
          title?: string | null
          total_turns?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          case_session_id?: string | null
          chat_mode?: string
          client_request_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          pinned_at?: string | null
          title?: string | null
          total_turns?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_customer_conversations_case_session_id_fkey"
            columns: ["case_session_id"]
            isOneToOne: true
            referencedRelation: "kael_chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_customer_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_guardrail_trip_audit: {
        Row: {
          actor_id: string | null
          actor_role: string
          created_at: string
          guardrail_label: string | null
          id: string
          job_id: string | null
          reason_code: string
          safe_metadata: Json
          source: string
          surface: string
        }
        Insert: {
          actor_id?: string | null
          actor_role: string
          created_at?: string
          guardrail_label?: string | null
          id?: string
          job_id?: string | null
          reason_code: string
          safe_metadata?: Json
          source: string
          surface: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          guardrail_label?: string | null
          id?: string
          job_id?: string | null
          reason_code?: string
          safe_metadata?: Json
          source?: string
          surface?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_guardrail_trip_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_guardrail_trip_audit_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
          sanitized_excerpt?: string
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
      kael_job_incident_events: {
        Row: {
          actor_id: string | null
          actor_role: string
          assistant_claim_id: string | null
          assistant_claimed_at: string | null
          caused_by_event_id: string | null
          content: string | null
          created_at: string
          id: string
          incident_id: string
          job_id: string
          media_refs: Json
          message_id: string | null
          reported_description_snapshot: string | null
          reported_reason_snapshot: string | null
          request_id: string | null
          safe_metadata: Json
          source_job_status: Database["public"]["Enums"]["job_status"] | null
          source_kind: string
          source_revision: number | null
        }
        Insert: {
          actor_id?: string | null
          actor_role: string
          assistant_claim_id?: string | null
          assistant_claimed_at?: string | null
          caused_by_event_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          incident_id: string
          job_id: string
          media_refs?: Json
          message_id?: string | null
          reported_description_snapshot?: string | null
          reported_reason_snapshot?: string | null
          request_id?: string | null
          safe_metadata?: Json
          source_job_status?: Database["public"]["Enums"]["job_status"] | null
          source_kind: string
          source_revision?: number | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          assistant_claim_id?: string | null
          assistant_claimed_at?: string | null
          caused_by_event_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          incident_id?: string
          job_id?: string
          media_refs?: Json
          message_id?: string | null
          reported_description_snapshot?: string | null
          reported_reason_snapshot?: string | null
          request_id?: string | null
          safe_metadata?: Json
          source_job_status?: Database["public"]["Enums"]["job_status"] | null
          source_kind?: string
          source_revision?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kael_job_incident_events_caused_by_event_id_fkey"
            columns: ["caused_by_event_id"]
            isOneToOne: false
            referencedRelation: "kael_job_incident_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_job_incident_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "kael_job_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_job_incident_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_job_incident_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_job_incidents: {
        Row: {
          created_at: string
          evidence_photo_urls: Json
          evidence_status: string
          id: string
          job_id: string
          last_next_actor: string | null
          last_question: string | null
          last_summary: string | null
          opened_by: string
          reported_description: string
          reported_reason: string
          revision: number
          scope_change_id: string | null
          scope_proposal_claim_id: string | null
          scope_proposal_claimed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_photo_urls?: Json
          evidence_status?: string
          id?: string
          job_id: string
          last_next_actor?: string | null
          last_question?: string | null
          last_summary?: string | null
          opened_by: string
          reported_description: string
          reported_reason: string
          revision?: number
          scope_change_id?: string | null
          scope_proposal_claim_id?: string | null
          scope_proposal_claimed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_photo_urls?: Json
          evidence_status?: string
          id?: string
          job_id?: string
          last_next_actor?: string | null
          last_question?: string | null
          last_summary?: string | null
          opened_by?: string
          reported_description?: string
          reported_reason?: string
          revision?: number
          scope_change_id?: string | null
          scope_proposal_claim_id?: string | null
          scope_proposal_claimed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_job_incidents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_job_incidents_scope_change_id_fkey"
            columns: ["scope_change_id"]
            isOneToOne: false
            referencedRelation: "scope_change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_knowledge_usage_log: {
        Row: {
          citation_id: string
          created_at: string
          id: string
          job_id: string | null
          knowledge_id: string | null
          knowledge_table: string
          safe_metadata: Json
          session_id: string | null
          similarity: number | null
        }
        Insert: {
          citation_id: string
          created_at?: string
          id?: string
          job_id?: string | null
          knowledge_id?: string | null
          knowledge_table: string
          safe_metadata?: Json
          session_id?: string | null
          similarity?: number | null
        }
        Update: {
          citation_id?: string
          created_at?: string
          id?: string
          job_id?: string | null
          knowledge_id?: string | null
          knowledge_table?: string
          safe_metadata?: Json
          session_id?: string | null
          similarity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kael_knowledge_usage_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_learning_queue: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          attempts: number
          batch_id: string | null
          candidate_payload: Json
          claim_id: string | null
          claimed_at: string | null
          created_at: string
          error_code: string | null
          event_type: string
          finalized_claim_id: string | null
          id: string
          input_payload: Json
          job_id: string | null
          processed_at: string | null
          provider_batch_id: string | null
          queue_state: string
          run_after: string
          skill_id: string
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          attempts?: number
          batch_id?: string | null
          candidate_payload?: Json
          claim_id?: string | null
          claimed_at?: string | null
          created_at?: string
          error_code?: string | null
          event_type: string
          finalized_claim_id?: string | null
          id?: string
          input_payload?: Json
          job_id?: string | null
          processed_at?: string | null
          provider_batch_id?: string | null
          queue_state?: string
          run_after?: string
          skill_id: string
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          attempts?: number
          batch_id?: string | null
          candidate_payload?: Json
          claim_id?: string | null
          claimed_at?: string | null
          created_at?: string
          error_code?: string | null
          event_type?: string
          finalized_claim_id?: string | null
          id?: string
          input_payload?: Json
          job_id?: string | null
          processed_at?: string | null
          provider_batch_id?: string | null
          queue_state?: string
          run_after?: string
          skill_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_learning_queue_batch_fk"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "kael_ai_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_learning_queue_job_id_fkey"
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
      kael_market_cache: {
        Row: {
          complexity: Database["public"]["Enums"]["complexity_level"]
          confidence: number
          created_at: string
          district_code: string
          expires_at: string
          hit_count: number
          id: string
          invalidated_at: string | null
          market_range_max: number
          market_range_min: number
          perplexity_raw: Json
          problem_slug: string
          service_type: Database["public"]["Enums"]["service_type"]
          sources_summary: string | null
          updated_at: string
        }
        Insert: {
          complexity: Database["public"]["Enums"]["complexity_level"]
          confidence: number
          created_at?: string
          district_code: string
          expires_at: string
          hit_count?: number
          id?: string
          invalidated_at?: string | null
          market_range_max: number
          market_range_min: number
          perplexity_raw?: Json
          problem_slug: string
          service_type: Database["public"]["Enums"]["service_type"]
          sources_summary?: string | null
          updated_at?: string
        }
        Update: {
          complexity?: Database["public"]["Enums"]["complexity_level"]
          confidence?: number
          created_at?: string
          district_code?: string
          expires_at?: string
          hit_count?: number
          id?: string
          invalidated_at?: string | null
          market_range_max?: number
          market_range_min?: number
          perplexity_raw?: Json
          problem_slug?: string
          service_type?: Database["public"]["Enums"]["service_type"]
          sources_summary?: string | null
          updated_at?: string
        }
        Relationships: []
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
      kael_memory_update_receipts: {
        Row: {
          applied_at: string
          event_key: string
          event_type: string
          job_id: string | null
          safe_metadata: Json
          source_event_id: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          applied_at?: string
          event_key: string
          event_type: string
          job_id?: string | null
          safe_metadata?: Json
          source_event_id: string
          subject_id: string
          subject_type: string
        }
        Update: {
          applied_at?: string
          event_key?: string
          event_type?: string
          job_id?: string | null
          safe_metadata?: Json
          source_event_id?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_memory_update_receipts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_memory_update_receipts_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_optimization_metrics: {
        Row: {
          cost_actual: number | null
          cost_before_estimate: number | null
          cost_delta_estimate: number | null
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
          cost_delta_estimate?: number | null
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
          cost_delta_estimate?: number | null
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
      kael_provider_circuit: {
        Row: {
          failure_count: number
          key: string
          kind: string
          open_until: string | null
          scope: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          failure_count?: number
          key: string
          kind: string
          open_until?: string | null
          scope: string
          updated_at?: string
          window_started_at: string
        }
        Update: {
          failure_count?: number
          key?: string
          kind?: string
          open_until?: string | null
          scope?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      kael_provider_spend_daily: {
        Row: {
          call_count: number
          spend_date: string
          total_cost_usd: number
          updated_at: string
        }
        Insert: {
          call_count?: number
          spend_date?: string
          total_cost_usd?: number
          updated_at?: string
        }
        Update: {
          call_count?: number
          spend_date?: string
          total_cost_usd?: number
          updated_at?: string
        }
        Relationships: []
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
      kael_rate_counter: {
        Row: {
          key: string
          scope: string
          tokens: number
          updated_at: string
          window_started_at: string
        }
        Insert: {
          key: string
          scope: string
          tokens: number
          updated_at?: string
          window_started_at: string
        }
        Update: {
          key?: string
          scope?: string
          tokens?: number
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      kael_region_lexicon_candidate: {
        Row: {
          created_at: string
          evidence: Json
          id: string
          marker: string
          proposed_region: string
          proposed_tier: string
          status: string
          support_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          id?: string
          marker: string
          proposed_region: string
          proposed_tier: string
          status?: string
          support_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          id?: string
          marker?: string
          proposed_region?: string
          proposed_tier?: string
          status?: string
          support_count?: number
          updated_at?: string
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
      kael_voice_transcript: {
        Row: {
          actor_role: string
          created_at: string
          id: string
          region_hint: string
          safe_metadata: Json
          scrubbed_text: string
          session_id: string | null
          source: string
          user_id: string
        }
        Insert: {
          actor_role?: string
          created_at?: string
          id?: string
          region_hint?: string
          safe_metadata?: Json
          scrubbed_text: string
          session_id?: string | null
          source?: string
          user_id: string
        }
        Update: {
          actor_role?: string
          created_at?: string
          id?: string
          region_hint?: string
          safe_metadata?: Json
          scrubbed_text?: string
          session_id?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_voice_transcript_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "kael_chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_voice_transcript_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_worker_chat_rate_limit_log: {
        Row: {
          ts: string
          worker_id: string
        }
        Insert: {
          ts?: string
          worker_id: string
        }
        Update: {
          ts?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_worker_chat_rate_limit_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_worker_chat_sessions: {
        Row: {
          archived_at: string | null
          chat_mode: string
          client_request_id: string | null
          closed_at: string | null
          created_at: string
          id: string
          job_id: string | null
          kael_progress: Json | null
          pinned_at: string | null
          safe_metadata: Json
          started_at: string
          status: string
          title: string | null
          total_cost_usd: number
          total_turns: number
          updated_at: string
          worker_id: string
        }
        Insert: {
          archived_at?: string | null
          chat_mode?: string
          client_request_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kael_progress?: Json | null
          pinned_at?: string | null
          safe_metadata?: Json
          started_at?: string
          status?: string
          title?: string | null
          total_cost_usd?: number
          total_turns?: number
          updated_at?: string
          worker_id: string
        }
        Update: {
          archived_at?: string | null
          chat_mode?: string
          client_request_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kael_progress?: Json | null
          pinned_at?: string | null
          safe_metadata?: Json
          started_at?: string
          status?: string
          title?: string | null
          total_cost_usd?: number
          total_turns?: number
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_worker_chat_sessions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_worker_chat_sessions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_worker_chat_turn_requests: {
        Row: {
          assistant_turn_id: string | null
          attempt_count: number
          claim_id: string | null
          claimed_at: string | null
          client_request_id: string
          completed_at: string | null
          content_type: string
          created_at: string
          id: string
          job_id: string | null
          media_refs: string[]
          session_id: string
          source_job_status: Database["public"]["Enums"]["job_status"] | null
          status: string
          text_content: string
          updated_at: string
          worker_id: string
          worker_turn_id: string
        }
        Insert: {
          assistant_turn_id?: string | null
          attempt_count?: number
          claim_id?: string | null
          claimed_at?: string | null
          client_request_id: string
          completed_at?: string | null
          content_type: string
          created_at?: string
          id?: string
          job_id?: string | null
          media_refs?: string[]
          session_id: string
          source_job_status?: Database["public"]["Enums"]["job_status"] | null
          status: string
          text_content: string
          updated_at?: string
          worker_id: string
          worker_turn_id: string
        }
        Update: {
          assistant_turn_id?: string | null
          attempt_count?: number
          claim_id?: string | null
          claimed_at?: string | null
          client_request_id?: string
          completed_at?: string | null
          content_type?: string
          created_at?: string
          id?: string
          job_id?: string | null
          media_refs?: string[]
          session_id?: string
          source_job_status?: Database["public"]["Enums"]["job_status"] | null
          status?: string
          text_content?: string
          updated_at?: string
          worker_id?: string
          worker_turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kael_worker_chat_turn_requests_assistant_turn_id_fkey"
            columns: ["assistant_turn_id"]
            isOneToOne: false
            referencedRelation: "kael_worker_chat_turns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_worker_chat_turn_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_worker_chat_turn_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "kael_worker_chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_worker_chat_turn_requests_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_worker_chat_turn_requests_worker_turn_id_fkey"
            columns: ["worker_turn_id"]
            isOneToOne: true
            referencedRelation: "kael_worker_chat_turns"
            referencedColumns: ["id"]
          },
        ]
      }
      kael_worker_chat_turns: {
        Row: {
          ai_model: string | null
          ai_provider: Database["public"]["Enums"]["api_provider"] | null
          client_request_id: string | null
          content_type: string
          cost_usd: number | null
          created_at: string
          id: string
          job_id: string | null
          latency_ms: number | null
          media_refs: string[]
          role: string
          safe_metadata: Json
          session_id: string
          source_turn_id: string | null
          text_content: string | null
          turn_index: number
        }
        Insert: {
          ai_model?: string | null
          ai_provider?: Database["public"]["Enums"]["api_provider"] | null
          client_request_id?: string | null
          content_type: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          job_id?: string | null
          latency_ms?: number | null
          media_refs?: string[]
          role: string
          safe_metadata?: Json
          session_id: string
          source_turn_id?: string | null
          text_content?: string | null
          turn_index: number
        }
        Update: {
          ai_model?: string | null
          ai_provider?: Database["public"]["Enums"]["api_provider"] | null
          client_request_id?: string | null
          content_type?: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          job_id?: string | null
          latency_ms?: number | null
          media_refs?: string[]
          role?: string
          safe_metadata?: Json
          session_id?: string
          source_turn_id?: string | null
          text_content?: string | null
          turn_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "kael_worker_chat_turns_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_worker_chat_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "kael_worker_chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kael_worker_chat_turns_source_turn_id_fkey"
            columns: ["source_turn_id"]
            isOneToOne: false
            referencedRelation: "kael_worker_chat_turns"
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
      learning_candidate_provenance: {
        Row: {
          candidate_id: string
          consent_hash: string
          consent_status: string
          created_at: string
          dispute_status: string
          evidence_hash: string
          generated_summary_hash: string | null
          input_hash: string
          privacy_status: string
          provenance_status: string
          quality_status: string
          release_id: string
          safe_metadata: Json
          source_hash: string
          source_type: string
          summary_origin: string
          updated_at: string
        }
        Insert: {
          candidate_id: string
          consent_hash: string
          consent_status: string
          created_at?: string
          dispute_status: string
          evidence_hash: string
          generated_summary_hash?: string | null
          input_hash: string
          privacy_status: string
          provenance_status?: string
          quality_status: string
          release_id: string
          safe_metadata?: Json
          source_hash: string
          source_type: string
          summary_origin: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          consent_hash?: string
          consent_status?: string
          created_at?: string
          dispute_status?: string
          evidence_hash?: string
          generated_summary_hash?: string | null
          input_hash?: string
          privacy_status?: string
          provenance_status?: string
          quality_status?: string
          release_id?: string
          safe_metadata?: Json
          source_hash?: string
          source_type?: string
          summary_origin?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_candidate_provenance_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "learning_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_candidate_reviews: {
        Row: {
          candidate_id: string
          decision: string
          evidence_hash: string | null
          gate_snapshot: Json
          generated_summary_hash: string | null
          reason: string
          release_id: string
          review_id: string
          reviewed_at: string
          reviewer_id: string
          safe_metadata: Json
          source_hash: string | null
          summary_origin: string | null
        }
        Insert: {
          candidate_id: string
          decision: string
          evidence_hash?: string | null
          gate_snapshot?: Json
          generated_summary_hash?: string | null
          reason: string
          release_id: string
          review_id?: string
          reviewed_at?: string
          reviewer_id: string
          safe_metadata?: Json
          source_hash?: string | null
          summary_origin?: string | null
        }
        Update: {
          candidate_id?: string
          decision?: string
          evidence_hash?: string | null
          gate_snapshot?: Json
          generated_summary_hash?: string | null
          reason?: string
          release_id?: string
          review_id?: string
          reviewed_at?: string
          reviewer_id?: string
          safe_metadata?: Json
          source_hash?: string | null
          summary_origin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_candidate_reviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "learning_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_candidate_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
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
      learning_observation_receipts: {
        Row: {
          affected_district: string
          affected_problem: string
          affected_service: Database["public"]["Enums"]["service_type"]
          baseline_max: number | null
          baseline_min: number | null
          candidate_id: string
          candidate_type: string
          complexity: Database["public"]["Enums"]["complexity_level"]
          created_at: string
          final_price: number | null
          id: string
          job_id: string
          rating: number | null
          reference_max: number | null
          reference_min: number | null
          review_tags: string[]
          reviewed_at: string
          scope_change_requested: boolean
        }
        Insert: {
          affected_district: string
          affected_problem: string
          affected_service: Database["public"]["Enums"]["service_type"]
          baseline_max?: number | null
          baseline_min?: number | null
          candidate_id: string
          candidate_type: string
          complexity: Database["public"]["Enums"]["complexity_level"]
          created_at?: string
          final_price?: number | null
          id?: string
          job_id: string
          rating?: number | null
          reference_max?: number | null
          reference_min?: number | null
          review_tags?: string[]
          reviewed_at: string
          scope_change_requested: boolean
        }
        Update: {
          affected_district?: string
          affected_problem?: string
          affected_service?: Database["public"]["Enums"]["service_type"]
          baseline_max?: number | null
          baseline_min?: number | null
          candidate_id?: string
          candidate_type?: string
          complexity?: Database["public"]["Enums"]["complexity_level"]
          created_at?: string
          final_price?: number | null
          id?: string
          job_id?: string
          rating?: number | null
          reference_max?: number | null
          reference_min?: number | null
          review_tags?: string[]
          reviewed_at?: string
          scope_change_requested?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "learning_observation_receipts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "learning_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_observation_receipts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_rule_dependencies: {
        Row: {
          candidate_id: string
          created_at: string
          dependency_id: string
          evidence_hash: string
          release_id: string
          revoked_at: string | null
          rule_id: string
          rule_version: number
          source_hash: string
          status: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          dependency_id?: string
          evidence_hash: string
          release_id: string
          revoked_at?: string | null
          rule_id: string
          rule_version: number
          source_hash: string
          status?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          dependency_id?: string
          evidence_hash?: string
          release_id?: string
          revoked_at?: string | null
          rule_id?: string
          rule_version?: number
          source_hash?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_rule_dependencies_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "learning_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_rule_dependencies_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "learning_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_rule_revocations: {
        Row: {
          cascaded_dependency_count: number
          reason: string
          release_id: string
          revocation_id: string
          revoked_at: string
          revoked_by: string
          rule_id: string
          rule_version: number
          safe_metadata: Json
        }
        Insert: {
          cascaded_dependency_count?: number
          reason: string
          release_id: string
          revocation_id?: string
          revoked_at?: string
          revoked_by: string
          rule_id: string
          rule_version: number
          safe_metadata?: Json
        }
        Update: {
          cascaded_dependency_count?: number
          reason?: string
          release_id?: string
          revocation_id?: string
          revoked_at?: string
          revoked_by?: string
          rule_id?: string
          rule_version?: number
          safe_metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "learning_rule_revocations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_rule_revocations_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "learning_rules"
            referencedColumns: ["id"]
          },
        ]
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
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          embedding_updated_at: string | null
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
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          embedding_updated_at?: string | null
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
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          embedding_updated_at?: string | null
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
          account_state: string
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          deletion_requested_at: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          account_state?: string
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          account_state?: string
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
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
      scope_change_request_commands: {
        Row: {
          claim_id: string | null
          claimed_at: string | null
          client_request_id: string
          created_at: string
          evidence_photo_urls: string[]
          job_id: string
          last_error_code: string | null
          new_description: string
          reason: string
          request_state: string
          response_payload: Json | null
          scope_change_id: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          claim_id?: string | null
          claimed_at?: string | null
          client_request_id: string
          created_at?: string
          evidence_photo_urls?: string[]
          job_id: string
          last_error_code?: string | null
          new_description: string
          reason: string
          request_state?: string
          response_payload?: Json | null
          scope_change_id?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          claim_id?: string | null
          claimed_at?: string | null
          client_request_id?: string
          created_at?: string
          evidence_photo_urls?: string[]
          job_id?: string
          last_error_code?: string | null
          new_description?: string
          reason?: string
          request_state?: string
          response_payload?: Json | null
          scope_change_id?: string | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_change_request_commands_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_change_request_commands_scope_change_id_fkey"
            columns: ["scope_change_id"]
            isOneToOne: true
            referencedRelation: "scope_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_change_request_commands_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_change_request_effects: {
        Row: {
          attempt_count: number
          claim_id: string | null
          claimed_at: string | null
          client_request_id: string
          completed_at: string | null
          created_at: string
          effect_id: string
          effect_name: string
          effect_state: string
          job_id: string
          last_error_code: string | null
          payload: Json
          scope_change_id: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          attempt_count?: number
          claim_id?: string | null
          claimed_at?: string | null
          client_request_id: string
          completed_at?: string | null
          created_at?: string
          effect_id: string
          effect_name: string
          effect_state?: string
          job_id: string
          last_error_code?: string | null
          payload?: Json
          scope_change_id: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          attempt_count?: number
          claim_id?: string | null
          claimed_at?: string | null
          client_request_id?: string
          completed_at?: string | null
          created_at?: string
          effect_id?: string
          effect_name?: string
          effect_state?: string
          job_id?: string
          last_error_code?: string | null
          payload?: Json
          scope_change_id?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_change_request_effects_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_change_request_effects_scope_change_id_fkey"
            columns: ["scope_change_id"]
            isOneToOne: false
            referencedRelation: "scope_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_change_request_effects_worker_id_client_request_id_fkey"
            columns: ["worker_id", "client_request_id"]
            isOneToOne: false
            referencedRelation: "scope_change_request_commands"
            referencedColumns: ["worker_id", "client_request_id"]
          },
        ]
      }
      scope_change_requests: {
        Row: {
          client_request_id: string | null
          created_at: string
          customer_decision_at: string | null
          evidence_photo_urls: string[]
          id: string
          job_id: string
          kael_computed_max: number | null
          kael_computed_min: number | null
          kael_progress: Json | null
          kael_review: Json | null
          original_summary: string | null
          price_max: number | null
          price_min: number | null
          reason: string
          request_timing: string
          requested_description: string
          resume_job_status: Database["public"]["Enums"]["job_status"]
          status: Database["public"]["Enums"]["scope_change_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string
          customer_decision_at?: string | null
          evidence_photo_urls?: string[]
          id?: string
          job_id: string
          kael_computed_max?: number | null
          kael_computed_min?: number | null
          kael_progress?: Json | null
          kael_review?: Json | null
          original_summary?: string | null
          price_max?: number | null
          price_min?: number | null
          reason: string
          request_timing?: string
          requested_description: string
          resume_job_status?: Database["public"]["Enums"]["job_status"]
          status?: Database["public"]["Enums"]["scope_change_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          client_request_id?: string | null
          created_at?: string
          customer_decision_at?: string | null
          evidence_photo_urls?: string[]
          id?: string
          job_id?: string
          kael_computed_max?: number | null
          kael_computed_min?: number | null
          kael_progress?: Json | null
          kael_review?: Json | null
          original_summary?: string | null
          price_max?: number | null
          price_min?: number | null
          reason?: string
          request_timing?: string
          requested_description?: string
          resume_job_status?: Database["public"]["Enums"]["job_status"]
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
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          embedding_updated_at: string | null
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
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          embedding_updated_at?: string | null
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
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          embedding_updated_at?: string | null
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
      source_trust_registry: {
        Row: {
          added_at: string
          added_by: string | null
          auto_tier: number
          criteria_met: Json
          description: string | null
          domain: string
          effective_from: string
          effective_until: string | null
          entity_type: string | null
          established_year: number | null
          first_seen_at: string | null
          id: string
          integrity_flag: boolean
          is_active: boolean
          last_price_seen_at: string | null
          last_reviewed_at: string | null
          last_reviewer_id: string | null
          metadata: Json
          price_unit: string | null
          region: string | null
          review_notes: string | null
          tier: string
          trust_score: number
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          auto_tier?: number
          criteria_met?: Json
          description?: string | null
          domain: string
          effective_from?: string
          effective_until?: string | null
          entity_type?: string | null
          established_year?: number | null
          first_seen_at?: string | null
          id?: string
          integrity_flag?: boolean
          is_active?: boolean
          last_price_seen_at?: string | null
          last_reviewed_at?: string | null
          last_reviewer_id?: string | null
          metadata?: Json
          price_unit?: string | null
          region?: string | null
          review_notes?: string | null
          tier: string
          trust_score: number
        }
        Update: {
          added_at?: string
          added_by?: string | null
          auto_tier?: number
          criteria_met?: Json
          description?: string | null
          domain?: string
          effective_from?: string
          effective_until?: string | null
          entity_type?: string | null
          established_year?: number | null
          first_seen_at?: string | null
          id?: string
          integrity_flag?: boolean
          is_active?: boolean
          last_price_seen_at?: string | null
          last_reviewed_at?: string | null
          last_reviewer_id?: string | null
          metadata?: Json
          price_unit?: string | null
          region?: string | null
          review_notes?: string | null
          tier?: string
          trust_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "source_trust_registry_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_trust_registry_last_reviewer_id_fkey"
            columns: ["last_reviewer_id"]
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
      worker_cancellation_requests: {
        Row: {
          abuse_signals: string[]
          admin_decision_at: string | null
          admin_decision_by: string | null
          admin_review_required: boolean
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
          abuse_signals?: string[]
          admin_decision_at?: string | null
          admin_decision_by?: string | null
          admin_review_required?: boolean
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
          abuse_signals?: string[]
          admin_decision_at?: string | null
          admin_decision_by?: string | null
          admin_review_required?: boolean
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
      worker_cash_commission_ledger: {
        Row: {
          cash_commission_collected: number
          cash_commission_due: number
          commission_level: number
          commission_rate_bps: number
          confirmed_at: string
          created_at: string
          gross_amount: number
          id: string
          job_id: string
          platform_fee: number
          worker_id: string
          worker_net: number
        }
        Insert: {
          cash_commission_collected: number
          cash_commission_due: number
          commission_level: number
          commission_rate_bps: number
          confirmed_at?: string
          created_at?: string
          gross_amount: number
          id?: string
          job_id: string
          platform_fee: number
          worker_id: string
          worker_net: number
        }
        Update: {
          cash_commission_collected?: number
          cash_commission_due?: number
          commission_level?: number
          commission_rate_bps?: number
          confirmed_at?: string
          created_at?: string
          gross_amount?: number
          id?: string
          job_id?: string
          platform_fee?: number
          worker_id?: string
          worker_net?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_cash_commission_ledger_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_cash_commission_ledger_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_cash_commission_ledger_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_cash_commission_reconciliations: {
        Row: {
          amount: number
          cash_commission_ledger_id: string
          created_at: string
          id: string
          reconciled_at: string
          worker_id: string
        }
        Insert: {
          amount: number
          cash_commission_ledger_id: string
          created_at?: string
          id?: string
          reconciled_at?: string
          worker_id: string
        }
        Update: {
          amount?: number
          cash_commission_ledger_id?: string
          created_at?: string
          id?: string
          reconciled_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_cash_commission_reconcili_cash_commission_ledger_id_fkey"
            columns: ["cash_commission_ledger_id"]
            isOneToOne: false
            referencedRelation: "worker_cash_commission_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_cash_commission_reconciliations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_cash_commission_reconciliations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_commission_tiers: {
        Row: {
          commission_rate_bps: number
          created_at: string
          is_active: boolean
          level: number
          min_average_rating: number
          min_completed_jobs: number
          updated_at: string
        }
        Insert: {
          commission_rate_bps: number
          created_at?: string
          is_active?: boolean
          level: number
          min_average_rating: number
          min_completed_jobs: number
          updated_at?: string
        }
        Update: {
          commission_rate_bps?: number
          created_at?: string
          is_active?: boolean
          level?: number
          min_average_rating?: number
          min_completed_jobs?: number
          updated_at?: string
        }
        Relationships: []
      }
      worker_kael_feedback: {
        Row: {
          created_at: string
          id: string
          language: string
          rating: string | null
          raw_message: string
          reason_scrubbed: string | null
          response_id: string | null
          safe_metadata: Json
          scrubbed_message: string
          source: string
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string
          rating?: string | null
          raw_message: string
          reason_scrubbed?: string | null
          response_id?: string | null
          safe_metadata?: Json
          scrubbed_message: string
          source?: string
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          rating?: string | null
          raw_message?: string
          reason_scrubbed?: string | null
          response_id?: string | null
          safe_metadata?: Json
          scrubbed_message?: string
          source?: string
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_kael_feedback_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      worker_kael_training_consent: {
        Row: {
          created_at: string
          language: string
          safe_metadata: Json
          source: string
          training_consent: boolean
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          language?: string
          safe_metadata?: Json
          source?: string
          training_consent?: boolean
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          language?: string
          safe_metadata?: Json
          source?: string
          training_consent?: boolean
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_kael_training_consent_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payment_ledger: {
        Row: {
          available_at: string | null
          commission_level: number
          commission_rate_bps: number
          created_at: string
          gross_amount: number
          id: string
          job_id: string
          payment_provider: string
          payment_state: string
          platform_fee: number
          updated_at: string
          worker_id: string
          worker_net: number
        }
        Insert: {
          available_at?: string | null
          commission_level: number
          commission_rate_bps: number
          created_at?: string
          gross_amount: number
          id?: string
          job_id: string
          payment_provider: string
          payment_state: string
          platform_fee: number
          updated_at?: string
          worker_id: string
          worker_net: number
        }
        Update: {
          available_at?: string | null
          commission_level?: number
          commission_rate_bps?: number
          created_at?: string
          gross_amount?: number
          id?: string
          job_id?: string
          payment_provider?: string
          payment_state?: string
          platform_fee?: number
          updated_at?: string
          worker_id?: string
          worker_net?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_payment_ledger_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payment_ledger_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_payment_ledger_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_profiles: {
        Row: {
          active_service_types:
            | Database["public"]["Enums"]["service_type"][]
            | null
          app_active_minutes: number
          app_last_active_minute: string | null
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
          selected_service_types: Database["public"]["Enums"]["service_type"][]
          selfie_url: string | null
          service_radius_km: number
          service_types: Database["public"]["Enums"]["service_type"][]
          total_jobs: number
          updated_at: string
          verification_status: Database["public"]["Enums"]["worker_verification_status"]
          years_experience: number
        }
        Insert: {
          active_service_types?:
            | Database["public"]["Enums"]["service_type"][]
            | null
          app_active_minutes?: number
          app_last_active_minute?: string | null
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
          selected_service_types?: Database["public"]["Enums"]["service_type"][]
          selfie_url?: string | null
          service_radius_km?: number
          service_types?: Database["public"]["Enums"]["service_type"][]
          total_jobs?: number
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["worker_verification_status"]
          years_experience?: number
        }
        Update: {
          active_service_types?:
            | Database["public"]["Enums"]["service_type"][]
            | null
          app_active_minutes?: number
          app_last_active_minute?: string | null
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
          selected_service_types?: Database["public"]["Enums"]["service_type"][]
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
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          embedding_updated_at: string | null
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
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          embedding_updated_at?: string | null
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
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          embedding_updated_at?: string | null
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
      worker_stats: {
        Row: {
          avg_response_time_min: number | null
          cancel_rate: number | null
          completion_rate: number | null
          income_30d: number
          jobs_30d: number
          last_recomputed_at: string
          on_time_rate: number | null
          total_income: number
          worker_id: string
        }
        Insert: {
          avg_response_time_min?: number | null
          cancel_rate?: number | null
          completion_rate?: number | null
          income_30d?: number
          jobs_30d?: number
          last_recomputed_at?: string
          on_time_rate?: number | null
          total_income?: number
          worker_id: string
        }
        Update: {
          avg_response_time_min?: number | null
          cancel_rate?: number | null
          completion_rate?: number | null
          income_30d?: number
          jobs_30d?: number
          last_recomputed_at?: string
          on_time_rate?: number | null
          total_income?: number
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_stats_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "worker_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_stats_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_overview: {
        Row: {
          bookings_30d: number | null
          bookings_total: number | null
          building_name: string | null
          created_at: string | null
          customer_id: string | null
          dispute_free_rate: number | null
          district: string | null
          last_recomputed_at: string | null
          total_spent: number | null
          unit_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      harness_run_timeline: {
        Row: {
          actor_role: string | null
          attempt_number: number | null
          capability: string | null
          cost_usd: number | null
          environment: string | null
          error_code: string | null
          event_class: string | null
          event_id: string | null
          event_status: string | null
          finished_at: string | null
          job_id: string | null
          latency_ms: number | null
          model: string | null
          occurred_at: string | null
          parent_event_id: string | null
          provider: string | null
          release_id: string | null
          route_kind: string | null
          run_id: string | null
          run_status: string | null
          safe_metadata: Json | null
          stage: string | null
          started_at: string | null
          tool_call_id: string | null
          tool_id: string | null
          trace_id: string | null
          turn_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "harness_events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "harness_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "harness_events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "harness_run_timeline"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "harness_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
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
          projected_1000_jobs_usd: number | null
          projected_10000_jobs_usd: number | null
        }
        Relationships: []
      }
      kael_estimate_accuracy: {
        Row: {
          complexity: Database["public"]["Enums"]["complexity_level"] | null
          in_band_count: number | null
          in_band_rate: number | null
          job_count: number | null
          median_miss_ratio: number | null
          month: string | null
          over_count: number | null
          p90_miss_ratio: number | null
          service_type: Database["public"]["Enums"]["service_type"] | null
          under_count: number | null
        }
        Relationships: []
      }
      kael_monitoring_ab_price_synthesis: {
        Row: {
          collected_cases: number | null
          comparison_provider:
            | Database["public"]["Enums"]["api_provider"]
            | null
          completed_cases: number | null
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
        Relationships: []
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
      worker_overview: {
        Row: {
          avg_response_time_min: number | null
          cancel_rate: number | null
          completion_rate: number | null
          districts: string[] | null
          income_30d: number | null
          is_approved: boolean | null
          is_available: boolean | null
          jobs_30d: number | null
          last_recomputed_at: string | null
          legal_name: string | null
          on_time_rate: number | null
          rating: number | null
          service_types: Database["public"]["Enums"]["service_type"][] | null
          total_income: number | null
          total_jobs: number | null
          verification_status:
            | Database["public"]["Enums"]["worker_verification_status"]
            | null
          worker_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_profiles_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_service_quality_status: {
        Row: {
          average_rating: number | null
          is_locked: boolean | null
          last_reviewed_at: string | null
          locked_until: string | null
          review_count: number | null
          service_type: Database["public"]["Enums"]["service_type"] | null
          worker_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_broadcast_atomic: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: {
          already_applied: boolean
          candidate_id: string
          error_code: string
          job_status: Database["public"]["Enums"]["job_status"]
          ok: boolean
        }[]
      }
      acquire_harness_dependency_permit: {
        Args: {
          p_dependency: string
          p_environment: string
          p_half_open_probes: number
          p_probe_ttl_seconds: number
        }
        Returns: {
          allowed: boolean
          probe_token: string
          retry_after_ms: number
          state: string
        }[]
      }
      activate_job_broadcast_batch_atomic: {
        Args: {
          p_batch_id: string
          p_expires_at: string
          p_job_id: string
          p_sent_at: string
          p_worker_ids: string[]
        }
        Returns: {
          id: string
          worker_id: string
        }[]
      }
      admin_approve_learning_candidate: {
        Args: {
          p_admin_id: string
          p_candidate_id: string
          p_review_note?: string
        }
        Returns: {
          candidate_id: string
          error_code: string
          ok: boolean
          rule_id: string
          rule_version: number
          status: string
        }[]
      }
      admin_approve_learning_candidate_atomic: {
        Args: {
          p_admin_id: string
          p_candidate_id: string
          p_review_note?: string
        }
        Returns: {
          candidate_id: string
          error_code: string
          knowledge_error_code: string
          knowledge_ok: boolean
          knowledge_table: string
          knowledge_version: number
          ok: boolean
          record_key: string
          rule_id: string
          rule_version: number
          status: string
        }[]
      }
      admin_decide_dispute_atomic: {
        Args: {
          p_admin_id: string
          p_customer_trust_impact?: string
          p_dispute_id: string
          p_outcome: string
          p_reasoning?: string
          p_refund_amount?: number
          p_worker_action?: string
          p_worker_credit_amount?: number
        }
        Returns: {
          decided_at_ts: string
          dispute_id: string
          dispute_status: string
          error_code: string
          ok: boolean
        }[]
      }
      admin_reject_learning_candidate: {
        Args: { p_admin_id: string; p_candidate_id: string; p_reason: string }
        Returns: {
          candidate_id: string
          error_code: string
          ok: boolean
          status: string
        }[]
      }
      admin_review_and_approve_learning_candidate_atomic: {
        Args: {
          p_admin_id: string
          p_candidate_id: string
          p_review_note?: string
        }
        Returns: {
          candidate_id: string
          error_code: string
          knowledge_error_code: string
          knowledge_ok: boolean
          knowledge_table: string
          knowledge_version: number
          ok: boolean
          record_key: string
          rule_id: string
          rule_version: number
          status: string
        }[]
      }
      append_customer_kael_conversation_exchange: {
        Args: {
          p_client_request_id: string
          p_conversation_id: string
          p_customer_id: string
          p_customer_text: string
          p_kael_text: string
        }
        Returns: number
      }
      append_harness_evaluation_sample: {
        Args: {
          p_authorization_bypass: boolean
          p_case_class: string
          p_case_id: string
          p_confirmation_bypass: boolean
          p_cost_usd: number
          p_critical_safety_failure: boolean
          p_error_code: string
          p_evaluation_id: string
          p_latency_ms: number
          p_provider: string
          p_provider_attempt_id: string
          p_repetition: number
          p_resolved_model: string
          p_safe_metadata?: Json
          p_sample_id: string
          p_success: boolean
          p_tool_call_correct: boolean
        }
        Returns: string
      }
      append_harness_event: {
        Args: {
          p_attempt_number: number
          p_cost_usd: number
          p_environment: string
          p_error_code: string
          p_event_class: string
          p_event_id: string
          p_latency_ms: number
          p_model: string
          p_parent_event_id: string
          p_provider: string
          p_release_id: string
          p_run_id: string
          p_safe_metadata?: Json
          p_stage: string
          p_status: string
          p_tool_call_id: string
          p_tool_id: string
          p_trace_id: string
          p_turn_id: string
        }
        Returns: string
      }
      apply_approved_learning_candidate_to_knowledge: {
        Args: { p_admin_id: string; p_candidate_id: string }
        Returns: {
          error_code: string
          knowledge_table: string
          knowledge_version: number
          ok: boolean
          record_key: string
        }[]
      }
      apply_job_incident_assistant_turn_atomic: {
        Args: {
          p_assistant_claim_id: string
          p_event_content: string
          p_evidence_status: string
          p_expected_revision: number
          p_incident_id: string
          p_job_id: string
          p_message_content: string
          p_next_actor: string
          p_question: string
          p_safe_metadata: Json
          p_source_event_id: string
          p_status: string
          p_summary: string
        }
        Returns: {
          applied: boolean
          error_code: string
          incident: Json
          ok: boolean
          stale: boolean
        }[]
      }
      apply_kael_autonomy_decision: {
        Args: {
          p_expected_from: Database["public"]["Enums"]["job_status"]
          p_gate_audit_id: string
          p_job_id: string
          p_to_status: Database["public"]["Enums"]["job_status"]
        }
        Returns: {
          applied_at: string
          error: string
          from_status: Database["public"]["Enums"]["job_status"]
          job_id: string
          ok: boolean
          to_status: Database["public"]["Enums"]["job_status"]
        }[]
      }
      apply_scope_change_database_effect_atomic: {
        Args: {
          p_client_request_id: string
          p_effect_id: string
          p_job_id: string
          p_scope_change_id: string
          p_worker_id: string
        }
        Returns: {
          completed: boolean
          effect_id: string
          error_code: string
          ok: boolean
        }[]
      }
      apply_scope_change_learning_effect_atomic: {
        Args: {
          p_client_request_id: string
          p_effect_id: string
          p_job_id: string
          p_scope_change_id: string
          p_worker_id: string
        }
        Returns: {
          completed: boolean
          effect_id: string
          error_code: string
          ok: boolean
        }[]
      }
      apply_sepay_vietqr_payment_webhook: {
        Args: {
          p_payment_code: string
          p_reference_code?: string
          p_transaction_id: string
          p_transfer_amount: number
        }
        Returns: {
          job_id: string
          job_status: Database["public"]["Enums"]["job_status"]
          ok: boolean
          outcome: string
          payment_status: string
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
      auto_promote_learning_candidate_atomic: {
        Args: { p_candidate_id: string }
        Returns: {
          candidate_id: string
          error_code: string
          ok: boolean
          rule_id: string
          rule_version: number
          status: string
        }[]
      }
      begin_harness_evaluation: {
        Args: {
          p_evaluation_id: string
          p_evaluator_id: string
          p_evaluator_kind: string
          p_evaluator_version: string
          p_evidence_class: string
          p_git_sha: string
          p_policy_bundle_sha256: string
          p_prompt_bundle_sha256: string
          p_release_id: string
          p_safe_metadata?: Json
        }
        Returns: boolean
      }
      begin_harness_run: {
        Args: {
          p_actor_id_hash: string
          p_actor_role: string
          p_capability: string
          p_environment: string
          p_job_id: string
          p_parent_run_id: string
          p_release_id: string
          p_route_kind: string
          p_run_id: string
          p_safe_metadata?: Json
          p_trace_id: string
        }
        Returns: boolean
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
          worker_id_out: string
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
      check_kael_ai_spend: {
        Args: {
          p_actor_id: string
          p_estimated_usd: number
          p_global_daily_cap: number
          p_user_daily_cap: number
          p_user_monthly_cap: number
        }
        Returns: {
          allowed: boolean
          blocked_scope: string
          global_today_usd: number
          user_month_usd: number
          user_today_usd: number
        }[]
      }
      check_kael_chat_rate: {
        Args: { p_per_hour?: number; p_per_minute?: number; p_user_id: string }
        Returns: {
          allowed: boolean
          hour_count: number
          minute_count: number
          reason: string
        }[]
      }
      check_kael_worker_chat_rate: {
        Args: {
          p_per_hour?: number
          p_per_minute?: number
          p_worker_id: string
        }
        Returns: {
          allowed: boolean
          hour_count: number
          minute_count: number
          reason: string
        }[]
      }
      claim_job_broadcast_retry_atomic: {
        Args: {
          p_claim_token: string
          p_customer_id: string
          p_job_id: string
          p_lease_seconds?: number
        }
        Returns: {
          claimed: boolean
          error_code: string
        }[]
      }
      claim_job_incident_chat_turn_atomic: {
        Args: {
          p_actor_id: string
          p_actor_role: string
          p_assistant_claim_id: string
          p_content: string
          p_job_id: string
          p_message_id: string
        }
        Returns: {
          claimed: boolean
          error_code: string
          idempotent: boolean
          incident: Json
          ok: boolean
          revision: number
          source_event_id: string
        }[]
      }
      claim_job_incident_scope_proposal_atomic: {
        Args: { p_claim_id: string; p_job_id: string; p_worker_id: string }
        Returns: {
          claimed: boolean
          error_code: string
          idempotent: boolean
          incident: Json
          ok: boolean
        }[]
      }
      claim_job_media_cleanup_batch: {
        Args: { p_claim_token: string; p_limit?: number; p_now?: string }
        Returns: {
          intent_id: string
          object_path: string
        }[]
      }
      claim_kael_ai_batch_results: {
        Args: {
          p_claim_token: string
          p_force_poll: boolean
          p_lease_seconds: number
          p_limit: number
          p_now: string
        }
        Returns: {
          created_at: string
          id: string
          next_poll_at: string
          provider_batch_id: string
          status: string
        }[]
      }
      claim_kael_chat_media_cleanup_batch: {
        Args: { p_claim_token: string; p_limit?: number; p_now?: string }
        Returns: {
          intent_id: string
          object_path: string
        }[]
      }
      claim_kael_learning_queue_atomic: {
        Args: { p_claim_id: string; p_limit?: number; p_now?: string }
        Returns: {
          actor_id: string | null
          actor_role: string | null
          attempts: number
          batch_id: string | null
          candidate_payload: Json
          claim_id: string | null
          claimed_at: string | null
          created_at: string
          error_code: string | null
          event_type: string
          finalized_claim_id: string | null
          id: string
          input_payload: Json
          job_id: string | null
          processed_at: string | null
          provider_batch_id: string | null
          queue_state: string
          run_after: string
          skill_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "kael_learning_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_scope_change_push_effect_atomic: {
        Args: {
          p_claim_id: string
          p_client_request_id: string
          p_effect_id: string
          p_job_id: string
          p_scope_change_id: string
          p_worker_id: string
        }
        Returns: {
          claimed: boolean
          completed: boolean
          customer_id: string
          effect_id: string
          error_code: string
          ok: boolean
        }[]
      }
      claim_scope_change_request_atomic: {
        Args: {
          p_claim_id: string
          p_client_request_id: string
          p_evidence_photo_urls: string[]
          p_job_id: string
          p_new_description: string
          p_reason: string
          p_worker_id: string
        }
        Returns: {
          claimed: boolean
          created_at_ts: string
          error_code: string
          ok: boolean
          replayed: boolean
          request_state: string
          response_payload: Json
          scope_change_id: string
          scope_status: Database["public"]["Enums"]["scope_change_status"]
          side_effects_state: Json
        }[]
      }
      claim_worker_kael_chat_turn_atomic: {
        Args: {
          p_claim_id: string
          p_client_request_id: string
          p_content_type: string
          p_job_id: string
          p_media_refs: string[]
          p_now?: string
          p_session_id: string
          p_text_content: string
          p_worker_id: string
        }
        Returns: {
          assistant_turn_id: string
          claimed: boolean
          completed: boolean
          error_code: string
          lease_expires_at: string
          ok: boolean
          request_id: string
          worker_turn_id: string
          worker_turn_index: number
        }[]
      }
      claim_worker_kael_general_turn_atomic: {
        Args: {
          p_claim_id: string
          p_client_request_id: string
          p_content_type: string
          p_media_refs: string[]
          p_now?: string
          p_session_id: string
          p_text_content: string
          p_worker_id: string
        }
        Returns: {
          assistant_turn_id: string
          claimed: boolean
          completed: boolean
          error_code: string
          lease_expires_at: string
          ok: boolean
          request_id: string
          worker_turn_id: string
          worker_turn_index: number
        }[]
      }
      cleanup_orphan_analyzing_jobs: {
        Args: { p_cutoff?: string }
        Returns: {
          cleaned_count: number
        }[]
      }
      commit_kael_ai_batch_item_result: {
        Args: {
          p_batch_id: string
          p_claim_token: string
          p_error_payload: Json
          p_item_id: string
          p_item_status: string
          p_processed_at: string
          p_queue_error_code: string
          p_queue_id: string
          p_queue_state: string
          p_response_payload: Json
        }
        Returns: undefined
      }
      commit_kael_learning_effect_atomic: {
        Args: {
          p_batch_id: string
          p_effect_payload: Json
          p_error_payload: Json
          p_item_id: string
          p_item_status: string
          p_owner_token: string
          p_processed_at: string
          p_queue_error_code: string
          p_queue_id: string
          p_queue_state: string
          p_response_payload: Json
          p_source_mode: string
        }
        Returns: undefined
      }
      complete_customer_account_deletion: {
        Args: { p_client_request_id: string; p_customer_id: string }
        Returns: {
          checkpoint: string
          request_id: string
          request_status: string
        }[]
      }
      complete_harness_idempotency: {
        Args: { p_reservation_id: string; p_response_hash: string }
        Returns: boolean
      }
      complete_job_media_cleanup: {
        Args: { p_claim_token: string; p_intent_ids: string[]; p_now?: string }
        Returns: number
      }
      complete_kael_ai_batch_results_claim: {
        Args: { p_batch_id: string; p_claim_token: string }
        Returns: undefined
      }
      complete_kael_chat_media_cleanup: {
        Args: { p_claim_token: string; p_intent_ids: string[]; p_now?: string }
        Returns: number
      }
      complete_kael_learning_queue_realtime_atomic: {
        Args: { p_claim_id: string; p_now?: string; p_queue_ids: string[] }
        Returns: {
          completed_queue_id: string
          replayed: boolean
        }[]
      }
      complete_scope_change_push_effect_atomic: {
        Args: {
          p_claim_id: string
          p_client_request_id: string
          p_effect_id: string
          p_job_id: string
          p_scope_change_id: string
          p_worker_id: string
        }
        Returns: {
          completed: boolean
        }[]
      }
      complete_worker_kael_chat_turn_atomic: {
        Args: {
          p_ai_model: string
          p_ai_provider: Database["public"]["Enums"]["api_provider"]
          p_claim_id: string
          p_content_type: string
          p_cost_usd: number
          p_job_id: string
          p_latency_ms: number
          p_now?: string
          p_request_id: string
          p_safe_metadata: Json
          p_session_id: string
          p_session_metadata_patch: Json
          p_text_content: string
          p_worker_id: string
          p_worker_turn_id: string
        }
        Returns: {
          applied: boolean
          assistant_turn_id: string
          assistant_turn_index: number
          completed: boolean
          error_code: string
          ok: boolean
          stale: boolean
        }[]
      }
      complete_worker_kael_general_turn_atomic: {
        Args: {
          p_ai_model: string
          p_ai_provider: Database["public"]["Enums"]["api_provider"]
          p_claim_id: string
          p_content_type: string
          p_cost_usd: number
          p_latency_ms: number
          p_now?: string
          p_request_id: string
          p_safe_metadata: Json
          p_session_id: string
          p_session_metadata_patch: Json
          p_text_content: string
          p_worker_id: string
          p_worker_turn_id: string
        }
        Returns: {
          applied: boolean
          assistant_turn_id: string
          assistant_turn_index: number
          completed: boolean
          error_code: string
          ok: boolean
          stale: boolean
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
      confirm_worker_candidate_atomic: {
        Args: {
          p_candidate_id: string
          p_customer_id: string
          p_job_id: string
        }
        Returns: {
          already_applied: boolean
          candidate_id: string
          error_code: string
          job_status: Database["public"]["Enums"]["job_status"]
          ok: boolean
          worker_id: string
        }[]
      }
      confirm_worker_cash_payment: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: {
          cash_commission_collected: number
          cash_commission_due: number
          commission_level: number
          commission_rate_bps: number
          gross_amount: number
          job_id: string
          job_status: Database["public"]["Enums"]["job_status"]
          outcome: string
          payment_received_at: string
          payment_status: string
          payment_updated_at: string
          platform_fee: number
          worker_net: number
        }[]
      }
      consume_job_media_uploads: {
        Args: {
          p_job_id: string
          p_now?: string
          p_object_paths: string[]
          p_owner_id: string
        }
        Returns: {
          consumed_count: number
          ok: boolean
          reason: string
        }[]
      }
      consume_kael_chat_media_uploads: {
        Args: {
          p_customer_id: string
          p_now?: string
          p_object_paths: string[]
        }
        Returns: {
          consumed_count: number
          ok: boolean
          reason: string
        }[]
      }
      create_worker_vietqr_payment_intent: {
        Args: {
          p_customer_id: string
          p_expected_gross_amount: number
          p_job_id: string
          p_payment_code: string
          p_payment_updated_at?: string
          p_qr_image_url: string
          p_transfer_content: string
        }
        Returns: {
          commission_level: number
          commission_rate_bps: number
          gross_amount: number
          job_id: string
          job_status: Database["public"]["Enums"]["job_status"]
          payment_code: string
          payment_updated_at: string
          platform_fee: number
          qr_image_url: string
          transfer_content: string
          worker_net: number
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
      distance_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      enqueue_worker_no_show_reviews: {
        Args: { p_now?: string }
        Returns: {
          fallback_options: Json
          job_id_out: string
          reason_code: string
          worker_id_out: string
        }[]
      }
      expire_harness_reliability_reservations: {
        Args: never
        Returns: {
          idempotency_expired: number
          probes_expired: number
          spend_expired: number
        }[]
      }
      fail_harness_idempotency: {
        Args: { p_error_code: string; p_reservation_id: string }
        Returns: boolean
      }
      fail_job_media_uploads: {
        Args: {
          p_job_id: string
          p_now?: string
          p_object_paths: string[]
          p_owner_id: string
        }
        Returns: {
          ok: boolean
          reason: string
          revoked_paths: string[]
        }[]
      }
      finalize_kael_ai_spend:
        | {
            Args: {
              p_actual_usd: number
              p_purpose: string
              p_reservation_id: number
            }
            Returns: undefined
          }
        | {
            Args: {
              p_actual_usd: number
              p_harness_release_id: string
              p_harness_run_id: string
              p_harness_trace_id: string
              p_provider_attempt_id: string
              p_purpose: string
              p_reservation_id: number
            }
            Returns: undefined
          }
      finish_harness_evaluation: {
        Args: {
          p_artifact_sha256: string
          p_evaluation_id: string
          p_metrics: Json
          p_safe_metadata?: Json
          p_sample_count: number
          p_status: string
          p_variance: Json
        }
        Returns: boolean
      }
      finish_harness_run: {
        Args: {
          p_duration_ms: number
          p_error_code: string
          p_run_id: string
          p_safe_metadata?: Json
          p_status: string
        }
        Returns: boolean
      }
      get_customer_profile_insights_aggregate: {
        Args: { p_customer_id: string }
        Returns: {
          active_service_days: number
          active_streak_days: number
          completed_service_count: number
          disputed_transaction_count: number
          fair_price_service_count: number
          has_primary_address: boolean
          kael_interaction_count: number
          member_since: string
          positive_review_rate_percent: number
          preferred_service_count: number
          price_savings_vnd: number
          protected_transaction_count: number
          protected_value_vnd: number
          reviewed_service_count: number
          total_spend_vnd: number
          total_transaction_count: number
        }[]
      }
      get_kael_provider_spend_today: { Args: never; Returns: number }
      get_worker_current_commission_tier: {
        Args: { p_worker_id: string }
        Returns: {
          commission_level: number
          commission_rate_bps: number
        }[]
      }
      get_worker_earnings_summary: {
        Args: {
          p_from?: string
          p_platform_fee_rate?: number
          p_to?: string
          p_worker_id: string
        }
        Returns: {
          available_balance: number
          cash_commission_collected_total: number
          cash_commission_due_total: number
          current_commission_level: number
          current_commission_rate_bps: number
          daily_earnings: Json
          from_date: string
          gross_earnings: number
          net_earnings: number
          on_hold_amount: number
          pending_payment_amount: number
          pending_payment_count: number
          platform_fee_total: number
          recent_transactions: Json
          to_date: string
          total_jobs_paid: number
          worker_id: string
        }[]
      }
      get_worker_performance_insights_aggregate: {
        Args: { p_worker_id: string }
        Returns: {
          accepted_broadcast_count: number
          average_response_minutes: number
          average_review_rating: number
          completed_job_count: number
          is_approved: boolean
          is_available: boolean
          is_suspended: boolean
          on_time_job_count: number
          paid_job_count: number
          profile_exists: boolean
          profile_rating: number
          profile_total_jobs: number
          reconciled_earnings_vnd: number
          resolved_incident_case_count: number
          responded_broadcast_count: number
          review_count: number
          scheduled_arrival_job_count: number
          total_broadcast_count: number
          verification_status: string
          work_response_review_count: number
          work_response_score: number
        }[]
      }
      increment_kael_market_cache_hit: {
        Args: { p_cache_id: string }
        Returns: undefined
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
      is_circuit_open: {
        Args: { p_key: string; p_now?: string; p_scope: string }
        Returns: boolean
      }
      mark_harness_idempotency_reconcile_required: {
        Args: { p_error_code: string; p_reservation_id: string }
        Returns: boolean
      }
      match_kael_knowledge: {
        Args: {
          p_limit?: number
          p_min_similarity?: number
          p_query_embedding: string
          p_service_type?: string
        }
        Returns: {
          citation_id: string
          content: string
          knowledge_id: string
          knowledge_table: string
          record_key: string
          safe_metadata: Json
          service_type: string
          similarity: number
          title: string
        }[]
      }
      next_job_display_code: { Args: never; Returns: string }
      normalize_hcmc_district_code: {
        Args: { p_input: string }
        Returns: string
      }
      open_dispute_atomic: {
        Args: {
          p_dispute_type: string
          p_evidence_photo_urls?: string[]
          p_initiated_by: string
          p_initiated_by_id: string
          p_initiator_statement: string
          p_job_id: string
          p_kael_neutral_summary?: string
        }
        Returns: {
          admin_review_required: boolean
          created_at_ts: string
          dispute_id: string
          dispute_status: string
          error_code: string
          evidence_locked_at: string
          evidence_snapshot_id: string
          ok: boolean
          priority: string
        }[]
      }
      prepare_customer_account_deletion: {
        Args: { p_client_request_id: string; p_customer_id: string }
        Returns: {
          avatar_storage_ref: string
          checkpoint: string
          request_id: string
          request_status: string
        }[]
      }
      promote_learning_candidate: {
        Args: {
          p_actor_id?: string
          p_actor_role?: string
          p_affected_district?: string
          p_affected_problem?: string
          p_affected_service?: Database["public"]["Enums"]["service_type"]
          p_audit_reason?: string
          p_candidate_payload?: Json
          p_candidate_type: string
          p_confidence?: number
          p_effects?: string[]
          p_evidence_count?: number
          p_job_id?: string
          p_rule_payload?: Json
          p_skill_id: string
          p_target: string
        }
        Returns: {
          candidate_id: string
          error_code: string
          ok: boolean
          rule_id: string
          rule_version: number
        }[]
      }
      queue_learning_candidate_manual_review: {
        Args: {
          p_candidate_id: string
          p_consent_hash: string
          p_evidence_hash: string
          p_input_hash: string
          p_release_id: string
          p_safe_metadata?: Json
          p_source_hash: string
        }
        Returns: {
          candidate_id: string
          error_code: string
          ok: boolean
          status: string
        }[]
      }
      rate_take: {
        Args: {
          p_config: Json
          p_cost: number
          p_key: string
          p_now?: string
          p_scope: string
        }
        Returns: {
          allowed: boolean
          reason: string
          retry_after_ms: number
        }[]
      }
      read_harness_kill_switch: {
        Args: { p_environment: string; p_switch_id: string }
        Returns: {
          enabled: boolean
          reason_code: string
        }[]
      }
      record_circuit_failure: {
        Args: { p_key: string; p_kind: string; p_now?: string; p_scope: string }
        Returns: {
          is_open: boolean
        }[]
      }
      record_circuit_success: {
        Args: { p_key: string; p_scope: string }
        Returns: undefined
      }
      record_customer_cancellation_memory_atomic: {
        Args: {
          p_cancellation_id: string
          p_customer_id: string
          p_job_id: string
        }
        Returns: {
          applied: boolean
        }[]
      }
      record_harness_dependency_result: {
        Args: {
          p_dependency: string
          p_environment: string
          p_error_code: string
          p_half_open_probes: number
          p_open_ms: number
          p_probe_token?: string
          p_release_id: string
          p_success: boolean
          p_threshold: number
          p_window_ms: number
        }
        Returns: string
      }
      record_harness_privileged_operation: {
        Args: {
          p_actor_id_hash: string
          p_actor_role: string
          p_capability: string
          p_environment: string
          p_error_code: string
          p_operation_event_id: string
          p_operation_id: string
          p_reason: string
          p_release_id: string
          p_resource_id_hash: string
          p_resource_type: string
          p_result: string
          p_run_id: string
          p_safe_metadata?: Json
          p_trace_id: string
        }
        Returns: string
      }
      record_harness_slo_observation: {
        Args: {
          p_actual: number
          p_environment: string
          p_release_id: string
          p_safe_metadata?: Json
          p_slo_id: string
          p_window_ended_at: string
          p_window_started_at: string
        }
        Returns: string
      }
      record_kael_ai_batch_poll: {
        Args: {
          p_batch_id: string
          p_canceled_count: number
          p_claim_token: string
          p_ended_at: string
          p_errored_count: number
          p_expired_count: number
          p_expires_at: string
          p_next_poll_at: string
          p_processing_count: number
          p_results_url: string
          p_status: string
          p_succeeded_count: number
        }
        Returns: undefined
      }
      record_kael_ai_spend:
        | {
            Args: { p_actor_id: string; p_cost_usd: number; p_purpose: string }
            Returns: undefined
          }
        | {
            Args: {
              p_actor_id: string
              p_cost_usd: number
              p_harness_release_id: string
              p_harness_run_id: string
              p_harness_trace_id: string
              p_provider_attempt_id: string
              p_purpose: string
            }
            Returns: undefined
          }
      record_kael_provider_spend: {
        Args: { p_cost_usd: number }
        Returns: number
      }
      record_learning_observation_atomic: {
        Args: {
          p_affected_district: string
          p_affected_problem: string
          p_affected_service: Database["public"]["Enums"]["service_type"]
          p_baseline_max: number
          p_baseline_min: number
          p_candidate_type: string
          p_complexity: Database["public"]["Enums"]["complexity_level"]
          p_final_price: number
          p_job_id: string
          p_rating: number
          p_reference_max: number
          p_reference_min: number
          p_review_tags: string[]
          p_reviewed_at: string
          p_scope_change_requested: boolean
        }
        Returns: {
          candidate_id: string
          confidence: number
          error_code: string
          evidence_count: number
          idempotent: boolean
          is_new: boolean
          ok: boolean
          status: string
        }[]
      }
      record_normal_transaction_memory_atomic: {
        Args: { p_customer_id: string; p_job_id: string }
        Returns: {
          applied: boolean
        }[]
      }
      record_worker_app_active_minute: {
        Args: { p_worker_id: string }
        Returns: {
          active_minutes: number
          incremented: boolean
          last_active_at: string
          worker_id: string
        }[]
      }
      record_worker_cancellation_memory_atomic: {
        Args: {
          p_cancellation_id: string
          p_job_id: string
          p_sub_case: string
          p_worker_id: string
        }
        Returns: {
          applied: boolean
        }[]
      }
      record_worker_disintermediation_memory_atomic: {
        Args: {
          p_job_id: string
          p_message_id: string
          p_signals: string[]
          p_worker_id: string
        }
        Returns: {
          applied: boolean
          disintermediation_risk_count: number
        }[]
      }
      record_worker_kael_qa_atomic: {
        Args: {
          p_answer: Json
          p_job_id: string
          p_now?: string
          p_question: string
          p_worker_id: string
        }
        Returns: {
          error_code: string
          ok: boolean
          qa_id: string
          remaining_questions: number
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
      register_harness_release: {
        Args: {
          p_access_matrix_sha256: string
          p_bundle_sha256: string
          p_capability_registry_sha256: string
          p_created_by: string
          p_database_types_sha256: string
          p_edge_function_digests: Json
          p_environment: string
          p_evaluation_suite_sha256: string
          p_evaluation_suite_version: string
          p_git_sha: string
          p_manifest_sha256: string
          p_migration_inventory_sha256: string
          p_policy_bundle_sha256: string
          p_previous_release_id: string
          p_promotion_policy_sha256: string
          p_prompt_bundle_sha256: string
          p_release_artifact: Json
          p_release_id: string
          p_reliability_policy_sha256: string
          p_runtime_configuration_sha256: string
          p_safe_metadata?: Json
        }
        Returns: {
          access_matrix_sha256: string
          bundle_sha256: string
          capability_registry_sha256: string
          created_at: string
          created_by: string
          database_types_sha256: string
          edge_function_digests: Json
          environment: string
          evaluation_suite_sha256: string
          evaluation_suite_version: string
          git_sha: string
          manifest_sha256: string
          migration_inventory_sha256: string
          policy_bundle_sha256: string
          previous_release_id: string | null
          promotion_policy_sha256: string
          prompt_bundle_sha256: string
          release_artifact: Json
          release_id: string
          reliability_policy_sha256: string
          runtime_configuration_sha256: string
          safe_metadata: Json
        }
        SetofOptions: {
          from: "*"
          to: "harness_releases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_worker_candidate_atomic: {
        Args: {
          p_candidate_id: string
          p_customer_id: string
          p_job_id: string
        }
        Returns: {
          already_applied: boolean
          candidate_id: string
          error_code: string
          job_status: Database["public"]["Enums"]["job_status"]
          ok: boolean
          worker_id: string
        }[]
      }
      release_job_broadcast_retry_claim_atomic: {
        Args: { p_claim_token: string; p_customer_id: string; p_job_id: string }
        Returns: {
          released: boolean
        }[]
      }
      release_job_incident_assistant_claim_atomic: {
        Args: {
          p_assistant_claim_id: string
          p_job_id: string
          p_source_event_id: string
        }
        Returns: {
          released: boolean
        }[]
      }
      release_job_incident_scope_proposal_atomic: {
        Args: { p_claim_id: string; p_incident_id: string; p_job_id: string }
        Returns: {
          released: boolean
        }[]
      }
      release_kael_ai_batch_results_claims: {
        Args: {
          p_claim_token: string
          p_error_code: string
          p_retry_at: string
        }
        Returns: undefined
      }
      release_scope_change_push_effect_atomic: {
        Args: {
          p_claim_id: string
          p_client_request_id: string
          p_effect_id: string
          p_error_code: string
          p_job_id: string
          p_scope_change_id: string
          p_worker_id: string
        }
        Returns: {
          released: boolean
        }[]
      }
      release_scope_change_request_claim_atomic: {
        Args: {
          p_claim_id: string
          p_client_request_id: string
          p_error_code: string
          p_job_id: string
          p_worker_id: string
        }
        Returns: {
          released: boolean
        }[]
      }
      release_worker_kael_chat_turn_claim_atomic: {
        Args: {
          p_claim_id: string
          p_discard?: boolean
          p_now?: string
          p_request_id: string
          p_session_id: string
          p_worker_id: string
        }
        Returns: {
          discarded: boolean
          released: boolean
        }[]
      }
      renew_kael_ai_batch_results_claim: {
        Args: {
          p_batch_id: string
          p_claim_token: string
          p_claimed_at: string
        }
        Returns: undefined
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
      request_job_incident_scope_change_atomic: {
        Args: {
          p_claim_id: string
          p_evidence_photo_urls: string[]
          p_incident_id: string
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
      request_scope_change_atomic: {
        Args: {
          p_claim_id: string
          p_client_request_id: string
          p_database_effect_id?: string
          p_database_effect_payload?: Json
          p_evidence_photo_urls: string[]
          p_job_id: string
          p_kael_computed_max: number
          p_kael_computed_min: number
          p_kael_review: Json
          p_learning_effect_id?: string
          p_learning_effect_payload?: Json
          p_new_description: string
          p_push_effect_id?: string
          p_reason: string
          p_worker_id: string
        }
        Returns: {
          created_at_ts: string
          error_code: string
          ok: boolean
          replayed: boolean
          response_payload: Json
          scope_change_id: string
          scope_status: Database["public"]["Enums"]["scope_change_status"]
          side_effects_state: Json
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
      reserve_harness_idempotency: {
        Args: {
          p_actor_id_hash: string
          p_environment: string
          p_key_hash: string
          p_operation_id: string
          p_release_id: string
          p_request_hash: string
          p_ttl_seconds: number
        }
        Returns: {
          reservation_id: string
          response_hash: string
          state: string
        }[]
      }
      reserve_job_media_upload: {
        Args: {
          p_file_size_bytes: number
          p_job_id: string
          p_mime_type: string
          p_now?: string
          p_object_path: string
          p_owner_id: string
          p_stage: string
        }
        Returns: {
          allowed: boolean
          expires_at: string
          intent_id: string
          reason: string
        }[]
      }
      reserve_kael_ai_spend:
        | {
            Args: {
              p_actor_id: string
              p_estimated_usd: number
              p_global_daily_cap: number
              p_purpose: string
              p_user_daily_cap: number
              p_user_monthly_cap: number
            }
            Returns: {
              allowed: boolean
              blocked_scope: string
              reservation_id: number
            }[]
          }
        | {
            Args: {
              p_actor_id: string
              p_estimated_usd: number
              p_global_daily_cap: number
              p_harness_release_id: string
              p_harness_run_id: string
              p_harness_trace_id: string
              p_provider_attempt_id: string
              p_purpose: string
              p_user_daily_cap: number
              p_user_monthly_cap: number
            }
            Returns: {
              allowed: boolean
              blocked_scope: string
              reservation_id: number
            }[]
          }
      reserve_kael_chat_media_upload: {
        Args: {
          p_customer_id: string
          p_file_size_bytes: number
          p_mime_type: string
          p_now?: string
          p_object_path: string
          p_purpose: string
        }
        Returns: {
          allowed: boolean
          expires_at: string
          intent_id: string
          reason: string
        }[]
      }
      revoke_job_media_uploads: {
        Args: {
          p_job_id: string
          p_now?: string
          p_object_paths: string[]
          p_owner_id: string
        }
        Returns: {
          ok: boolean
          reason: string
          revoked_paths: string[]
        }[]
      }
      revoke_kael_chat_media_uploads: {
        Args: {
          p_customer_id: string
          p_now?: string
          p_object_paths: string[]
        }
        Returns: {
          ok: boolean
          reason: string
          revoked_paths: string[]
        }[]
      }
      revoke_learning_rule_with_provenance: {
        Args: {
          p_admin_id: string
          p_reason: string
          p_release_id: string
          p_rule_id: string
          p_rule_version: number
        }
        Returns: {
          cascaded_count: number
          error_code: string
          ok: boolean
          rule_id: string
          rule_version: number
        }[]
      }
      rollback_learning_rule: {
        Args: {
          p_reason?: string
          p_rule_id: string
          p_safe_metadata?: Json
          p_skill_id: string
        }
        Returns: {
          error_code: string
          ok: boolean
          rule_id: string
        }[]
      }
      set_harness_kill_switch: {
        Args: {
          p_actor_id: string
          p_enabled: boolean
          p_environment: string
          p_reason_code: string
          p_release_id: string
          p_safe_metadata?: Json
          p_switch_id: string
        }
        Returns: boolean
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
      start_harness_idempotency_execution: {
        Args: { p_reservation_id: string }
        Returns: boolean
      }
      submit_counter_statement_atomic: {
        Args: { p_actor_id: string; p_dispute_id: string; p_statement: string }
        Returns: {
          dispute_id: string
          dispute_status: string
          error_code: string
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
      submit_worker_registration_atomic: {
        Args: {
          p_actor_id: string
          p_bank_account: string
          p_bank_name: string
          p_cccd_back_url: string
          p_cccd_front_url: string
          p_date_of_birth: string
          p_districts: string[]
          p_gender: string
          p_home_lat: number
          p_home_lng: number
          p_legal_name: string
          p_problem_specializations: string[]
          p_selfie_url: string
          p_service_radius_km: number
          p_service_types: Database["public"]["Enums"]["service_type"][]
          p_worker_id: string
          p_years_experience: number
        }
        Returns: {
          error_code: string
          idempotent_out: boolean
          ok: boolean
          submitted_at_ts: string
          verification_status_out: Database["public"]["Enums"]["worker_verification_status"]
          worker_id_out: string
        }[]
      }
      transition_harness_promotion: {
        Args: {
          p_actor_id: string
          p_approval_id: string
          p_environment: string
          p_evaluation_report_id: string
          p_expected_state: string
          p_next_state: string
          p_packet_sha256: string
          p_reason_code?: string
          p_release_id: string
          p_rollback_release_id: string
          p_safe_metadata?: Json
        }
        Returns: {
          error_code: string
          ok: boolean
          promotion_id: string
          state: string
        }[]
      }
      unregister_device_push_token_atomic: {
        Args: { p_push_token: string; p_user_id: string }
        Returns: {
          token_id: string
          unregistered_out: boolean
          updated_at_ts: string
        }[]
      }
      update_worker_kael_memory_preference: {
        Args: { p_enabled: boolean; p_key: string; p_worker_id: string }
        Returns: boolean
      }
      upsert_customer_refund_payment_method: {
        Args: {
          p_account_holder_name: string
          p_bank_account: string
          p_bank_key: string
          p_customer_id: string
        }
        Returns: {
          bank_account_masked: string
          bank_key: string
          bank_name: string
          id: string
          is_default: boolean
          status: string
          updated_at: string
          verified_at: string
        }[]
      }
      upsert_job_incident_signal_atomic: {
        Args: {
          p_assistant_claim_id: string
          p_content: string
          p_evidence_photo_urls: Json
          p_job_id: string
          p_opened_by: string
          p_reported_description: string
          p_reported_reason: string
          p_request_id: string
        }
        Returns: {
          claimed: boolean
          error_code: string
          idempotent: boolean
          incident: Json
          ok: boolean
          revision: number
          source_event_id: string
        }[]
      }
      validate_scope_change_evidence_refs: {
        Args: { p_job_id: string; p_media_refs: string[]; p_worker_id: string }
        Returns: {
          ok: boolean
          reason: string
          validated_refs: string[]
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
        | "worker_candidate_pending"
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
        | "manual_review"
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
      service_type:
        | "electrical"
        | "plumbing"
        | "cleaning"
        | "hvac"
        | "upholstery"
        | "handyman"
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
  graphql_public: {
    Enums: {},
  },
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
        "worker_candidate_pending",
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
        "manual_review",
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
      service_type: [
        "electrical",
        "plumbing",
        "cleaning",
        "hvac",
        "upholstery",
        "handyman",
      ],
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
