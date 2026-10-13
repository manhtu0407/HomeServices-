ALTER TABLE monitor_state ADD COLUMN consecutive_supabase_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_supabase_failures >= 0);
ALTER TABLE monitor_state ADD COLUMN consecutive_supabase_successes INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_supabase_successes >= 0);
ALTER TABLE monitor_state ADD COLUMN last_supabase_failure_reason TEXT;
