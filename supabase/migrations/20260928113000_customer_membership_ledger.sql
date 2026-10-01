begin;

-- Customer membership points come only from orders paid in the app, one row per order and
-- one reversal if that order is refunded. They replace the old score that was computed on
-- every read, counted unpaid jobs, double-counted fair-price jobs and grew with Kael chats.
create table public.customer_membership_point_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete restrict,
  source_ledger_id uuid not null references public.worker_payment_ledger(id) on delete restrict,
  entry_kind text not null check (entry_kind in ('accrual', 'reversal')),
  points integer not null,
  program_version_id uuid not null references public.ambassador_program_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (job_id, entry_kind),
  check ((entry_kind = 'accrual' and points > 0) or (entry_kind = 'reversal' and points < 0))
);

create index customer_membership_point_entries_customer_idx
  on public.customer_membership_point_entries (customer_id, created_at desc);

alter table public.customer_membership_point_entries enable row level security;
revoke all on table public.customer_membership_point_entries from public, anon, authenticated;
grant select, insert on table public.customer_membership_point_entries to service_role;

create trigger customer_membership_point_entries_append_only
before update or delete on public.customer_membership_point_entries
for each row execute function private.reject_append_only_mutation();
create trigger customer_membership_point_entries_synthetic_guard
before insert on public.customer_membership_point_entries
for each row execute function private.guard_real_traffic_finance();

create or replace function public.get_customer_membership_summary(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_program public.ambassador_program_versions%rowtype;
  v_link public.customer_worker_links%rowtype;
begin
  v_program := private.current_ambassador_program();
  select * into v_link from public.customer_worker_links
  where customer_id = p_customer_id and ended_at is null and expires_at > pg_catalog.now();

  return pg_catalog.jsonb_build_object(
    'points', coalesce((select sum(points) from public.customer_membership_point_entries
      where customer_id = p_customer_id), 0),
    'customer_vnd_per_point', v_program.customer_vnd_per_point,
    'linked_worker', case when v_link.id is null then null else pg_catalog.jsonb_build_object(
      'worker_id', v_link.worker_id,
      'display_name', (select profile.full_name from public.profiles as profile where profile.id = v_link.worker_id),
      'source', v_link.source,
      'expires_at', v_link.expires_at
    ) end,
    'recent_entries', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'job_id', entry.job_id,
        'entry_kind', entry.entry_kind,
        'points', entry.points,
        'created_at', entry.created_at
      ) order by entry.created_at desc)
      from (
        select * from public.customer_membership_point_entries
        where customer_id = p_customer_id
        order by created_at desc
        limit 20
      ) as entry
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_customer_membership_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_customer_membership_summary(uuid) to service_role;

commit;
