alter table public.scope_change_requests
  add column if not exists kael_progress jsonb;

alter table public.scope_change_requests
  drop constraint if exists scope_change_requests_kael_progress_is_object;

alter table public.scope_change_requests
  add constraint scope_change_requests_kael_progress_is_object
  check (kael_progress is null or jsonb_typeof(kael_progress) = 'object')
  not valid;

alter table public.scope_change_requests
  validate constraint scope_change_requests_kael_progress_is_object;

comment on column public.scope_change_requests.kael_progress is
  'Kael progress snapshot for scope-change review/estimate perceived-performance UI.';
