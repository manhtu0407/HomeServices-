-- Customer Profile Feedback -> Kael
-- Edge service-role writes raw feedback and a scrubbed copy for later
-- review/learning workflows. Mobile clients should call mobile-api, not insert
-- directly into this table.

begin;

create table if not exists public.customer_kael_feedback (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'profile'
    check (source in ('profile')),
  language text not null default 'vi'
    check (language in ('vi', 'en')),
  message text not null
    check (char_length(btrim(message)) between 8 and 1200),
  message_scrubbed text not null
    check (char_length(btrim(message_scrubbed)) between 1 and 1200),
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'archived')),
  safe_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_kael_feedback_customer_created_idx
  on public.customer_kael_feedback (customer_id, created_at desc);

create index if not exists customer_kael_feedback_status_created_idx
  on public.customer_kael_feedback (status, created_at desc);

drop trigger if exists customer_kael_feedback_updated_at
  on public.customer_kael_feedback;
create trigger customer_kael_feedback_updated_at
  before update on public.customer_kael_feedback
  for each row execute function update_updated_at();

alter table public.customer_kael_feedback enable row level security;

drop policy if exists "Customers read own Kael feedback"
  on public.customer_kael_feedback;
create policy "Customers read own Kael feedback"
  on public.customer_kael_feedback
  for select
  to authenticated
  using (customer_id = (select auth.uid()));

drop policy if exists "Admins read Kael feedback"
  on public.customer_kael_feedback;
create policy "Admins read Kael feedback"
  on public.customer_kael_feedback
  for select
  to authenticated
  using ((select private.is_admin()));

drop policy if exists "Admins update Kael feedback"
  on public.customer_kael_feedback;
create policy "Admins update Kael feedback"
  on public.customer_kael_feedback
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.customer_kael_feedback from public;
revoke all on public.customer_kael_feedback from anon;
revoke all on public.customer_kael_feedback from authenticated;
grant select on public.customer_kael_feedback to authenticated;
grant update (status, safe_metadata) on public.customer_kael_feedback to authenticated;
grant all on public.customer_kael_feedback to service_role;

comment on table public.customer_kael_feedback is
  'Customer-submitted feedback for Kael/profile UX. Writes stay behind mobile-api service role; raw message is stored with a scrubbed copy for later controlled learning/review.';

commit;
