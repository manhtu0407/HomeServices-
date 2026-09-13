begin;

create or replace function private.retire_cancelled_job_matching()
returns trigger language plpgsql security definer set search_path = '' as $func$
declare v_now timestamptz := clock_timestamp();
begin
  if new.status is not distinct from old.status or new.status <> 'cancelled'::public.job_status then
    return new;
  end if;

  -- The job is already locked; invalidate dispatcher leases before changing their projections.
  update public.workflow_outbox as outbox
    set status='completed', lease_token=null, leased_by=null, lease_expires_at=null,
      last_error_code=null, updated_at=v_now
    where outbox.status in ('queued','processing','failed') and (
      outbox.operation_id in (select id from public.confirmation_operations where job_id=new.id)
      or outbox.replacement_matching_operation_id in (select id from public.matching_operations where job_id=new.id)
      or outbox.retry_matching_operation_id in (select id from public.matching_operations where job_id=new.id));
  update public.confirmation_operations set state='stopped', last_error_code=null,
    retry_after_ms=null, updated_at=v_now where job_id=new.id and state <> 'stopped';
  update public.matching_operations set state='stopped', updated_at=v_now
    where job_id=new.id and state <> 'stopped';
  update public.job_worker_candidates set status='customer_declined',
    customer_decided_at=v_now, updated_at=v_now where job_id=new.id and status='proposed';
  update public.job_broadcasts set status='cancelled', responded_at=coalesce(responded_at,v_now)
    where job_id=new.id and status in ('pending','sent','accepted','reassigned');
  update public.matching_recipient_deliveries set status='expired', updated_at=v_now
    where job_id=new.id and status in ('queued','delivered','seen');
  return new;
end;
$func$;
revoke all on function private.retire_cancelled_job_matching() from public, anon, authenticated;

do $trigger_guard$
begin
  if not exists (select 1 from pg_catalog.pg_trigger
    where tgrelid='public.jobs'::regclass and tgname='jobs_retire_cancelled_matching' and not tgisinternal) then
    create trigger jobs_retire_cancelled_matching after update of status on public.jobs
      for each row execute function private.retire_cancelled_job_matching();
  end if;
end;
$trigger_guard$;

commit;
