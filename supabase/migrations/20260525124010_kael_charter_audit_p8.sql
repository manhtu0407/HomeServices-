create table if not exists public.kael_charter_audit (
  id uuid primary key default gen_random_uuid(),
  charter_version text not null check (char_length(charter_version) between 3 and 80),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text check (actor_role in ('customer', 'worker', 'admin', 'system')),
  operation text not null check (operation in ('read', 'propose_change', 'approve_change', 'reject_change', 'publish')),
  file_name text not null check (char_length(file_name) between 3 and 120),
  status text not null check (status in ('LOCKED', 'TUNABLE', 'PUBLIC_SAFE')),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists kael_charter_audit_created_at_idx
  on public.kael_charter_audit (created_at desc);

create index if not exists kael_charter_audit_version_idx
  on public.kael_charter_audit (charter_version, file_name);

alter table public.kael_charter_audit enable row level security;

drop policy if exists "Admins view kael charter audit" on public.kael_charter_audit;
create policy "Admins view kael charter audit"
  on public.kael_charter_audit
  for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_charter_audit from public;
revoke all on public.kael_charter_audit from anon;
revoke all on public.kael_charter_audit from authenticated;
grant select on public.kael_charter_audit to authenticated;
grant all on public.kael_charter_audit to service_role;
