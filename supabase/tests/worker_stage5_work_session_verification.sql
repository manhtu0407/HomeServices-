-- @pillar id: P167-worker-stage-five-work-session-sql
-- @pillar invariant: Stage 5 operational work-session columns and constraints exist on jobs without changing Kael or customer workflow tables
-- @pillar authority: governance/RULES.md | governance/protocols/backend-structure.md §24-§25 | governance/protocols/test-pillars.md
-- @pillar target: public.jobs.work_started_at, public.jobs.work_paused_at, public.jobs.work_paused_ms, public.jobs.worker_work_note
-- @pillar layer: sql
-- @pillar siblings: P165-worker-stage-five-production, P166-worker-stage-five-work-session-contract
-- @pillar mutation: remove a work-session column or constraint, or widen the note beyond the bounded operational field; this rollback-only verification turns red and never writes production data

begin;

do $verification$
declare
  missing_column text;
begin
  select column_name
  into missing_column
  from (values
    ('work_started_at'),
    ('work_paused_at'),
    ('work_paused_ms'),
    ('worker_work_note')
  ) as expected(column_name)
  where not exists (
    select 1
    from information_schema.columns as information_schema_column
    where table_schema = 'public'
      and table_name = 'jobs'
      and information_schema_column.column_name = expected.column_name
  )
  limit 1;

  if missing_column is not null then
    raise exception 'Stage 5 work-session column is missing: %', missing_column;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.jobs'::regclass
      and conname = 'jobs_work_paused_ms_non_negative'
  ) then
    raise exception 'Stage 5 pause duration constraint is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.jobs'::regclass
      and conname = 'jobs_worker_work_note_length'
  ) then
    raise exception 'Stage 5 worker note length constraint is missing';
  end if;

end;
$verification$;

rollback;
