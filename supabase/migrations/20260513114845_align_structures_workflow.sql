-- =============================================================================
-- Migration: 20260513114845_align_structures_workflow.sql
-- Mission 3: Align Supabase schema with STRUCTURES.md workflow blueprint
--
-- Scope:
-- - local-first schema alignment only
-- - no remote production db push
-- - no backend route, mobile UI, payment, or Kael runtime implementation
-- =============================================================================

-- =============================================================================
-- DROP LEGACY/BROAD POLICIES BEFORE TYPE AND RLS REWORK
-- =============================================================================

drop policy if exists "Users read own profile" on profiles;
drop policy if exists "Users update own profile" on profiles;
drop policy if exists "Customers view approved worker public info" on profiles;
drop policy if exists "Customers manage own customer profile" on customer_profiles;
drop policy if exists "Workers manage own worker profile" on worker_profiles;
drop policy if exists "Customers view approved worker profiles" on worker_profiles;
drop policy if exists "Authenticated users read price baselines" on price_baselines;
drop policy if exists "Customers view own jobs" on jobs;
drop policy if exists "Customers create jobs" on jobs;
drop policy if exists "Customers update own jobs" on jobs;
drop policy if exists "Workers view assigned or broadcasted jobs" on jobs;
drop policy if exists "Workers update assigned jobs" on jobs;
drop policy if exists "Workers view own broadcasts" on job_broadcasts;
drop policy if exists "Workers respond to own broadcasts" on job_broadcasts;
drop policy if exists "Job participants read messages" on chat_messages;
drop policy if exists "Job participants send messages" on chat_messages;
drop policy if exists "Customers create reviews for confirmed jobs" on reviews;
drop policy if exists "Authenticated users read reviews" on reviews;

drop policy if exists "Admin view all profiles" on profiles;
drop policy if exists "Admin update all profiles" on profiles;
drop policy if exists "Admin view all customer profiles" on customer_profiles;
drop policy if exists "Admin view all worker profiles" on worker_profiles;
drop policy if exists "Admin update all worker profiles" on worker_profiles;
drop policy if exists "Admin manage price baselines" on price_baselines;
drop policy if exists "Admin view all jobs" on jobs;
drop policy if exists "Admin update all jobs" on jobs;
drop policy if exists "Admin view all broadcasts" on job_broadcasts;
drop policy if exists "Admin view all messages" on chat_messages;
drop policy if exists "Admin manage reviews" on reviews;
drop policy if exists "Admin view all api logs" on api_logs;

drop policy if exists "Authenticated users upload job photos" on storage.objects;
drop policy if exists "Authenticated users view job photos" on storage.objects;
drop policy if exists "Authenticated users upload completion photos" on storage.objects;
drop policy if exists "Authenticated users view completion photos" on storage.objects;
drop policy if exists "Workers upload own documents" on storage.objects;
drop policy if exists "Workers view own documents" on storage.objects;

drop function if exists is_admin();

-- =============================================================================
-- PRIVATE HELPER SCHEMA
-- =============================================================================

create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

create or replace function private.is_job_participant(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs
    where id = p_job_id
      and (
        customer_id = (select auth.uid())
        or worker_id = (select auth.uid())
      )
  )
  or private.is_admin();
$$;

create or replace function private.is_job_customer(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs
    where id = p_job_id
      and customer_id = (select auth.uid())
  )
  or private.is_admin();
$$;

create or replace function private.is_job_worker(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs
    where id = p_job_id
      and worker_id = (select auth.uid())
  )
  or private.is_admin();
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_job_participant(uuid) to authenticated;
grant execute on function private.is_job_customer(uuid) to authenticated;
grant execute on function private.is_job_worker(uuid) to authenticated;

-- =============================================================================
-- ENUM ALIGNMENT
-- =============================================================================

alter table jobs alter column status drop default;
alter type job_status rename to job_status_legacy;
create type job_status as enum (
  'draft',
  'analyzing',
  'estimate_ready',
  'awaiting_customer_confirm',
  'broadcasting',
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
  'confirmed_by_customer',
  'payment_pending',
  'paid',
  'reviewed',
  'cancelled'
);

alter table jobs
  alter column status type job_status
  using (
    case status::text
      when 'pending' then 'analyzing'
      when 'broadcast' then 'broadcasting'
      when 'matched' then 'worker_matched'
      when 'worker_en_route' then 'worker_on_way'
      when 'inspecting' then 'inspecting'
      when 'in_progress' then 'repairing'
      when 'scope_change' then 'scope_change_pending'
      when 'completed' then 'completed_by_worker'
      when 'confirmed' then 'confirmed_by_customer'
      when 'paid' then 'paid'
      when 'cancelled' then 'cancelled'
      else 'draft'
    end
  )::job_status;

alter table jobs alter column status set default 'draft';
drop type job_status_legacy;

alter table job_broadcasts alter column status drop default;
alter type broadcast_status rename to broadcast_status_legacy;
create type broadcast_status as enum (
  'pending',
  'sent',
  'accepted',
  'declined',
  'expired',
  'reassigned',
  'cancelled'
);

alter table job_broadcasts
  alter column status type broadcast_status
  using (
    case status::text
      when 'pending' then 'pending'
      when 'accepted' then 'accepted'
      when 'declined' then 'declined'
      when 'expired' then 'expired'
      else 'pending'
    end
  )::broadcast_status;

alter table job_broadcasts alter column status set default 'pending';
drop type broadcast_status_legacy;

create type scope_change_status as enum (
  'requested_by_worker',
  'reviewing_by_kael',
  'waiting_customer_decision',
  'approved_by_customer',
  'rejected_by_customer',
  'cancelled'
);

create type worker_verification_status as enum (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'suspended'
);

create type notification_status as enum (
  'created',
  'queued',
  'sent',
  'failed',
  'read',
  'archived'
);

create type learning_candidate_status as enum (
  'created',
  'pending_evidence',
  'evidence_gate_passed',
  'auto_promoted',
  'rejected',
  'rolled_back',
  'archived'
);

create type learning_rule_status as enum (
  'draft',
  'active',
  'monitoring',
  'degraded',
  'disabled',
  'rolled_back'
);

-- =============================================================================
-- SERVICE TAXONOMY
-- =============================================================================

create table service_categories (
  id           uuid primary key default gen_random_uuid(),
  service_type service_type not null unique,
  slug         text not null unique,
  label_vi     text not null,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger service_categories_updated_at
  before update on service_categories
  for each row execute function update_updated_at();

create table service_problems (
  id                  uuid primary key default gen_random_uuid(),
  service_category_id uuid references service_categories on delete restrict not null,
  service_type         service_type not null,
  slug                 text not null,
  label_vi             text not null,
  default_complexity   complexity_level not null default 'small',
  is_active            boolean not null default true,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (service_category_id, slug)
);

create index service_problems_service_type_idx on service_problems (service_type);

create trigger service_problems_updated_at
  before update on service_problems
  for each row execute function update_updated_at();

insert into service_categories (service_type, slug, label_vi, sort_order) values
  ('electrical', 'electrical', 'Sua dien', 10),
  ('plumbing', 'plumbing', 'Sua nuoc', 20)
on conflict (service_type) do update
set
  slug = excluded.slug,
  label_vi = excluded.label_vi,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into service_problems (
  service_category_id,
  service_type,
  slug,
  label_vi,
  default_complexity,
  sort_order
) values
  (
    (select id from service_categories where service_type = 'electrical'),
    'electrical',
    'electrical-general',
    'Su co dien tong quat',
    'small',
    10
  ),
  (
    (select id from service_categories where service_type = 'plumbing'),
    'plumbing',
    'plumbing-general',
    'Su co nuoc tong quat',
    'small',
    10
  )
on conflict (service_category_id, slug) do update
set
  label_vi = excluded.label_vi,
  default_complexity = excluded.default_complexity,
  sort_order = excluded.sort_order,
  updated_at = now();

-- =============================================================================
-- PRICE BASELINE ALIGNMENT
-- =============================================================================

alter table price_baselines
  add column service_problem_id uuid references service_problems on delete restrict,
  add column district_code text not null default 'hcmc_all',
  add column source text not null default 'admin_seed',
  add column version int not null default 1,
  add column created_at timestamptz not null default now();

update price_baselines pb
set service_problem_id = sp.id
from service_problems sp
where sp.service_type = pb.service_type
  and sp.slug = pb.service_type::text || '-general';

alter table price_baselines
  alter column service_problem_id set not null,
  add constraint price_baselines_price_range_check check (price_max >= price_min and price_min > 0),
  drop constraint if exists price_baselines_service_type_complexity_key,
  add constraint price_baselines_problem_district_complexity_key
    unique (service_problem_id, district_code, complexity);

create index price_baselines_problem_idx on price_baselines (service_problem_id);
create index price_baselines_district_idx on price_baselines (district_code);

-- =============================================================================
-- WORKER PROFILE ALIGNMENT
-- =============================================================================

alter table worker_profiles
  add column verification_status worker_verification_status not null default 'draft',
  add column is_suspended boolean not null default false;

update worker_profiles
set verification_status = case
  when is_approved = true then 'approved'::worker_verification_status
  else 'draft'::worker_verification_status
end;

-- =============================================================================
-- JOB WORKFLOW ALIGNMENT
-- =============================================================================

alter table jobs
  add column service_problem_id uuid references service_problems on delete restrict,
  add column estimate_ready_at timestamptz,
  add column confirmed_search_at timestamptz,
  add column arrived_at timestamptz,
  add column reviewed_at timestamptz;

update jobs j
set service_problem_id = sp.id
from service_problems sp
where sp.service_type = j.service_type
  and sp.slug = j.service_type::text || '-general';

create index jobs_service_problem_id_idx on jobs (service_problem_id);
create index jobs_status_created_at_idx on jobs (status, created_at desc);

alter table job_broadcasts
  add column batch_id uuid not null default gen_random_uuid(),
  add column sent_at timestamptz,
  add column expires_at timestamptz;

create index job_broadcasts_status_idx on job_broadcasts (status);
create index job_broadcasts_batch_id_idx on job_broadcasts (batch_id);

-- =============================================================================
-- EVENT, SCOPE CHANGE, NOTIFICATION, AND LEARNING TABLES
-- =============================================================================

create table job_events (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid references jobs on delete cascade not null,
  actor_id      uuid references profiles,
  actor_role    user_role,
  event_type    text not null,
  from_status   job_status,
  to_status     job_status,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index job_events_job_id_created_at_idx on job_events (job_id, created_at);
create index job_events_event_type_idx on job_events (event_type);

create table scope_change_requests (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid references jobs on delete cascade not null,
  worker_id           uuid references profiles not null,
  status              scope_change_status not null default 'requested_by_worker',
  original_summary    text,
  requested_description text not null,
  reason              text not null,
  price_min           int not null check (price_min > 0),
  price_max           int not null check (price_max >= price_min),
  kael_review         jsonb,
  customer_decision_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index scope_change_requests_job_id_idx on scope_change_requests (job_id);
create index scope_change_requests_worker_id_idx on scope_change_requests (worker_id);
create index scope_change_requests_status_idx on scope_change_requests (status);

create trigger scope_change_requests_updated_at
  before update on scope_change_requests
  for each row execute function update_updated_at();

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references profiles on delete cascade not null,
  job_id        uuid references jobs on delete cascade,
  status        notification_status not null default 'created',
  channel       text not null default 'in_app',
  event_type    text not null,
  title         text not null,
  body          text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  read_at       timestamptz
);

create index notifications_user_status_idx on notifications (user_id, status, created_at desc);
create index notifications_job_id_idx on notifications (job_id);

create table learning_candidates (
  id               uuid primary key default gen_random_uuid(),
  candidate_type   text not null,
  affected_service service_type,
  affected_problem text,
  affected_district text,
  suggested_payload jsonb not null default '{}'::jsonb,
  confidence       numeric(4,3) not null default 0 check (confidence >= 0 and confidence <= 1),
  evidence_count   int not null default 0 check (evidence_count >= 0),
  status           learning_candidate_status not null default 'created',
  audit_reason     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  promoted_at      timestamptz,
  rolled_back_at   timestamptz
);

create index learning_candidates_status_idx on learning_candidates (status);
create index learning_candidates_scope_idx on learning_candidates (affected_service, affected_problem, affected_district);

create trigger learning_candidates_updated_at
  before update on learning_candidates
  for each row execute function update_updated_at();

create table learning_rules (
  id               uuid primary key default gen_random_uuid(),
  rule_type        text not null,
  affected_service service_type,
  affected_problem text,
  affected_district text,
  rule_payload     jsonb not null default '{}'::jsonb,
  confidence       numeric(4,3) not null default 0 check (confidence >= 0 and confidence <= 1),
  evidence_count   int not null default 0 check (evidence_count >= 0),
  status           learning_rule_status not null default 'draft',
  active_version   int not null default 1 check (active_version > 0),
  rollback_available boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index learning_rules_status_idx on learning_rules (status);
create index learning_rules_scope_idx on learning_rules (affected_service, affected_problem, affected_district);

create trigger learning_rules_updated_at
  before update on learning_rules
  for each row execute function update_updated_at();

create table learning_rule_versions (
  id            uuid primary key default gen_random_uuid(),
  rule_id       uuid references learning_rules on delete cascade not null,
  version       int not null check (version > 0),
  rule_payload  jsonb not null,
  change_reason text not null,
  status        learning_rule_status not null default 'active',
  created_at    timestamptz not null default now(),
  unique (rule_id, version)
);

create index learning_rule_versions_rule_id_idx on learning_rule_versions (rule_id);

-- =============================================================================
-- API LOG ALIGNMENT
-- =============================================================================

alter table api_logs
  add column request_id text,
  add column purpose text,
  add column prompt_version text,
  add column fallback_used boolean not null default false,
  add column safe_metadata jsonb not null default '{}'::jsonb;

create index api_logs_request_id_idx on api_logs (request_id);
create index api_logs_purpose_idx on api_logs (purpose);

-- =============================================================================
-- ROW LEVEL SECURITY FOR NEW TABLES
-- =============================================================================

alter table service_categories enable row level security;
alter table service_problems enable row level security;
alter table job_events enable row level security;
alter table scope_change_requests enable row level security;
alter table notifications enable row level security;
alter table learning_candidates enable row level security;
alter table learning_rules enable row level security;
alter table learning_rule_versions enable row level security;

create policy "Users read own profile"
  on profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Admins manage profiles"
  on profiles for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Users read own customer profile"
  on customer_profiles for select
  to authenticated
  using ((select auth.uid()) = id or private.is_admin());

create policy "Admins manage customer profiles"
  on customer_profiles for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Workers read own worker profile"
  on worker_profiles for select
  to authenticated
  using ((select auth.uid()) = id or private.is_admin());

create policy "Admins manage worker profiles"
  on worker_profiles for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Authenticated users read service categories"
  on service_categories for select
  to authenticated
  using (is_active = true or private.is_admin());

create policy "Admins manage service categories"
  on service_categories for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Authenticated users read service problems"
  on service_problems for select
  to authenticated
  using (is_active = true or private.is_admin());

create policy "Admins manage service problems"
  on service_problems for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Authenticated users read price baselines"
  on price_baselines for select
  to authenticated
  using (true);

create policy "Admins manage price baselines"
  on price_baselines for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Participants read jobs"
  on jobs for select
  to authenticated
  using (private.is_job_participant(id));

create policy "Admins manage jobs"
  on jobs for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Workers read own broadcasts"
  on job_broadcasts for select
  to authenticated
  using ((select auth.uid()) = worker_id or private.is_admin());

create policy "Admins manage broadcasts"
  on job_broadcasts for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Participants read messages"
  on chat_messages for select
  to authenticated
  using (private.is_job_participant(job_id));

create policy "Participants send messages"
  on chat_messages for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and private.is_job_participant(job_id)
  );

create policy "Admins manage messages"
  on chat_messages for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Participants read reviews"
  on reviews for select
  to authenticated
  using (
    private.is_job_participant(job_id)
    or private.is_admin()
  );

create policy "Customers create reviews after confirmation"
  on reviews for insert
  to authenticated
  with check (
    (select auth.uid()) = customer_id
    and exists (
      select 1
      from jobs j
      where j.id = reviews.job_id
        and j.customer_id = (select auth.uid())
        and j.status in ('confirmed_by_customer', 'payment_pending', 'paid', 'reviewed')
    )
  );

create policy "Admins manage reviews"
  on reviews for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Participants read job events"
  on job_events for select
  to authenticated
  using (private.is_job_participant(job_id));

create policy "Admins manage job events"
  on job_events for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Participants read scope changes"
  on scope_change_requests for select
  to authenticated
  using (private.is_job_participant(job_id));

create policy "Admins manage scope changes"
  on scope_change_requests for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Users read own notifications"
  on notifications for select
  to authenticated
  using ((select auth.uid()) = user_id or private.is_admin());

create policy "Admins manage notifications"
  on notifications for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Admins read api logs"
  on api_logs for select
  to authenticated
  using (private.is_admin());

create policy "Admins read learning candidates"
  on learning_candidates for select
  to authenticated
  using (private.is_admin());

create policy "Admins manage learning candidates"
  on learning_candidates for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Admins read learning rules"
  on learning_rules for select
  to authenticated
  using (private.is_admin());

create policy "Admins manage learning rules"
  on learning_rules for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Admins read learning rule versions"
  on learning_rule_versions for select
  to authenticated
  using (private.is_admin());

create policy "Admins manage learning rule versions"
  on learning_rule_versions for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- =============================================================================
-- STORAGE POLICY TIGHTENING
-- =============================================================================

create policy "Participants upload job photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-photos'
    and private.is_job_participant((storage.foldername(name))[1]::uuid)
  );

create policy "Participants read job photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'job-photos'
    and private.is_job_participant((storage.foldername(name))[1]::uuid)
  );

create policy "Workers upload completion photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'completion-photos'
    and private.is_job_worker((storage.foldername(name))[1]::uuid)
  );

create policy "Participants read completion photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'completion-photos'
    and private.is_job_participant((storage.foldername(name))[1]::uuid)
  );

create policy "Workers upload own documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'worker-documents'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Workers read own documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'worker-documents'
    and (
      (select auth.uid())::text = (storage.foldername(name))[1]
      or private.is_admin()
    )
  );

alter publication supabase_realtime add table job_events;
alter publication supabase_realtime add table scope_change_requests;
alter publication supabase_realtime add table notifications;

-- =============================================================================
-- EXPLICIT DATA API GRANTS FOR EXPOSED PUBLIC TABLES
-- =============================================================================

grant usage on schema public to authenticated;

grant select on
  profiles,
  customer_profiles,
  worker_profiles,
  service_categories,
  service_problems,
  price_baselines,
  jobs,
  job_broadcasts,
  chat_messages,
  reviews,
  job_events,
  scope_change_requests,
  notifications,
  api_logs,
  learning_candidates,
  learning_rules,
  learning_rule_versions
to authenticated;

grant insert on chat_messages, reviews to authenticated;

grant insert, update, delete on
  profiles,
  customer_profiles,
  worker_profiles,
  service_categories,
  service_problems,
  price_baselines,
  jobs,
  job_broadcasts,
  chat_messages,
  reviews,
  job_events,
  scope_change_requests,
  notifications,
  api_logs,
  learning_candidates,
  learning_rules,
  learning_rule_versions
to authenticated;

-- Service role remains the write path for backend-controlled workflow state.
grant all on
  service_categories,
  service_problems,
  price_baselines,
  jobs,
  job_broadcasts,
  chat_messages,
  reviews,
  job_events,
  scope_change_requests,
  notifications,
  api_logs,
  learning_candidates,
  learning_rules,
  learning_rule_versions
to service_role;
