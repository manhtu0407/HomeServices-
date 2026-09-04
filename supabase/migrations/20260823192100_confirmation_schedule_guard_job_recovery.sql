-- A recovered or fixture-bound confirmation may already carry its durable job. The schedule guard
-- applies only to first acceptance, where neither the new operation nor its session owns a job yet.

create or replace function private.guard_kael_confirmation_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_session public.kael_chat_sessions%rowtype;
begin
  select session.* into strict v_session
  from public.kael_chat_sessions as session
  where session.id = new.session_id;
  if new.job_id is null and v_session.job_id is null and (
    v_session.scheduled_at is null or
    v_session.scheduled_at <= pg_catalog.statement_timestamp()
  ) then
    raise exception using errcode = '22023', message = 'KAEL_SCHEDULE_INVALID';
  end if;
  return new;
end;
$func$;

revoke execute on function private.guard_kael_confirmation_schedule()
from public, anon, authenticated, service_role;

comment on function private.guard_kael_confirmation_schedule() is
  'Rejects an elapsed first confirmation while preserving idempotent operations already bound to a job.';
