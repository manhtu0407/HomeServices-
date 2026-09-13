begin;

-- Replay receipts describe the accepted request, never the latest retry payload.
create or replace function public.request_paid_cancellation_review_atomic(
  p_job_id uuid, p_customer_id uuid, p_reason_code text, p_reason_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_request public.customer_cancellation_records%rowtype;
  v_dispute_id uuid;
  v_dispute record;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.customer_id is distinct from p_customer_id
    or not exists (select 1 from public.profiles where id = p_customer_id and role = 'customer') then
    raise exception 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_job.status not in ('paid', 'reviewed') or v_job.paid_at is null then
    raise exception 'PAID_REVIEW_STATUS_CHANGED' using errcode = 'P0001';
  end if;
  select * into v_request from public.customer_cancellation_records
    where job_id = p_job_id and customer_id = p_customer_id
      and safe_metadata->>'paid_cancellation_review' = 'true'
    order by created_at limit 1;
  if not found then
    if not exists (select 1 from public.customer_cancellation_reason_taxonomy where code = p_reason_code and is_active)
      or length(coalesce(p_reason_note, '')) > 2000 then
      raise exception 'INVALID_REASON' using errcode = 'P0001';
    end if;
    select id into v_dispute_id from public.disputes where job_id = p_job_id
      and status in ('open', 'awaiting_counter_party', 'admin_review') order by created_at limit 1;
    if v_dispute_id is null then
      select * into v_dispute from public.open_dispute_atomic(p_job_id, p_customer_id, 'customer', 'other',
        coalesce(nullif(btrim(p_reason_note), ''), 'Khách đề nghị xem xét hủy giao dịch đã thanh toán.'),
        array[]::text[], 'Khách đề nghị xem xét hủy sau thanh toán. Chưa phê duyệt hủy hoặc hoàn tiền.');
      if not v_dispute.ok then raise exception 'REFUND_REVIEW_UNAVAILABLE' using errcode = 'P0001'; end if;
      v_dispute_id := v_dispute.dispute_id;
    end if;
    insert into public.customer_cancellation_records(job_id, customer_id, worker_id, sub_case,
      reason_code, reason_category, reason_note, status, admin_review_required, phase0_no_monetary_penalty, safe_metadata)
    values (p_job_id, p_customer_id, v_job.worker_id, 'after_worker_completed_trigger_dispute',
      p_reason_code, 'needs_admin_review', nullif(btrim(p_reason_note), ''), 'dispute_pending', true, false,
      jsonb_build_object('paid_cancellation_review', true, 'dispute_id', v_dispute_id)) returning * into v_request;
    insert into public.job_events(job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata)
    values (p_job_id, p_customer_id, 'customer', 'paid_cancellation_review_requested', v_job.status, v_job.status,
      jsonb_build_object('cancellation_id', v_request.id, 'dispute_id', v_dispute_id, 'refund_state', 'review_required'));
  end if;
  return jsonb_build_object('cancellation_id', v_request.id, 'dispute_id', v_request.safe_metadata->>'dispute_id',
    'job_id', p_job_id, 'job_status', v_job.status, 'created_at', v_request.created_at,
    'reason_code', v_request.reason_code);
end;
$func$;

revoke all on function public.request_paid_cancellation_review_atomic(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.request_paid_cancellation_review_atomic(uuid,uuid,text,text) to service_role;

commit;
