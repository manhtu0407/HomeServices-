-- @pillar id: P284-chat-guard-evidence-scrub-sql
-- @pillar invariant: Redaction evidence cannot be edited or deleted while it is fresh; the scheduled retention job scrubs the original text of rows past 180 days in place and leaves the rest of the row as a record; any other edit, even of an old row, is refused; and deleting the job the evidence belongs to still cascades
-- @pillar authority: governance/RULES.md #8 | Plan moonlit-singing-phoenix R1: the release gate forbids DELETE in stored SQL, so retention scrubs instead of pruning
-- @pillar target: supabase/migrations/20260928102000_chat_guard_evidence_retention.sql
-- @pillar layer: sql
-- @pillar siblings: P257-chat-guard-evidence-retained
-- @pillar mutation: Drop the 180-day age check from the UPDATE branch of private.protect_chat_guard_redaction_evidence; the fresh-row scrub succeeds and P284 raises P284_FRESH_SCRUB_ALLOWED

begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('c2840000-0000-4000-8000-000000000001','authenticated','authenticated','evidence-p284-worker@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2840000-0000-4000-8000-000000000002','authenticated','authenticated','evidence-p284-customer@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='worker' where id='c2840000-0000-4000-8000-000000000001';

insert into public.jobs (id, customer_id, worker_id, service_type, description, status, quote_mode)
values
  ('c2840000-0000-4000-8000-000000000101', 'c2840000-0000-4000-8000-000000000002',
    'c2840000-0000-4000-8000-000000000001', 'plumbing', 'Evidence retention fixture', 'worker_on_way', 'rfq'),
  ('c2840000-0000-4000-8000-000000000102', 'c2840000-0000-4000-8000-000000000002',
    'c2840000-0000-4000-8000-000000000001', 'plumbing', 'Evidence cascade fixture', 'worker_on_way', 'rfq');

insert into public.chat_messages (id, job_id, sender_id, sender_role, content) values
  ('c2840000-0000-4000-8000-000000000201', 'c2840000-0000-4000-8000-000000000101', 'c2840000-0000-4000-8000-000000000001', 'worker', 'redacted'),
  ('c2840000-0000-4000-8000-000000000202', 'c2840000-0000-4000-8000-000000000101', 'c2840000-0000-4000-8000-000000000001', 'worker', 'redacted'),
  ('c2840000-0000-4000-8000-000000000203', 'c2840000-0000-4000-8000-000000000102', 'c2840000-0000-4000-8000-000000000001', 'worker', 'redacted');

-- 301 = fresh, 302 = past retention, 303 = fresh on the job that gets deleted.
insert into public.chat_guard_redaction_evidence (id, job_id, message_id, sender_id, sender_role, original_body, matched_rules, created_at) values
  ('c2840000-0000-4000-8000-000000000301', 'c2840000-0000-4000-8000-000000000101', 'c2840000-0000-4000-8000-000000000201',
    'c2840000-0000-4000-8000-000000000001', 'worker', 'Goi em 0901 qua zalo', array['zalo'], now()),
  ('c2840000-0000-4000-8000-000000000302', 'c2840000-0000-4000-8000-000000000101', 'c2840000-0000-4000-8000-000000000202',
    'c2840000-0000-4000-8000-000000000001', 'worker', 'Khoi qua app nhe', array['off_app'], now() - interval '200 days'),
  ('c2840000-0000-4000-8000-000000000303', 'c2840000-0000-4000-8000-000000000102', 'c2840000-0000-4000-8000-000000000203',
    'c2840000-0000-4000-8000-000000000001', 'worker', 'So em 0902', array['phone'], now());

do $retention$
declare
  v_fresh constant uuid := 'c2840000-0000-4000-8000-000000000301';
  v_old constant uuid := 'c2840000-0000-4000-8000-000000000302';
  v_command text;
begin
  begin
    update public.chat_guard_redaction_evidence set original_body = null, scrubbed_at = now() where id = v_fresh;
    raise exception 'P284_FRESH_SCRUB_ALLOWED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'CHAT_GUARD_EVIDENCE_IMMUTABLE' then raise; end if;
  end;

  begin
    delete from public.chat_guard_redaction_evidence where id = v_fresh;
    raise exception 'P284_FRESH_DELETE_ALLOWED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'CHAT_GUARD_EVIDENCE_IMMUTABLE' then raise; end if;
  end;

  -- A scrub that also rewrites the matched rules is an edit, not retention.
  begin
    update public.chat_guard_redaction_evidence
    set original_body = null, scrubbed_at = now(), matched_rules = array['phone'] where id = v_old;
    raise exception 'P284_OLD_ROW_EDITED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'CHAT_GUARD_EVIDENCE_IMMUTABLE' then raise; end if;
  end;

  select command into strict v_command from cron.job where jobname = 'chat-guard-evidence-retention';
  execute v_command;

  if exists (select 1 from public.chat_guard_redaction_evidence where id = v_old and (original_body is not null or scrubbed_at is null)) then
    raise exception 'P284_OLD_ROW_NOT_SCRUBBED';
  end if;
  if not exists (select 1 from public.chat_guard_redaction_evidence where id = v_old and matched_rules = array['off_app']) then
    raise exception 'P284_SCRUB_LOST_RECORD';
  end if;
  if not exists (select 1 from public.chat_guard_redaction_evidence
                 where id = v_fresh and original_body = 'Goi em 0901 qua zalo' and scrubbed_at is null) then
    raise exception 'P284_FRESH_ROW_TOUCHED';
  end if;

  delete from public.jobs where id = 'c2840000-0000-4000-8000-000000000102';
  if exists (select 1 from public.chat_guard_redaction_evidence where id = 'c2840000-0000-4000-8000-000000000303') then
    raise exception 'P284_CASCADE_LEFT_EVIDENCE';
  end if;
end;
$retention$;

rollback;
