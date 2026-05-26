-- P3 Kael Harness: realtime-visible pipeline progress on jobs.

alter table public.jobs add column if not exists kael_progress jsonb;

alter table public.jobs
  drop constraint if exists kael_progress_is_object;

alter table public.jobs
  add constraint kael_progress_is_object
  check (kael_progress is null or jsonb_typeof(kael_progress) = 'object')
  not valid;

alter table public.jobs
  validate constraint kael_progress_is_object;

comment on column public.jobs.kael_progress is
  'Kael P3 streaming progress. Edge service-role updates this jsonb; jobs realtime broadcasts expose progress to authorized participants.';
