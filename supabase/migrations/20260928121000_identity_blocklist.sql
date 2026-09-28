begin;

-- A worker banned for harming a customer must not come back under a new account. The CCCD
-- number an admin reads off the ID photo at approval, the phone number and the sign-in email
-- (Gmail dots and +tags folded away) are stored only
-- as HMAC-SHA256 digests keyed by a secret that lives in the Edge runtime. A 12-digit CCCD has
-- a small key space, so an unkeyed hash here could be reversed by brute force; the database
-- never sees either the number or the key. Only the last four digits are kept for display.

create table public.worker_identity_numbers (
  worker_id uuid primary key references public.worker_profiles(id) on delete cascade,
  cccd_hmac text not null check (cccd_hmac ~ '^[0-9a-f]{64}$'),
  cccd_last4 text not null check (cccd_last4 ~ '^[0-9]{4}$'),
  phone_hmac text check (phone_hmac ~ '^[0-9a-f]{64}$'),
  email_hmac text check (email_hmac ~ '^[0-9a-f]{64}$'),
  entered_by uuid not null references public.profiles(id) on delete restrict,
  entered_at timestamptz not null default now()
);

create table public.identity_blocklist (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('cccd', 'phone', 'email')),
  value_hmac text not null check (value_hmac ~ '^[0-9a-f]{64}$'),
  case_id uuid references public.worker_violation_cases(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles(id) on delete restrict,
  lift_reason text check (lift_reason is null or pg_catalog.char_length(lift_reason) between 10 and 1000),
  check ((lifted_at is null) = (lifted_by is null)),
  check ((lifted_at is null) = (lift_reason is null))
);

create unique index identity_blocklist_active
  on public.identity_blocklist (kind, value_hmac) where lifted_at is null;

alter table public.worker_identity_numbers enable row level security;
alter table public.identity_blocklist enable row level security;
revoke all on table public.worker_identity_numbers, public.identity_blocklist from public, anon, authenticated;
grant select, insert, update on table public.worker_identity_numbers to service_role;
grant select, insert, update on table public.identity_blocklist to service_role;

create or replace function private.identity_blocked(p_kind text, p_value_hmac text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.identity_blocklist
    where kind = p_kind and value_hmac = pg_catalog.lower(p_value_hmac) and lifted_at is null
  );
$function$;

-- Checks a set of digests at once, e.g. a registering worker's phone, or an applicant's CCCD
-- and phone at approval. Returns the kinds that are blocked; an empty array means clear.
create or replace function public.check_identity_blocklist(p_digests jsonb)
returns text[]
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(pg_catalog.array_agg(distinct digest.kind order by digest.kind), '{}'::text[])
  from pg_catalog.jsonb_to_recordset(coalesce(p_digests, '[]'::jsonb)) as digest(kind text, value_hmac text)
  where private.identity_blocked(digest.kind, digest.value_hmac);
$function$;

create or replace function public.admin_set_worker_identity_number(
  p_actor_id uuid,
  p_worker_id uuid,
  p_cccd_hmac text,
  p_cccd_last4 text,
  p_phone_hmac text default null,
  p_email_hmac text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.review');
  if p_cccd_hmac !~ '^[0-9a-f]{64}$' or p_cccd_last4 !~ '^[0-9]{4}$'
     or coalesce(p_phone_hmac, repeat('0', 64)) !~ '^[0-9a-f]{64}$'
     or coalesce(p_email_hmac, repeat('0', 64)) !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_IDENTITY_INPUT' using errcode = '22023';
  end if;
  if not exists (select 1 from public.worker_profiles where id = p_worker_id) then
    raise exception 'WORKER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if private.identity_blocked('cccd', p_cccd_hmac)
     or (p_phone_hmac is not null and private.identity_blocked('phone', p_phone_hmac))
     or (p_email_hmac is not null and private.identity_blocked('email', p_email_hmac)) then
    raise exception 'IDENTITY_BLOCKLISTED' using errcode = 'P0001';
  end if;

  insert into public.worker_identity_numbers (worker_id, cccd_hmac, cccd_last4, phone_hmac, email_hmac, entered_by)
  values (p_worker_id, p_cccd_hmac, p_cccd_last4, p_phone_hmac, p_email_hmac, p_actor_id)
  on conflict (worker_id) do update
    set cccd_hmac = excluded.cccd_hmac, cccd_last4 = excluded.cccd_last4,
        phone_hmac = excluded.phone_hmac, email_hmac = excluded.email_hmac,
        entered_by = excluded.entered_by, entered_at = pg_catalog.now();

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id,
    (select profile.role::text from public.profiles as profile where profile.id = p_actor_id),
    'admin_worker_identity', 'set_identity_number', 'worker_identity', 'allow',
    'worker_identity_number_recorded',
    pg_catalog.jsonb_build_object('worker_id', p_worker_id, 'cccd_last4', p_cccd_last4)
  );

  return pg_catalog.jsonb_build_object('worker_id', p_worker_id, 'cccd_last4', p_cccd_last4);
end;
$function$;

create or replace function public.admin_lift_identity_block(p_actor_id uuid, p_block_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.discipline.manage');
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'INVALID_LIFT_REASON' using errcode = '22023';
  end if;
  update public.identity_blocklist
  set lifted_at = pg_catalog.now(), lifted_by = p_actor_id, lift_reason = pg_catalog.btrim(p_reason)
  where id = p_block_id and lifted_at is null;
  if not found then
    raise exception 'BLOCK_NOT_FOUND' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('id', p_block_id, 'lifted', true);
end;
$function$;

revoke all on function private.identity_blocked(text, text) from public, anon, authenticated;
revoke all on function public.check_identity_blocklist(jsonb) from public, anon, authenticated;
revoke all on function public.admin_set_worker_identity_number(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_lift_identity_block(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.identity_blocked(text, text) to service_role;
grant execute on function public.check_identity_blocklist(jsonb) to service_role;
grant execute on function public.admin_set_worker_identity_number(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.admin_lift_identity_block(uuid, uuid, text) to service_role;

-- First approval of a worker needs a recorded CCCD that is not blocked. Reinstating a worker
-- after a suspension is not a first approval and is left alone.
create or replace function private.enforce_worker_identity_on_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_identity public.worker_identity_numbers%rowtype;
begin
  select * into v_identity from public.worker_identity_numbers where worker_id = new.id;
  if v_identity.cccd_hmac is null then
    raise exception 'IDENTITY_NUMBER_REQUIRED' using errcode = 'P0001';
  end if;
  if private.identity_blocked('cccd', v_identity.cccd_hmac)
     or (v_identity.phone_hmac is not null and private.identity_blocked('phone', v_identity.phone_hmac))
     or (v_identity.email_hmac is not null and private.identity_blocked('email', v_identity.email_hmac)) then
    raise exception 'IDENTITY_BLOCKLISTED' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_worker_identity_on_approval() from public, anon, authenticated;

create trigger worker_profiles_identity_on_approval
before update of verification_status on public.worker_profiles
for each row
when (new.verification_status = 'approved'::public.worker_verification_status
  and old.verification_status in ('draft'::public.worker_verification_status, 'submitted'::public.worker_verification_status,
    'under_review'::public.worker_verification_status, 'rejected'::public.worker_verification_status))
execute function private.enforce_worker_identity_on_approval();

commit;
