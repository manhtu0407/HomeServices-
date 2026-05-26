-- P6 Kael memory governance: archive table + stale archive function.

create table if not exists public.kael_memory_archive (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('customer', 'worker', 'job', 'domain', 'system')),
  subject_id uuid,
  archived_from text not null check (archived_from in ('customer_kael_memory', 'worker_kael_memory', 'job_memory', 'domain_memory')),
  memory_payload jsonb not null check (jsonb_typeof(memory_payload) = 'object'),
  archived_reason text not null check (char_length(archived_reason) between 3 and 120),
  created_at timestamptz not null default now()
);

alter table public.kael_memory_archive enable row level security;

create index if not exists kael_memory_archive_subject_idx
  on public.kael_memory_archive(subject_type, subject_id, created_at desc);

drop policy if exists "Admins view kael memory archive" on public.kael_memory_archive;
create policy "Admins view kael memory archive"
  on public.kael_memory_archive
  for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_memory_archive from public;
revoke all on public.kael_memory_archive from anon;
revoke all on public.kael_memory_archive from authenticated;
grant select on public.kael_memory_archive to authenticated;
grant all on public.kael_memory_archive to service_role;

create or replace function public.archive_stale_kael_memory(
  p_archive_before timestamptz default now() - interval '365 days'
)
returns table(subject_type text, subject_id uuid, archived_from text)
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with archived as (
    insert into public.kael_memory_archive (
      subject_type,
      subject_id,
      archived_from,
      memory_payload,
      archived_reason
    )
    select
      'customer',
      customer_id,
      'customer_kael_memory',
      to_jsonb(c),
      'stale_gt_365_days'
    from public.customer_kael_memory c
    where c.last_observed_at is not null
      and c.last_observed_at < p_archive_before
    returning kael_memory_archive.subject_type, kael_memory_archive.subject_id, kael_memory_archive.archived_from
  ),
  deleted as (
    delete from public.customer_kael_memory c
    where c.last_observed_at is not null
      and c.last_observed_at < p_archive_before
    returning c.customer_id
  )
  select archived.subject_type, archived.subject_id, archived.archived_from
  from archived;

  return query
  with archived as (
    insert into public.kael_memory_archive (
      subject_type,
      subject_id,
      archived_from,
      memory_payload,
      archived_reason
    )
    select
      'worker',
      worker_id,
      'worker_kael_memory',
      to_jsonb(w),
      'stale_gt_365_days'
    from public.worker_kael_memory w
    where w.last_observed_at is not null
      and w.last_observed_at < p_archive_before
    returning kael_memory_archive.subject_type, kael_memory_archive.subject_id, kael_memory_archive.archived_from
  ),
  deleted as (
    delete from public.worker_kael_memory w
    where w.last_observed_at is not null
      and w.last_observed_at < p_archive_before
    returning w.worker_id
  )
  select archived.subject_type, archived.subject_id, archived.archived_from
  from archived;
end;
$$;

grant execute on function public.archive_stale_kael_memory(timestamptz) to service_role;

comment on table public.kael_memory_archive is
  'Kael P6 append-only archive for stale memory payloads. Service role owns writes; admins read.';
comment on function public.archive_stale_kael_memory(timestamptz) is
  'Archives Kael customer/worker memory older than the cutoff for P6 stale-memory governance.';
