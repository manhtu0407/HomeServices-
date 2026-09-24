begin;

-- kael-matching-maintainer only activates job broadcasts on its once-a-minute pg_cron tick
-- (20260811153000_finding_workers_matching_preferences.sql), and nothing in the confirm path
-- triggers activation synchronously, so a confirmation landing right after a tick can wait close
-- to 60s for the next one. This RPC's bound was never widened alongside the smoke harness's own
-- budget, so a receipt the harness itself judged valid was still rejected here.
create or replace function public.record_stage1_synthetic_smoke(p_release_id text, p_environment text, p_cohort_id text, p_run_id text, p_sequence smallint, p_auto_quote_passed boolean, p_rfq_or_inspection_passed boolean, p_recovery_passed boolean, p_release_identity_match boolean, p_terminal_reconcile_passed boolean, p_synthetic_leak_count integer, p_duplicate_job_count integer, p_duplicate_broadcast_count integer, p_safe_error_code_ratio numeric, p_confirm_acceptance_ms integer, p_worker_offer_visible_ms integer, p_support_trace_count integer, p_receipt_generated_at text, p_receipt_sha256 text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_control public.stage1_release_controls%rowtype;
  v_existing public.stage1_synthetic_smoke_receipts%rowtype;
  v_id uuid;
  v_expected_sha256 text;
begin
  select * into v_control from public.stage1_release_controls control
  where control.environment = p_environment for update;
  if not found
    or v_control.candidate_release_id <> p_release_id
    or v_control.candidate_cohort_id <> p_cohort_id
  then
    raise exception using errcode = '55000', message = 'STAGE1_CANARY_NOT_ACTIVE';
  end if;
  if p_auto_quote_passed is distinct from true
    or p_rfq_or_inspection_passed is distinct from true
    or p_recovery_passed is distinct from true
    or p_release_identity_match is distinct from true
    or p_terminal_reconcile_passed is distinct from true
    or p_synthetic_leak_count is distinct from 0
    or p_duplicate_job_count is distinct from 0
    or p_duplicate_broadcast_count is distinct from 0
    or p_safe_error_code_ratio is distinct from 1::numeric
    or p_confirm_acceptance_ms is null or p_confirm_acceptance_ms not between 0 and 3000
    or p_worker_offer_visible_ms is null or p_worker_offer_visible_ms not between 0 and 80000
    or p_support_trace_count is null or p_support_trace_count <= 0
    or p_sequence is null or p_sequence not between 1 and 3
    or p_receipt_generated_at is null
    or p_receipt_generated_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or p_receipt_sha256 is null or p_receipt_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '23514', message = 'STAGE1_SYNTHETIC_SMOKE_FAILED';
  end if;

  v_expected_sha256 := encode(extensions.digest(convert_to(concat_ws(E'\n',
    '1.0.0', p_release_id, p_environment, p_cohort_id, p_run_id,
    p_sequence::text, p_auto_quote_passed::text,
    p_rfq_or_inspection_passed::text, p_recovery_passed::text,
    p_release_identity_match::text, p_terminal_reconcile_passed::text,
    p_synthetic_leak_count::text, p_duplicate_job_count::text,
    p_duplicate_broadcast_count::text, p_safe_error_code_ratio::text,
    p_confirm_acceptance_ms::text, p_worker_offer_visible_ms::text,
    p_support_trace_count::text, p_receipt_generated_at
  ), 'UTF8'), 'sha256'), 'hex');
  if v_expected_sha256 <> p_receipt_sha256 then
    raise exception using errcode = '23514', message = 'STAGE1_SYNTHETIC_SMOKE_CHECKSUM_INVALID';
  end if;

  insert into public.stage1_synthetic_smoke_receipts(
    release_id, environment, cohort_id, run_id, sequence,
    auto_quote_passed, rfq_or_inspection_passed, recovery_passed,
    release_identity_match, terminal_reconcile_passed,
    synthetic_leak_count, duplicate_job_count, duplicate_broadcast_count,
    safe_error_code_ratio, confirm_acceptance_ms, worker_offer_visible_ms,
    support_trace_count, receipt_generated_at, receipt_sha256
  ) values (
    p_release_id, p_environment, p_cohort_id, p_run_id, p_sequence,
    p_auto_quote_passed, p_rfq_or_inspection_passed, p_recovery_passed,
    p_release_identity_match, p_terminal_reconcile_passed,
    p_synthetic_leak_count, p_duplicate_job_count, p_duplicate_broadcast_count,
    p_safe_error_code_ratio, p_confirm_acceptance_ms, p_worker_offer_visible_ms,
    p_support_trace_count, p_receipt_generated_at::timestamptz, p_receipt_sha256
  ) on conflict (release_id, environment, cohort_id, sequence) do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing
    from public.stage1_synthetic_smoke_receipts receipt
    where receipt.release_id = p_release_id
      and receipt.environment = p_environment
      and receipt.cohort_id = p_cohort_id
      and receipt.sequence = p_sequence;
    if v_existing.receipt_sha256 <> p_receipt_sha256
      or v_existing.run_id <> p_run_id
    then
      raise exception using errcode = '23505', message = 'STAGE1_SMOKE_SEQUENCE_COLLISION';
    end if;
    v_id := v_existing.id;
  end if;
  return v_id;
end;
$function$;

commit;
