begin;

create table if not exists public.worker_account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete restrict,
  client_request_id uuid not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed')),
  checkpoint text not null default 'requested'
    check (checkpoint in ('requested', 'database_scrubbed', 'completed')),
  storage_refs text[] not null default '{}'::text[],
  requested_at timestamptz not null default now(),
  database_scrubbed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, client_request_id)
);

commit;
