begin;

create or replace function private.project_official_match_operations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status <> 'worker_matched'::public.job_status
    or new.worker_id is null
  then
    return new;
  end if;

  update public.matching_operations as operation
  set state = 'official_match',
    updated_at = now()
  where operation.job_id = new.id
    and operation.state in (
      'queued', 'broadcasting', 'candidate_ready', 'recovery_required'
    );

  update public.confirmation_operations as operation
  set state = 'official_match',
    last_error_code = null,
    retry_after_ms = null,
    updated_at = now()
  where operation.job_id = new.id
    and operation.state in (
      'matching_queued', 'broadcasting', 'candidate_ready', 'recovery_required'
    );

  update public.workflow_outbox as outbox
  set status = 'completed',
    lease_expires_at = null,
    last_error_code = null,
    updated_at = now()
  where outbox.operation_id in (
      select operation.id
      from public.confirmation_operations as operation
      where operation.job_id = new.id
    )
    and outbox.event_type = 'matching_requested'
    and outbox.status <> 'completed';

  return new;
end;
$function$;

revoke all on function private.project_official_match_operations()
from public, anon, authenticated;
grant execute on function private.project_official_match_operations()
to service_role;

drop trigger if exists jobs_project_official_match_operations on public.jobs;
create trigger jobs_project_official_match_operations
after update of status on public.jobs
for each row
when (
  new.status = 'worker_matched'::public.job_status
  and old.status is distinct from new.status
)
execute function private.project_official_match_operations();

comment on function private.project_official_match_operations() is
  'Atomically projects every official job match into its durable matching and confirmation receipts, independent of the Edge request lifetime.';

commit;
