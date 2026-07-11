-- Six-service taxonomy and customer-confirmed worker selection foundation.
--
-- Enum additions are intentionally first and this migration does not use the
-- new values in data statements. PostgreSQL can therefore commit the enum
-- changes before later Edge/runtime migrations start writing those values.

alter type public.service_type add value if not exists 'hvac';
alter type public.service_type add value if not exists 'upholstery';
alter type public.service_type add value if not exists 'handyman';

alter type public.job_status
  add value if not exists 'worker_candidate_pending' after 'broadcasting';

-- A worker accepting a broadcast becomes a proposal. jobs.worker_id remains
-- reserved for the worker that the customer has explicitly confirmed.
create table public.job_worker_candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  broadcast_id uuid references public.job_broadcasts(id) on delete set null,
  status text not null default 'proposed' check (status in (
    'proposed',
    'customer_confirmed',
    'customer_declined',
    'expired',
    'withdrawn'
  )),
  proposed_at timestamptz not null default now(),
  expires_at timestamptz,
  customer_decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_worker_candidates_expiry_check
    check (expires_at is null or expires_at > proposed_at),
  constraint job_worker_candidates_decision_time_check
    check (
      status not in ('customer_confirmed', 'customer_declined')
      or customer_decided_at is not null
    )
);

create unique index job_worker_candidates_one_active_per_job_idx
  on public.job_worker_candidates (job_id)
  where status = 'proposed';

create index job_worker_candidates_worker_status_idx
  on public.job_worker_candidates (worker_id, status, proposed_at desc);

create trigger job_worker_candidates_updated_at
  before update on public.job_worker_candidates
  for each row execute function public.update_updated_at();

-- This is a customer-owned preference, not a public worker endorsement.
create table public.customer_favorite_workers (
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, worker_id),
  constraint customer_favorite_workers_distinct_actors_check
    check (customer_id <> worker_id)
);

create index customer_favorite_workers_worker_idx
  on public.customer_favorite_workers (worker_id, created_at desc);

alter table public.job_worker_candidates enable row level security;
alter table public.customer_favorite_workers enable row level security;

-- Candidate state is written only by the Edge service-role orchestration.
-- Customers and candidate workers can read only their own proposal.
create policy "Customers read own worker candidates"
  on public.job_worker_candidates
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.jobs as j
      where j.id = job_worker_candidates.job_id
        and j.customer_id = (select auth.uid())
    )
  );

create policy "Workers read own candidacies"
  on public.job_worker_candidates
  for select
  to authenticated
  using (worker_id = (select auth.uid()));

create policy "Admins read worker candidates"
  on public.job_worker_candidates
  for select
  to authenticated
  using (private.is_admin());

create policy "Customers read own favorite workers"
  on public.customer_favorite_workers
  for select
  to authenticated
  using (customer_id = (select auth.uid()));

create policy "Customers save own favorite workers"
  on public.customer_favorite_workers
  for insert
  to authenticated
  with check (customer_id = (select auth.uid()));

create policy "Customers remove own favorite workers"
  on public.customer_favorite_workers
  for delete
  to authenticated
  using (customer_id = (select auth.uid()));

create policy "Admins read customer favorite workers"
  on public.customer_favorite_workers
  for select
  to authenticated
  using (private.is_admin());

-- Explicit grants keep new public tables visible only to the roles that need
-- them even when automatic Data API exposure is disabled.
revoke all on public.job_worker_candidates from public, anon, authenticated;
revoke all on public.customer_favorite_workers from public, anon, authenticated;

grant select on public.job_worker_candidates to authenticated;
revoke insert, update, delete on public.job_worker_candidates from authenticated;

grant select, insert, delete on public.customer_favorite_workers to authenticated;
revoke update on public.customer_favorite_workers from authenticated;

grant select, insert, update, delete on public.job_worker_candidates to service_role;
grant select, insert, update, delete on public.customer_favorite_workers to service_role;

comment on table public.job_worker_candidates is
  'Server-owned worker proposals awaiting explicit customer confirmation before jobs.worker_id assignment.';

comment on table public.customer_favorite_workers is
  'Private customer-owned worker preferences; never a public rating or endorsement.';
