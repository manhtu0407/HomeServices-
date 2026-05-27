alter table public.jobs
  drop constraint if exists jobs_geo_source_check;

alter table public.jobs
  add constraint jobs_geo_source_check
  check (geo_source in ('google_maps', 'vietmap', 'manual', 'fallback'));
