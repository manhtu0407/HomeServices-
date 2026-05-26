-- P1 Kael Harness foundation: permission, advisory, and memory audit shells.

create table if not exists public.kael_permission_audit (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('customer', 'worker', 'admin', 'system')),
  purpose text not null,
  action text not null,
  topic text,
  decision text not null check (decision in ('allow', 'deny', 'rate_limit', 'escalate')),
  reason_code text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.kael_advisory_audit (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  purpose text not null,
  advisory_type text not null,
  template_key text,
  artifact_id uuid,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.kael_memory_audit (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('customer', 'worker', 'job', 'domain', 'system')),
  subject_id uuid,
  actor_id uuid references public.profiles(id) on delete set null,
  operation text not null check (operation in ('read', 'write', 'delete', 'archive')),
  layer text not null,
  purpose text not null,
  token_count integer check (token_count is null or token_count >= 0),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.kael_permission_audit enable row level security;
alter table public.kael_advisory_audit enable row level security;
alter table public.kael_memory_audit enable row level security;

create index if not exists kael_permission_audit_job_idx
  on public.kael_permission_audit (job_id);
create index if not exists kael_permission_audit_purpose_idx
  on public.kael_permission_audit (purpose, created_at desc);
create index if not exists kael_permission_audit_actor_idx
  on public.kael_permission_audit (actor_id, created_at desc);

create index if not exists kael_advisory_audit_job_idx
  on public.kael_advisory_audit (job_id);
create index if not exists kael_advisory_audit_purpose_idx
  on public.kael_advisory_audit (purpose, created_at desc);
create index if not exists kael_advisory_audit_actor_idx
  on public.kael_advisory_audit (actor_id, created_at desc);

create index if not exists kael_memory_audit_subject_idx
  on public.kael_memory_audit (subject_type, subject_id, created_at desc);
create index if not exists kael_memory_audit_purpose_idx
  on public.kael_memory_audit (purpose, created_at desc);
create index if not exists kael_memory_audit_actor_idx
  on public.kael_memory_audit (actor_id, created_at desc);

drop policy if exists "Admins view kael permission audit" on public.kael_permission_audit;
create policy "Admins view kael permission audit"
  on public.kael_permission_audit for select
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins view kael advisory audit" on public.kael_advisory_audit;
create policy "Admins view kael advisory audit"
  on public.kael_advisory_audit for select
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins view kael memory audit" on public.kael_memory_audit;
create policy "Admins view kael memory audit"
  on public.kael_memory_audit for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_permission_audit from public;
revoke all on public.kael_permission_audit from anon;
revoke all on public.kael_permission_audit from authenticated;
grant select on public.kael_permission_audit to authenticated;
grant all on public.kael_permission_audit to service_role;

revoke all on public.kael_advisory_audit from public;
revoke all on public.kael_advisory_audit from anon;
revoke all on public.kael_advisory_audit from authenticated;
grant select on public.kael_advisory_audit to authenticated;
grant all on public.kael_advisory_audit to service_role;

revoke all on public.kael_memory_audit from public;
revoke all on public.kael_memory_audit from anon;
revoke all on public.kael_memory_audit from authenticated;
grant select on public.kael_memory_audit to authenticated;
grant all on public.kael_memory_audit to service_role;

comment on table public.kael_permission_audit is
  'Kael Harness P1 permission-decision audit shell. Service role writes; admin reads.';
comment on table public.kael_advisory_audit is
  'Kael Harness P1 advisory audit shell. Service role writes; admin reads.';
comment on table public.kael_memory_audit is
  'Kael Harness P1 memory access/change audit shell. Service role writes; admin reads.';
