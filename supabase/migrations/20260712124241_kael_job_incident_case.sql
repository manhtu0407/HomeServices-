create table public.kael_job_incidents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  opened_by uuid not null,
  status text not null default 'open' check (status in (
    'open',
    'awaiting_worker',
    'awaiting_customer',
    'ready_for_scope_proposal',
    'scope_proposed',
    'resolved',
    'cancelled'
  )),
  reported_description text not null,
  reported_reason text not null,
  evidence_photo_urls jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_photo_urls) = 'array'),
  last_summary text,
  last_question text,
  last_next_actor text check (last_next_actor in ('worker', 'customer') or last_next_actor is null),
  evidence_status text not null default 'needs_more' check (evidence_status in ('needs_more', 'ready')),
  scope_change_id uuid references public.scope_change_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index kael_job_incidents_one_active_job_idx
  on public.kael_job_incidents (job_id)
  where status in ('open', 'awaiting_worker', 'awaiting_customer', 'ready_for_scope_proposal');

create index kael_job_incidents_job_updated_idx
  on public.kael_job_incidents (job_id, updated_at desc);

create table public.kael_job_incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.kael_job_incidents(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  source_kind text not null check (source_kind in ('incident_opened', 'incident_updated', 'job_chat_message', 'kael_turn', 'scope_proposed')),
  actor_role text not null check (actor_role in ('customer', 'worker', 'kael', 'system')),
  actor_id uuid,
  message_id uuid references public.chat_messages(id) on delete set null,
  content text,
  media_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(media_refs) = 'array'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create unique index kael_job_incident_events_message_once_idx
  on public.kael_job_incident_events (incident_id, message_id)
  where message_id is not null;

create index kael_job_incident_events_incident_created_idx
  on public.kael_job_incident_events (incident_id, created_at);

alter table public.kael_job_incidents enable row level security;
alter table public.kael_job_incident_events enable row level security;

grant select on public.kael_job_incidents, public.kael_job_incident_events to authenticated;
revoke insert, update, delete on public.kael_job_incidents from authenticated;
revoke insert, update, delete on public.kael_job_incident_events from authenticated;

create policy "Job participants read Kael incidents"
  on public.kael_job_incidents
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1
      from public.jobs as job
      where job.id = kael_job_incidents.job_id
        and auth.uid() in (job.customer_id, job.worker_id)
    )
  );

create policy "Job participants read Kael incident events"
  on public.kael_job_incident_events
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1
      from public.jobs as job
      where job.id = kael_job_incident_events.job_id
        and auth.uid() in (job.customer_id, job.worker_id)
    )
  );
