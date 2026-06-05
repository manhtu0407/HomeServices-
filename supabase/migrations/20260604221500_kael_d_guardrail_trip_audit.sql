-- Track D (Plan.md §31.7): guardrail trip observability for self-check,
-- semantic guard, boundary guard, and autonomy gate trips.

begin;

create table if not exists public.kael_guardrail_trip_audit (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('customer', 'worker', 'admin', 'system')),
  surface text not null check (char_length(surface) between 2 and 120),
  reason_code text not null check (char_length(reason_code) between 2 and 160),
  guardrail_label text check (guardrail_label is null or char_length(guardrail_label) between 2 and 160),
  source text not null check (source in ('self_check', 'semantic_self_check', 'boundary_guard', 'autonomy_gate')),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists kael_guardrail_trip_audit_job_idx
  on public.kael_guardrail_trip_audit (job_id, created_at desc);
create index if not exists kael_guardrail_trip_audit_reason_idx
  on public.kael_guardrail_trip_audit (reason_code, created_at desc);
create index if not exists kael_guardrail_trip_audit_source_idx
  on public.kael_guardrail_trip_audit (source, created_at desc);

alter table public.kael_guardrail_trip_audit enable row level security;

drop policy if exists "Admins view kael guardrail trip audit"
  on public.kael_guardrail_trip_audit;
create policy "Admins view kael guardrail trip audit"
  on public.kael_guardrail_trip_audit
  for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_guardrail_trip_audit from public;
revoke all on public.kael_guardrail_trip_audit from anon;
revoke all on public.kael_guardrail_trip_audit from authenticated;
grant select on public.kael_guardrail_trip_audit to authenticated;
grant all on public.kael_guardrail_trip_audit to service_role;

comment on table public.kael_guardrail_trip_audit is
  'Append-only Kael Track D guardrail trip audit. Service role writes; admins read.';

commit;
