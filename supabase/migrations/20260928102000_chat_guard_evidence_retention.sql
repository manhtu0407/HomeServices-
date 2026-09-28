begin;

-- The job chat stores only a redacted placeholder when the contact guard fires, so an admin
-- reviewing an off-app case had nothing to look at. The original text is kept here, readable
-- by the service role only. After 180 days the text is scrubbed in place (the row stays as a
-- record that a redaction happened); before then it cannot be edited or removed.
create table if not exists public.chat_guard_redaction_evidence (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'worker')),
  original_body text check (original_body is null or pg_catalog.char_length(original_body) between 1 and 4000),
  matched_rules text[] not null check (pg_catalog.cardinality(matched_rules) > 0),
  created_at timestamptz not null default now(),
  scrubbed_at timestamptz,
  unique (message_id),
  check ((original_body is null) = (scrubbed_at is not null))
);

create index if not exists chat_guard_redaction_evidence_sender_idx
  on public.chat_guard_redaction_evidence (sender_id, created_at desc);
create index if not exists chat_guard_redaction_evidence_created_idx
  on public.chat_guard_redaction_evidence (created_at);

alter table public.chat_guard_redaction_evidence enable row level security;
revoke all on table public.chat_guard_redaction_evidence from public, anon, authenticated;
grant select, insert, update, delete on table public.chat_guard_redaction_evidence to service_role;

-- The only update allowed is the retention scrub of a row past 180 days. A delete goes through
-- once a row is past retention, or when its job, message or sender is already gone (the FK
-- cascade, e.g. synthetic cohort cleanup); a direct delete of fresh evidence still fails.
create or replace function private.protect_chat_guard_redaction_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' and (
    old.created_at < pg_catalog.now() - interval '180 days'
    or not exists (select 1 from public.jobs j where j.id = old.job_id)
    or not exists (select 1 from public.chat_messages m where m.id = old.message_id)
    or not exists (select 1 from public.profiles p where p.id = old.sender_id)
  ) then
    return old;
  end if;
  if tg_op = 'UPDATE' and old.created_at < pg_catalog.now() - interval '180 days'
     and old.scrubbed_at is null and new.original_body is null and new.scrubbed_at is not null
     and new.id = old.id and new.job_id = old.job_id and new.message_id = old.message_id
     and new.sender_id = old.sender_id and new.sender_role = old.sender_role
     and new.matched_rules = old.matched_rules and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'CHAT_GUARD_EVIDENCE_IMMUTABLE' using errcode = 'P0001';
end;
$function$;

revoke all on function private.protect_chat_guard_redaction_evidence() from public, anon, authenticated;

create trigger chat_guard_redaction_evidence_immutable
before update or delete on public.chat_guard_redaction_evidence
for each row execute function private.protect_chat_guard_redaction_evidence();

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'chat-guard-evidence-retention') then
    perform cron.unschedule('chat-guard-evidence-retention');
  end if;
end $$;

select cron.schedule(
  'chat-guard-evidence-retention',
  '41 3 * * *',
  $$update public.chat_guard_redaction_evidence set original_body = null, scrubbed_at = now() where created_at < now() - interval '180 days' and scrubbed_at is null$$
);

commit;
