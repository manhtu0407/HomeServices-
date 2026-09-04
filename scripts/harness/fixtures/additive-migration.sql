begin;
alter table public.jobs add column if not exists synthetic_cohort_id text;
commit;
