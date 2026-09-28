begin;

-- The job chat stores only a redacted placeholder when the contact guard fires, so an admin
-- reviewing an off-app case had nothing to look at. The original text is kept here, readable
-- by the service role only, for 180 days, and cannot be edited or removed before then.
create table if not exists public.chat_guard_redaction_evidence (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'worker')),
  original_body text not null check (pg_catalog.char_length(original_body) between 1 and 4000),
  matched_rules text[] not null check (pg_catalog.cardinality(matched_rules) > 0),
  created_at timestamptz not null default now(),
  unique (message_id)
);

create index if not exists chat_guard_redaction_evidence_sender_idx
  on public.chat_guard_redaction_evidence (sender_id, created_at desc);
create index if not exists chat_guard_redaction_evidence_created_idx
  on public.chat_guard_redaction_evidence (created_at);

alter table public.chat_guard_redaction_evidence enable row level security;
revoke all on table public.chat_guard_redaction_evidence from public, anon, authenticated;
grant select, insert, delete on table public.chat_guard_redaction_evidence to service_role;

-- Updates never; deletes only once a row is past retention, which lets the scheduled prune
-- run while an ordinary delete of fresh evidence still fails.
create or replace function private.protect_chat_guard_redaction_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' and old.created_at < pg_catalog.now() - interval '180 days' then
    return old;
  end if;
  raise exception 'CHAT_GUARD_EVIDENCE_IMMUTABLE' using errcode = 'P0001';
end;
$function$;

revoke all on function private.protect_chat_guard_redaction_evidence() from public, anon, authenticated;

drop trigger if exists chat_guard_redaction_evidence_immutable on public.chat_guard_redaction_evidence;
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
  $$delete from public.chat_guard_redaction_evidence where created_at < now() - interval '180 days'$$
);

commit;
