-- P11 follow-up: qualify no-show RETURNING columns so PL/pgSQL output
-- parameters cannot shadow queue columns at runtime.

begin;

create or replace function public.enqueue_worker_no_show_reviews(
  p_now timestamptz default now()
) returns table (
  job_id_out uuid,
  worker_id_out uuid,
  reason_code text,
  fallback_options jsonb
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_fallback_options jsonb := jsonb_build_array(
    jsonb_build_object(
      'id', 'wait_15_minutes',
      'label_vi', 'Đợi 15 phút để Kael tìm tiếp',
      'effect', 'continue_rebroadcast_search'
    ),
    jsonb_build_object(
      'id', 'reschedule',
      'label_vi', 'Đổi sang khung giờ khác',
      'effect', 'reschedule_job'
    ),
    jsonb_build_object(
      'id', 'cancel_no_charge',
      'label_vi', 'Hủy việc, chưa tính phí trong Phase 0',
      'effect', 'cancel_without_charge',
      'no_charge_phase0', true
    )
  );
begin
  return query
  with candidates as (
    select j.id, j.worker_id
    from public.jobs j
    where j.worker_id is not null
      and j.status = 'worker_matched'::public.job_status
      and (
        (j.matched_at is not null and j.matched_at <= p_now - interval '15 minutes')
        or (j.scheduled_at is not null and j.scheduled_at <= p_now)
      )
      and not exists (
        select 1
        from public.kael_admin_queue q
        where q.job_id = j.id
          and q.actor_id = j.worker_id
          and q.queue_type = 'worker_no_show'
          and q.status = 'open'
      )
  ),
  inserted as (
    insert into public.kael_admin_queue as q (
      job_id,
      actor_id,
      actor_role,
      queue_type,
      priority,
      status,
      escalation_level,
      reason_code,
      response_summary,
      safe_metadata
    )
    select
      c.id,
      c.worker_id,
      'worker',
      'worker_no_show',
      'medium',
      'open',
      'soft',
      'no_reason',
      'admin_review_worker_no_show',
      jsonb_build_object(
        'case', 'worker_cancel',
        'sub_case', 'no_show',
        'fallback_options', v_fallback_options,
        'admin_review_required', true,
        'autonomous_suspension', false
      )
    from candidates c
    returning
      q.job_id,
      q.actor_id,
      q.reason_code as inserted_reason_code,
      q.safe_metadata
  )
  select
    inserted.job_id,
    inserted.actor_id,
    inserted.inserted_reason_code,
    inserted.safe_metadata->'fallback_options'
  from inserted;
end;
$func$;

revoke execute on function public.enqueue_worker_no_show_reviews(timestamptz) from public;
revoke execute on function public.enqueue_worker_no_show_reviews(timestamptz) from anon;
revoke execute on function public.enqueue_worker_no_show_reviews(timestamptz) from authenticated;
grant execute on function public.enqueue_worker_no_show_reviews(timestamptz) to service_role;

comment on function public.enqueue_worker_no_show_reviews(timestamptz) is
  'P11 no-show timer hook: queues admin review and fallback options for stale worker_matched jobs without autonomous suspension or customer-charge effects. Return columns are qualified to avoid PL/pgSQL output-parameter shadowing.';

commit;
