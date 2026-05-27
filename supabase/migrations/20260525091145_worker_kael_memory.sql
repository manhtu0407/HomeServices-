-- P1 Kael Harness foundation: worker memory schema only.

create table if not exists public.worker_kael_memory (
  worker_id uuid primary key references public.profiles(id) on delete cascade,
  language text not null default 'vi' check (language in ('vi', 'en')),
  service_skill_summary text not null default '',
  service_skill_proficiency jsonb not null default '{}'::jsonb,
  reliability_signals jsonb not null default '{}'::jsonb,
  red_flags jsonb not null default '{}'::jsonb,
  safe_metadata jsonb not null default '{}'::jsonb,
  memory_version integer not null default 1 check (memory_version > 0),
  archived_at timestamptz,
  last_observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.worker_kael_memory enable row level security;

drop trigger if exists worker_kael_memory_updated_at on public.worker_kael_memory;
create trigger worker_kael_memory_updated_at
  before update on public.worker_kael_memory
  for each row execute function public.update_updated_at();

create index if not exists worker_kael_memory_archived_at_idx
  on public.worker_kael_memory (archived_at)
  where archived_at is not null;

create index if not exists worker_kael_memory_last_observed_idx
  on public.worker_kael_memory (last_observed_at desc);

drop policy if exists "Workers view own kael memory" on public.worker_kael_memory;
create policy "Workers view own kael memory"
  on public.worker_kael_memory for select
  to authenticated
  using ((select auth.uid()) = worker_id);

drop policy if exists "Admins view worker kael memory" on public.worker_kael_memory;
create policy "Admins view worker kael memory"
  on public.worker_kael_memory for select
  to authenticated
  using (private.is_admin());

revoke all on public.worker_kael_memory from public;
revoke all on public.worker_kael_memory from anon;
revoke all on public.worker_kael_memory from authenticated;
grant select on public.worker_kael_memory to authenticated;
grant all on public.worker_kael_memory to service_role;

comment on table public.worker_kael_memory is
  'Kael Harness P1 worker memory shell. Edge/service-role owns writes; workers may read their own memory through RLS.';
