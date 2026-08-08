-- §50 K1.4: durable resolution metadata for the Kael admin escalation queue.

alter table public.kael_admin_queue
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_note text;

alter table public.kael_admin_queue
  drop constraint if exists kael_admin_queue_resolution_note_check;
alter table public.kael_admin_queue
  add constraint kael_admin_queue_resolution_note_check
  check (resolution_note is null or char_length(btrim(resolution_note)) between 3 and 500);

create index if not exists kael_admin_queue_resolution_idx
  on public.kael_admin_queue (resolved_at desc)
  where status = 'resolved';

comment on column public.kael_admin_queue.resolved_by is
  'Admin profile that resolved the escalation queue item.';
comment on column public.kael_admin_queue.resolution_note is
  'Optional PII-free operator note explaining the resolution.';
