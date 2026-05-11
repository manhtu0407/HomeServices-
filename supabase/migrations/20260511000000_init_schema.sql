-- =============================================================================
-- Migration: 20260511000000_init_schema.sql
-- Phase 1 — Home Services platform initial schema
-- Tables: profiles, customer_profiles, worker_profiles, price_baselines,
--         jobs, job_broadcasts, chat_messages, reviews, api_logs
-- =============================================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- =============================================================================
-- ENUMS
-- =============================================================================

create type user_role as enum ('customer', 'worker', 'admin');
create type service_type as enum ('electrical', 'plumbing');
create type job_status as enum (
  'pending',          -- A3: submitted, Kael processing
  'broadcast',        -- A7: customer confirmed, broadcasting to workers
  'matched',          -- B2: worker accepted
  'worker_en_route',  -- worker heading to location
  'inspecting',       -- worker on site
  'in_progress',      -- work in progress
  'scope_change',     -- A11: pending customer confirm
  'completed',        -- B5: worker done, awaiting A12
  'confirmed',        -- A12: customer confirmed
  'paid',             -- payment done
  'cancelled'
);
create type complexity_level as enum ('small', 'medium', 'large');
create type broadcast_status as enum ('pending', 'accepted', 'declined', 'expired');
create type message_sender as enum ('customer', 'worker', 'kael');
create type api_provider as enum ('anthropic', 'perplexity', 'deepseek');

-- =============================================================================
-- UTILITY
-- =============================================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =============================================================================
-- PROFILES — identity for all users
-- =============================================================================

create table profiles (
  id         uuid references auth.users on delete cascade primary key,
  role       user_role not null,
  full_name  text,
  phone      text unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- Auto-create profile on Supabase Auth signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, phone)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer'),
    new.phone
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =============================================================================
-- CUSTOMER PROFILES — apartment address
-- =============================================================================

create table customer_profiles (
  id            uuid references profiles on delete cascade primary key,
  building_name text,
  unit_number   text,
  floor         text,
  district      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger customer_profiles_updated_at
  before update on customer_profiles
  for each row execute function update_updated_at();

-- =============================================================================
-- WORKER PROFILES — skills, areas, verification, rating
-- =============================================================================

create table worker_profiles (
  id               uuid references profiles on delete cascade primary key,
  service_types    service_type[] not null default '{}',
  years_experience int not null default 0,
  districts        text[] not null default '{}',
  is_approved      boolean not null default false,
  is_available     boolean not null default false,
  cccd_front_url   text,
  cccd_back_url    text,
  selfie_url       text,
  bank_account     text,
  bank_name        text,
  rating           numeric(3,2) not null default 0,
  total_jobs       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger worker_profiles_updated_at
  before update on worker_profiles
  for each row execute function update_updated_at();

-- =============================================================================
-- PRICE BASELINES — admin-maintained fallback (RULES: no hardcoded VND in code)
-- =============================================================================

create table price_baselines (
  id           uuid primary key default gen_random_uuid(),
  service_type service_type not null,
  complexity   complexity_level not null,
  price_min    int not null,
  price_max    int not null,
  updated_at   timestamptz not null default now(),
  unique (service_type, complexity)
);

create trigger price_baselines_updated_at
  before update on price_baselines
  for each row execute function update_updated_at();

-- Seed: initial market estimates for HCMC (admin updates via dashboard)
insert into price_baselines (service_type, complexity, price_min, price_max) values
  ('electrical', 'small',   100000,  300000),
  ('electrical', 'medium',  300000,  700000),
  ('electrical', 'large',   700000, 2000000),
  ('plumbing',   'small',   150000,  350000),
  ('plumbing',   'medium',  350000,  800000),
  ('plumbing',   'large',   800000, 2500000);

-- =============================================================================
-- JOBS — core table, drives the entire workflow
-- =============================================================================

create table jobs (
  id                              uuid primary key default gen_random_uuid(),
  customer_id                     uuid references profiles not null,
  worker_id                       uuid references profiles,
  service_type                    service_type not null,
  problem_chips                   text[] not null default '{}',
  description                     text not null,
  photo_urls                      text[] not null default '{}',
  -- Address snapshot at time of booking
  address_building                text,
  address_unit                    text,
  address_floor                   text,
  address_district                text,
  -- Scheduling (null = "now")
  scheduled_at                    timestamptz,
  -- Status machine
  status                          job_status not null default 'pending',
  -- Kael price estimate outputs (3C)
  kael_problem_identified         text,
  kael_complexity                 complexity_level,
  kael_price_min                  int,
  kael_price_max                  int,
  kael_advisory                   text,
  price_context_1                 jsonb,
  price_context_2                 jsonb,
  -- Scope change (A11 / B4)
  scope_change_description        text,
  scope_change_price_min          int,
  scope_change_price_max          int,
  scope_change_reason             text,
  scope_change_customer_decision  text check (scope_change_customer_decision in ('approved', 'cancelled')),
  -- Completion (B5 / A12)
  completion_notes                text,
  completion_photo_urls           text[] not null default '{}',
  final_price                     int,
  -- Status transition timestamps
  broadcast_at                    timestamptz,
  matched_at                      timestamptz,
  completed_at                    timestamptz,
  confirmed_at                    timestamptz,
  paid_at                         timestamptz,
  cancelled_at                    timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index jobs_customer_id_idx on jobs (customer_id);
create index jobs_worker_id_idx on jobs (worker_id);
create index jobs_status_idx on jobs (status);
create index jobs_created_at_idx on jobs (created_at desc);

create trigger jobs_updated_at
  before update on jobs
  for each row execute function update_updated_at();

-- =============================================================================
-- JOB BROADCASTS — worker notifications with 60s countdown (B2)
-- =============================================================================

create table job_broadcasts (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references jobs on delete cascade not null,
  worker_id    uuid references profiles not null,
  status       broadcast_status not null default 'pending',
  broadcast_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (job_id, worker_id)
);

create index job_broadcasts_job_id_idx on job_broadcasts (job_id);
create index job_broadcasts_worker_id_idx on job_broadcasts (worker_id);

-- =============================================================================
-- CHAT MESSAGES — customer ↔ worker via Kael relay (3D)
-- =============================================================================

create table chat_messages (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references jobs on delete cascade not null,
  sender_id   uuid references profiles,  -- null = Kael system message
  sender_role message_sender not null,
  content     text not null,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index chat_messages_job_id_idx on chat_messages (job_id);
create index chat_messages_created_at_idx on chat_messages (job_id, created_at);

-- =============================================================================
-- REVIEWS — post-job ratings (A14)
-- =============================================================================

create table reviews (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references jobs on delete cascade unique not null,
  customer_id uuid references profiles not null,
  worker_id   uuid references profiles not null,
  rating      int not null check (rating between 1 and 5),
  tags        text[] not null default '{}',
  comment     text,
  created_at  timestamptz not null default now()
);

-- Auto-update worker rating after each review
create or replace function update_worker_rating()
returns trigger as $$
begin
  update worker_profiles
  set
    rating     = (select round(avg(rating)::numeric, 2) from reviews where worker_id = new.worker_id),
    total_jobs = (select count(*) from reviews where worker_id = new.worker_id)
  where id = new.worker_id;
  return new;
end;
$$ language plpgsql;

create trigger reviews_update_worker_rating
  after insert on reviews
  for each row execute function update_worker_rating();

-- =============================================================================
-- API LOGS — RULES #9: log all AI calls, no PII
-- =============================================================================

create table api_logs (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid references jobs,
  provider      api_provider not null,
  model         text,
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(10,6),
  latency_ms    int,
  success       boolean not null,
  error_code    text,
  created_at    timestamptz not null default now()
);

create index api_logs_job_id_idx on api_logs (job_id);
create index api_logs_provider_idx on api_logs (provider);
create index api_logs_created_at_idx on api_logs (created_at desc);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table profiles          enable row level security;
alter table customer_profiles enable row level security;
alter table worker_profiles   enable row level security;
alter table price_baselines   enable row level security;
alter table jobs               enable row level security;
alter table job_broadcasts    enable row level security;
alter table chat_messages     enable row level security;
alter table reviews            enable row level security;
alter table api_logs           enable row level security;

-- profiles
create policy "Users read own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Customers view approved worker public info"
  on profiles for select using (
    role = 'worker' and
    exists (select 1 from worker_profiles wp where wp.id = profiles.id and wp.is_approved = true)
  );

-- customer_profiles
create policy "Customers manage own customer profile"
  on customer_profiles for all using (auth.uid() = id);

-- worker_profiles
create policy "Workers manage own worker profile"
  on worker_profiles for all using (auth.uid() = id);

create policy "Customers view approved worker profiles"
  on worker_profiles for select using (is_approved = true);

-- price_baselines: public read for all authenticated
create policy "Authenticated users read price baselines"
  on price_baselines for select using (auth.role() = 'authenticated');

-- jobs
create policy "Customers view own jobs"
  on jobs for select using (auth.uid() = customer_id);

create policy "Customers create jobs"
  on jobs for insert with check (auth.uid() = customer_id);

create policy "Customers update own jobs"
  on jobs for update using (auth.uid() = customer_id);

create policy "Workers view assigned or broadcasted jobs"
  on jobs for select using (
    auth.uid() = worker_id or
    exists (select 1 from job_broadcasts jb where jb.job_id = jobs.id and jb.worker_id = auth.uid())
  );

create policy "Workers update assigned jobs"
  on jobs for update using (auth.uid() = worker_id);

-- job_broadcasts
create policy "Workers view own broadcasts"
  on job_broadcasts for select using (auth.uid() = worker_id);

create policy "Workers respond to own broadcasts"
  on job_broadcasts for update using (auth.uid() = worker_id);

-- chat_messages
create policy "Job participants read messages"
  on chat_messages for select using (
    exists (
      select 1 from jobs j
      where j.id = chat_messages.job_id
        and (j.customer_id = auth.uid() or j.worker_id = auth.uid())
    )
  );

create policy "Job participants send messages"
  on chat_messages for insert with check (
    auth.uid() = sender_id and
    exists (
      select 1 from jobs j
      where j.id = chat_messages.job_id
        and (j.customer_id = auth.uid() or j.worker_id = auth.uid())
    )
  );

-- reviews
create policy "Customers create reviews for confirmed jobs"
  on reviews for insert with check (
    auth.uid() = customer_id and
    exists (
      select 1 from jobs j
      where j.id = reviews.job_id
        and j.customer_id = auth.uid()
        and j.status = 'confirmed'
    )
  );

create policy "Authenticated users read reviews"
  on reviews for select using (auth.role() = 'authenticated');

-- api_logs: service role only — no user RLS needed

-- =============================================================================
-- REALTIME
-- =============================================================================

alter publication supabase_realtime add table jobs;
alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table job_broadcasts;

-- =============================================================================
-- STORAGE BUCKETS
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('job-photos',        'job-photos',        false, 10485760, array['image/jpeg','image/png','image/webp','video/mp4']),
  ('completion-photos', 'completion-photos', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('worker-documents',  'worker-documents',  false, 5242880,  array['image/jpeg','image/png','image/webp']);

-- Storage: job photos
create policy "Authenticated users upload job photos"
  on storage.objects for insert
  with check (bucket_id = 'job-photos' and auth.role() = 'authenticated');

create policy "Authenticated users view job photos"
  on storage.objects for select
  using (bucket_id = 'job-photos' and auth.role() = 'authenticated');

-- Storage: completion photos
create policy "Authenticated users upload completion photos"
  on storage.objects for insert
  with check (bucket_id = 'completion-photos' and auth.role() = 'authenticated');

create policy "Authenticated users view completion photos"
  on storage.objects for select
  using (bucket_id = 'completion-photos' and auth.role() = 'authenticated');

-- Storage: worker documents (private — workers access own folder only)
create policy "Workers upload own documents"
  on storage.objects for insert
  with check (bucket_id = 'worker-documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Workers view own documents"
  on storage.objects for select
  using (bucket_id = 'worker-documents' and auth.uid()::text = (storage.foldername(name))[1]);
