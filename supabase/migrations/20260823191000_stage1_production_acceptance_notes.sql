begin;

create table public.stage1_production_acceptance_notes (
  release_id text primary key references public.harness_releases(release_id) on delete restrict,
  environment text not null default 'production' check (environment = 'production'),
  cohort_id text not null check (
    cohort_id ~ '^synthetic-stage1-[0-9a-f]{12}-[0-9a-f]{12}-[A-Za-z0-9_-]{1,48}$'
  ),
  acceptance_status text not null default 'verified' check (acceptance_status = 'verified'),
  summary_vi text not null check (
    summary_vi = 'Stage 1 đã được xác minh trên Production: đúng release, ba quy trình đạt chuẩn, dữ liệu kiểm tra đã được dọn sạch và giao diện Khách hàng/Thợ không hiển thị thuật ngữ nội bộ.'
  ),
  production_ui_source_sha256 text not null check (production_ui_source_sha256 ~ '^[0-9a-f]{64}$'),
  production_ui_receipt_sha256 text not null check (production_ui_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  cleanup_receipt_sha256 text not null check (cleanup_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  hosted_state_sha256 text not null check (hosted_state_sha256 ~ '^[0-9a-f]{64}$'),
  promotion_packet_sha256 text not null check (promotion_packet_sha256 ~ '^[0-9a-f]{64}$'),
  note_sha256 text not null unique check (note_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.stage1_production_acceptance_notes enable row level security;
revoke all on public.stage1_production_acceptance_notes from public, anon, authenticated;
grant select on public.stage1_production_acceptance_notes to service_role;

create trigger stage1_production_acceptance_notes_append_only
before update or delete on public.stage1_production_acceptance_notes
for each row execute function public.reject_stage1_release_evidence_mutation();

create or replace function public.record_stage1_production_acceptance_note(
  p_release_id text,
  p_cohort_id text,
  p_ui_source_sha256 text,
  p_ui_scanned_file_count integer,
  p_ui_visible_literal_count integer,
  p_ui_generated_at text,
  p_ui_receipt_sha256 text,
  p_cleanup_run_id text,
  p_cleanup_member_count integer,
  p_cleanup_worker_member_count integer,
  p_cleanup_worker_marker_count integer,
  p_cleanup_generated_at text,
  p_cleanup_receipt_sha256 text,
  p_hosted_state_sha256 text,
  p_promotion_packet_sha256 text
) returns table(
  release_id text,
  environment text,
  cohort_id text,
  acceptance_status text,
  summary_vi text,
  production_ui_source_sha256 text,
  production_ui_receipt_sha256 text,
  cleanup_receipt_sha256 text,
  hosted_state_sha256 text,
  promotion_packet_sha256 text,
  note_sha256 text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_control public.stage1_release_controls%rowtype;
  v_existing public.stage1_production_acceptance_notes%rowtype;
  v_summary constant text := 'Stage 1 đã được xác minh trên Production: đúng release, ba quy trình đạt chuẩn, dữ liệu kiểm tra đã được dọn sạch và giao diện Khách hàng/Thợ không hiển thị thuật ngữ nội bộ.';
  v_ui_expected_sha256 text;
  v_cleanup_expected_sha256 text;
  v_note_sha256 text;
  v_member_count integer;
  v_worker_member_count integer;
  v_worker_marker_count integer;
  v_active_delivery_signal_count integer;
  v_scenario_record_count integer;
  v_mobile_deployment_id text;
  v_maintainer_deployment_id text;
begin
  if p_release_id !~ '^harness-[0-9a-f]{12}-[0-9a-f]{12}$'
    or p_cohort_id !~ '^synthetic-stage1-[0-9a-f]{12}-[0-9a-f]{12}-[A-Za-z0-9_-]{1,48}$'
    or p_ui_source_sha256 !~ '^[0-9a-f]{64}$'
    or p_ui_scanned_file_count is null or p_ui_scanned_file_count < 1
    or p_ui_visible_literal_count is null or p_ui_visible_literal_count < 1
    or p_ui_generated_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or p_ui_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_cleanup_run_id !~ '^[A-Za-z0-9_.:-]{1,120}$'
    or p_cleanup_member_count is null or p_cleanup_member_count < 1
    or p_cleanup_worker_member_count is null or p_cleanup_worker_member_count < 1
    or p_cleanup_worker_marker_count is null or p_cleanup_worker_marker_count < 1
    or p_cleanup_generated_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or p_cleanup_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_hosted_state_sha256 !~ '^[0-9a-f]{64}$'
    or p_promotion_packet_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'STAGE1_PRODUCTION_ACCEPTANCE_INPUT_INVALID';
  end if;

  v_ui_expected_sha256 := encode(extensions.digest(convert_to(concat_ws(E'\n',
    'stage1-production-ui-normality.v1', 'passed', p_ui_source_sha256,
    p_ui_scanned_file_count::text, p_ui_visible_literal_count::text, '0', p_ui_generated_at
  ), 'UTF8'), 'sha256'), 'hex');
  if v_ui_expected_sha256 <> p_ui_receipt_sha256 then
    raise exception using errcode = '23514', message = 'STAGE1_PRODUCTION_UI_RECEIPT_INVALID';
  end if;

  v_cleanup_expected_sha256 := encode(extensions.digest(convert_to(concat_ws(E'\n',
    'stage1-synthetic-cleanup.v1', 'cleaned', p_release_id, p_cohort_id,
    p_cleanup_run_id, p_cleanup_member_count::text, p_cleanup_worker_member_count::text,
    p_cleanup_worker_marker_count::text, '0', '0', p_cleanup_generated_at
  ), 'UTF8'), 'sha256'), 'hex');
  if v_cleanup_expected_sha256 <> p_cleanup_receipt_sha256 then
    raise exception using errcode = '23514', message = 'STAGE1_PRODUCTION_CLEANUP_RECEIPT_INVALID';
  end if;

  select * into v_control
  from public.stage1_release_controls control
  where control.environment = 'production'
  for update;
  if not found or v_control.active_release_id <> p_release_id
    or v_control.candidate_release_id is not null
  then
    raise exception using errcode = '55000', message = 'STAGE1_PRODUCTION_RELEASE_NOT_ACTIVE';
  end if;

  if not exists (
    select 1 from public.harness_releases release
    where release.release_id = p_release_id
      and release.environment = 'production'
      and release.release_artifact ->> 'productionUiSourceSha256' = p_ui_source_sha256
  ) then
    raise exception using errcode = '23514', message = 'STAGE1_PRODUCTION_UI_RELEASE_MISMATCH';
  end if;
  select event.safe_metadata ->> 'mobile_deployment_id',
    event.safe_metadata ->> 'maintainer_deployment_id'
  into v_mobile_deployment_id, v_maintainer_deployment_id
  from public.stage1_release_control_events event
    where event.environment = 'production'
      and event.release_id = p_release_id
      and event.event_type = 'promoted'
      and event.cohort_id = p_cohort_id
      and event.evidence_sha256 = p_promotion_packet_sha256
  order by event.id desc
  limit 1;
  if v_mobile_deployment_id is null or v_maintainer_deployment_id is null then
    raise exception using errcode = '23514', message = 'STAGE1_PRODUCTION_PROMOTION_NOT_PROVEN';
  end if;
  if (
    select count(*) from public.stage1_source_deployment_attestations attestation
    where attestation.environment = 'production'
      and attestation.release_id = p_release_id
      and (
        (attestation.function_name = 'mobile-api'
          and attestation.deployment_id = v_mobile_deployment_id)
        or (attestation.function_name = 'kael-matching-maintainer'
          and attestation.deployment_id = v_maintainer_deployment_id)
      )
  ) <> 2 then
    raise exception using errcode = '23514', message = 'STAGE1_PRODUCTION_SOURCE_ATTESTATIONS_INCOMPLETE';
  end if;
  if (
    select count(*) from (
      select receipt.id
      from public.stage1_synthetic_smoke_receipts receipt
      join public.stage1_smoke_deployment_attestations evidence
        on evidence.smoke_receipt_id = receipt.id
      where receipt.release_id = p_release_id
        and receipt.environment = 'production'
        and receipt.cohort_id = p_cohort_id
        and receipt.sequence in (1, 2, 3)
        and (
          (evidence.function_name = 'mobile-api'
            and evidence.deployment_id = v_mobile_deployment_id)
          or (evidence.function_name = 'kael-matching-maintainer'
            and evidence.deployment_id = v_maintainer_deployment_id)
        )
      group by receipt.id
      having count(*) = 2
    ) accepted_smoke
  ) <> 3 then
    raise exception using errcode = '23514', message = 'STAGE1_PRODUCTION_THREE_SMOKES_NOT_PROVEN';
  end if;

  select cleanup.member_count, cleanup.worker_member_count, cleanup.worker_marker_count,
    cleanup.active_delivery_signal_count, cleanup.scenario_record_count
  into v_member_count, v_worker_member_count, v_worker_marker_count,
    v_active_delivery_signal_count, v_scenario_record_count
  from public.verify_synthetic_matching_cohort_cleanup(p_cohort_id) cleanup;
  if v_member_count <> 2 or v_worker_member_count <> 1 or v_worker_marker_count <> 1
    or v_active_delivery_signal_count <> 0 or v_scenario_record_count <> 0
    or p_cleanup_member_count <> v_member_count
    or p_cleanup_worker_member_count <> v_worker_member_count
    or p_cleanup_worker_marker_count <> v_worker_marker_count
  then
    raise exception using errcode = '23514', message = 'STAGE1_PRODUCTION_COHORT_NOT_CLEAN';
  end if;

  v_note_sha256 := encode(extensions.digest(convert_to(concat_ws(E'\n',
    'stage1-production-acceptance-note.v1', p_release_id, 'production', p_cohort_id,
    'verified', v_summary, p_ui_source_sha256, p_ui_receipt_sha256,
    p_cleanup_receipt_sha256, p_hosted_state_sha256, p_promotion_packet_sha256
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.stage1_production_acceptance_notes(
    release_id, cohort_id, summary_vi, production_ui_source_sha256,
    production_ui_receipt_sha256, cleanup_receipt_sha256,
    hosted_state_sha256, promotion_packet_sha256, note_sha256
  ) values (
    p_release_id, p_cohort_id, v_summary, p_ui_source_sha256,
    p_ui_receipt_sha256, p_cleanup_receipt_sha256,
    p_hosted_state_sha256, p_promotion_packet_sha256, v_note_sha256
  ) on conflict (release_id) do nothing;

  select * into strict v_existing
  from public.stage1_production_acceptance_notes note
  where note.release_id = p_release_id;
  if v_existing.note_sha256 <> v_note_sha256 then
    raise exception using errcode = '23505', message = 'STAGE1_PRODUCTION_ACCEPTANCE_COLLISION';
  end if;
  return query select v_existing.release_id, v_existing.environment,
    v_existing.cohort_id, v_existing.acceptance_status, v_existing.summary_vi,
    v_existing.production_ui_source_sha256, v_existing.production_ui_receipt_sha256,
    v_existing.cleanup_receipt_sha256, v_existing.hosted_state_sha256,
    v_existing.promotion_packet_sha256, v_existing.note_sha256, v_existing.created_at;
end;
$function$;

revoke execute on function public.record_stage1_production_acceptance_note(
  text,text,text,integer,integer,text,text,text,integer,integer,integer,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.record_stage1_production_acceptance_note(
  text,text,text,integer,integer,text,text,text,integer,integer,integer,text,text,text,text
) to service_role;

comment on table public.stage1_production_acceptance_notes is
  'Append-only Supabase Production handoff proving the promoted release, normal Customer/Worker UI source, three attested smokes, and exact-cohort cleanup.';
comment on function public.record_stage1_production_acceptance_note(
  text,text,text,integer,integer,text,text,text,integer,integer,integer,text,text,text,text
) is 'Records the final Vietnamese Dev-review note only after every Production acceptance invariant is proven.';

create view public.stage1_current_production_acceptance
with (security_invoker = true)
as
select note.*
from public.stage1_production_acceptance_notes note
join public.stage1_release_controls control
  on control.environment = 'production'
  and control.active_release_id = note.release_id
  and control.candidate_release_id is null;

revoke all on public.stage1_current_production_acceptance from public, anon, authenticated;
grant select on public.stage1_current_production_acceptance to service_role;
comment on view public.stage1_current_production_acceptance is
  'Dev-review surface: exactly the acceptance note for the release currently active in Supabase Production; empty after rollback.';

commit;
