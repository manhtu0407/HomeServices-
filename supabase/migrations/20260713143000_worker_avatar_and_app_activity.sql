-- Private worker avatars and authoritative foreground app-activity lifetime.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'worker-avatars', 'worker-avatars', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.worker_profiles
  add column if not exists app_active_minutes bigint not null default 0,
  add column if not exists app_last_active_minute timestamptz;

update public.worker_profiles
set app_active_minutes = least(600000, greatest(0, app_active_minutes));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'worker_profiles_app_active_minutes_range'
      and conrelid = 'public.worker_profiles'::regclass
  ) then
    alter table public.worker_profiles
      add constraint worker_profiles_app_active_minutes_range
      check (app_active_minutes >= 0 and app_active_minutes <= 600000);
  end if;
end
$$;

comment on column public.worker_profiles.app_active_minutes is
  'Foreground minutes recorded by the authenticated mobile app, capped at 10,000 hours.';
comment on column public.worker_profiles.app_last_active_minute is
  'UTC minute bucket used to make foreground heartbeat writes idempotent.';

create or replace function public.record_worker_app_active_minute(p_worker_id uuid)
returns table (
  worker_id uuid,
  active_minutes bigint,
  last_active_at timestamptz,
  incremented boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_minute timestamptz := date_trunc('minute', timezone('utc', now())) at time zone 'UTC';
begin
  return query
  with current_row as (
    select wp.id, wp.app_active_minutes, wp.app_last_active_minute
    from public.worker_profiles as wp
    where wp.id = p_worker_id
    for update
  ), updated as (
    update public.worker_profiles as wp
    set app_active_minutes = case
          when current_row.app_last_active_minute is not distinct from v_minute
            then wp.app_active_minutes
          else least(600000, wp.app_active_minutes + 1)
        end,
        app_last_active_minute = v_minute
    from current_row
    where wp.id = current_row.id
    returning
      wp.id,
      wp.app_active_minutes,
      wp.app_last_active_minute,
      current_row.app_last_active_minute is distinct from v_minute
        and current_row.app_active_minutes < 600000 as did_increment
  )
  select updated.id, updated.app_active_minutes, updated.app_last_active_minute, updated.did_increment
  from updated;
end;
$$;

revoke execute on function public.record_worker_app_active_minute(uuid) from public, anon, authenticated;
grant execute on function public.record_worker_app_active_minute(uuid) to service_role;
