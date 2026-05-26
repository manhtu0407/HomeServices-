-- P7 Kael learning skill setup: application/lifecycle logs for queued learning candidates.
-- Learning execution remains service-role owned; authenticated users get admin-only read via RLS.

create table if not exists public.kael_rule_application_log (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.learning_rules(id) on delete set null,
  candidate_id uuid references public.learning_candidates(id) on delete set null,
  skill_id text not null check (skill_id in ('LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'LS6', 'LS7')),
  job_id uuid references public.jobs(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text check (actor_role in ('customer', 'worker', 'admin', 'system')),
  applied_target text not null check (
    applied_target in (
      'analysis_prompt',
      'price_prior',
      'clarification_pattern',
      'advisory_pattern',
      'detection_pattern',
      'intent_category'
    )
  ),
  applied_count int not null default 0 check (applied_count >= 0),
  override_count int not null default 0 check (override_count >= 0),
  accuracy_delta numeric(6,3),
  satisfaction_delta numeric(6,3),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.kael_rule_lifecycle_log (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.learning_rules(id) on delete set null,
  candidate_id uuid references public.learning_candidates(id) on delete set null,
  skill_id text not null check (skill_id in ('LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'LS6', 'LS7')),
  job_id uuid references public.jobs(id) on delete set null,
  previous_state text check (
    previous_state is null or previous_state in (
      'candidate',
      'pending_evidence',
      'evidence_gate_check',
      'auto_promoted',
      'manual_review',
      'active',
      'monitoring',
      'degraded',
      'rolled_back',
      'archived',
      'rejected'
    )
  ),
  next_state text not null check (
    next_state in (
      'candidate',
      'pending_evidence',
      'evidence_gate_check',
      'auto_promoted',
      'manual_review',
      'active',
      'monitoring',
      'degraded',
      'rolled_back',
      'archived',
      'rejected'
    )
  ),
  transition_reason text not null check (char_length(transition_reason) between 3 and 200),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text check (actor_role in ('customer', 'worker', 'admin', 'system')),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists kael_rule_application_log_rule_idx
  on public.kael_rule_application_log(rule_id, created_at desc);
create index if not exists kael_rule_application_log_skill_job_idx
  on public.kael_rule_application_log(skill_id, job_id, created_at desc);
create index if not exists kael_rule_application_log_actor_idx
  on public.kael_rule_application_log(actor_id, created_at desc);

create index if not exists kael_rule_lifecycle_log_rule_idx
  on public.kael_rule_lifecycle_log(rule_id, created_at desc);
create index if not exists kael_rule_lifecycle_log_candidate_idx
  on public.kael_rule_lifecycle_log(candidate_id, created_at desc);
create index if not exists kael_rule_lifecycle_log_skill_job_idx
  on public.kael_rule_lifecycle_log(skill_id, job_id, created_at desc);

alter table public.kael_rule_application_log enable row level security;
alter table public.kael_rule_lifecycle_log enable row level security;

drop policy if exists "Admins read kael rule application log" on public.kael_rule_application_log;
create policy "Admins read kael rule application log"
  on public.kael_rule_application_log
  for select
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins read kael rule lifecycle log" on public.kael_rule_lifecycle_log;
create policy "Admins read kael rule lifecycle log"
  on public.kael_rule_lifecycle_log
  for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_rule_application_log from public;
revoke all on public.kael_rule_application_log from anon;
revoke all on public.kael_rule_application_log from authenticated;
revoke insert, update, delete on public.kael_rule_application_log from authenticated;
grant select on public.kael_rule_application_log to authenticated;
grant all on public.kael_rule_application_log to service_role;

revoke all on public.kael_rule_lifecycle_log from public;
revoke all on public.kael_rule_lifecycle_log from anon;
revoke all on public.kael_rule_lifecycle_log from authenticated;
revoke insert, update, delete on public.kael_rule_lifecycle_log from authenticated;
grant select on public.kael_rule_lifecycle_log to authenticated;
grant all on public.kael_rule_lifecycle_log to service_role;

comment on table public.kael_rule_application_log is
  'Kael P7 learning rule performance/application log. Service role writes; admins read.';
comment on table public.kael_rule_lifecycle_log is
  'Kael P7 learning skill lifecycle queue and transition log. Service role writes; admins read.';
