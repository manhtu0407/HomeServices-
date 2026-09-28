begin;

-- A customer belongs to at most one worker's network at a time. The link forms either when
-- a new customer claims a worker's invite code, or when a customer who came on their own
-- books the same worker again in-app. Links are never edited, only ended, so the history of
-- who earned from whom stays auditable.

create table public.worker_referral_codes (
  worker_id uuid primary key references public.worker_profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.customer_worker_links (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  source text not null check (source in ('invite_code', 'rebook')),
  program_version_id uuid not null references public.ambassador_program_versions(id) on delete restrict,
  formed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  formed_by_job_id uuid references public.jobs(id) on delete set null,
  ended_at timestamptz,
  end_reason text check (end_reason in ('expired', 'penalty', 'fraud', 'admin', 'account_deleted')),
  ended_by uuid references public.profiles(id) on delete restrict,
  case_id uuid,
  check (customer_id <> worker_id),
  check (expires_at > formed_at),
  check ((ended_at is null) = (end_reason is null))
);

create unique index customer_worker_links_one_open
  on public.customer_worker_links (customer_id) where ended_at is null;
create index customer_worker_links_worker_open
  on public.customer_worker_links (worker_id) where ended_at is null;

create table public.referral_claim_attempts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  code_entered text not null check (pg_catalog.char_length(code_entered) between 1 and 32),
  outcome text not null,
  created_at timestamptz not null default now()
);

create index referral_claim_attempts_customer_idx
  on public.referral_claim_attempts (customer_id, created_at desc);

alter table public.worker_referral_codes enable row level security;
alter table public.customer_worker_links enable row level security;
alter table public.referral_claim_attempts enable row level security;
revoke all on table public.worker_referral_codes, public.customer_worker_links,
  public.referral_claim_attempts from public, anon, authenticated;
grant select, insert, update on table public.worker_referral_codes to service_role;
grant select, insert, update on table public.customer_worker_links to service_role;
grant select, insert on table public.referral_claim_attempts to service_role;

create or replace function private.protect_customer_worker_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'CUSTOMER_WORKER_LINK_IMMUTABLE' using errcode = 'P0001';
  end if;
  -- The only permitted change is ending an open link once.
  if old.ended_at is not null
     or new.ended_at is null
     or (to_jsonb(new) - array['ended_at', 'end_reason', 'ended_by', 'case_id'])
        <> (to_jsonb(old) - array['ended_at', 'end_reason', 'ended_by', 'case_id']) then
    raise exception 'CUSTOMER_WORKER_LINK_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

create trigger customer_worker_links_immutable
before update or delete on public.customer_worker_links
for each row execute function private.protect_customer_worker_link();

create or replace function private.reject_append_only_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'APPEND_ONLY_TABLE' using errcode = 'P0001', detail = tg_table_name;
end;
$function$;

create trigger referral_claim_attempts_append_only
before update or delete on public.referral_claim_attempts
for each row execute function private.reject_append_only_mutation();

revoke all on function private.protect_customer_worker_link() from public, anon, authenticated;
revoke all on function private.reject_append_only_mutation() from public, anon, authenticated;

create or replace function private.current_ambassador_program()
returns public.ambassador_program_versions
language sql
stable
security definer
set search_path = ''
as $function$
  select * from public.ambassador_program_versions where status = 'approved';
$function$;

revoke all on function private.current_ambassador_program() from public, anon, authenticated;
grant execute on function private.current_ambassador_program() to service_role;

-- Expired links are closed before anything reads "the customer's open link", so the unique
-- index never blocks a new link behind a stale one.
create or replace function private.close_expired_customer_link(p_customer_id uuid)
returns void
language sql
security definer
set search_path = ''
as $function$
  update public.customer_worker_links
  set ended_at = pg_catalog.now(), end_reason = 'expired'
  where customer_id = p_customer_id
    and ended_at is null
    and expires_at <= pg_catalog.now();
$function$;

revoke all on function private.close_expired_customer_link(uuid) from public, anon, authenticated;
grant execute on function private.close_expired_customer_link(uuid) to service_role;

create or replace function public.ensure_worker_referral_code(p_worker_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt integer := 0;
begin
  select code into v_code from public.worker_referral_codes
  where worker_id = p_worker_id and revoked_at is null;
  if found then
    return v_code;
  end if;

  if not exists (
    select 1 from public.worker_profiles
    where id = p_worker_id and is_approved and not is_suspended
  ) then
    raise exception 'WORKER_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  loop
    v_attempt := v_attempt + 1;
    -- Bytes 6 and 8 of a v4 UUID carry version and variant bits, so only the fully random
    -- bytes are used; 256 is a multiple of 32, so each character is equally likely.
    select pg_catalog.string_agg(
      pg_catalog.substr(v_alphabet, 1 + (pg_catalog.get_byte(v_random, byte_index) % 32), 1), ''
      order by byte_index
    ) into v_code
    from (select pg_catalog.uuid_send(pg_catalog.gen_random_uuid()) as v_random) as source
    cross join pg_catalog.unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as byte_index;
    begin
      insert into public.worker_referral_codes (worker_id, code) values (p_worker_id, v_code)
      on conflict (worker_id) do update set code = excluded.code, created_at = pg_catalog.now(), revoked_at = null
      where public.worker_referral_codes.revoked_at is not null;
      select code into v_code from public.worker_referral_codes where worker_id = p_worker_id;
      return v_code;
    exception when unique_violation then
      if v_attempt >= 5 then raise; end if;
    end;
  end loop;
  return v_code;
end;
$function$;

-- Outcome codes are returned, not raised, so every refusal is also recorded as an attempt.
create or replace function public.claim_referral_code(p_customer_id uuid, p_code text)
returns table (outcome text, link_id uuid, worker_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_code text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')));
  v_program public.ambassador_program_versions%rowtype;
  v_customer public.profiles%rowtype;
  v_worker_id uuid;
  v_open public.customer_worker_links%rowtype;
  v_link_id uuid;
  v_outcome text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('referral:' || p_customer_id::text, 0));

  if (select count(*) from public.referral_claim_attempts
      where customer_id = p_customer_id and created_at > pg_catalog.now() - interval '1 day') >= 10 then
    return query select 'RATE_LIMITED'::text, null::uuid, null::uuid;
    return;
  end if;

  select * into v_customer from public.profiles where id = p_customer_id;
  v_program := private.current_ambassador_program();
  perform private.close_expired_customer_link(p_customer_id);
  select * into v_open from public.customer_worker_links where customer_id = p_customer_id and ended_at is null;
  select code_row.worker_id into v_worker_id
  from public.worker_referral_codes as code_row
  join public.worker_profiles as worker on worker.id = code_row.worker_id
  where code_row.code = v_code and code_row.revoked_at is null
    and worker.is_approved and not worker.is_suspended;

  v_outcome := case
    when v_customer.id is null or v_customer.role <> 'customer'::public.user_role then 'NOT_CUSTOMER'
    when v_program.id is null then 'PROGRAM_UNAVAILABLE'
    when v_worker_id is null then 'CODE_NOT_FOUND'
    when v_worker_id = p_customer_id then 'SELF_REFERRAL'
    when v_open.id is not null and v_open.worker_id = v_worker_id and v_open.source = 'invite_code' then 'ALREADY_LINKED'
    when v_open.id is not null then 'LINKED_TO_OTHER_WORKER'
    when v_customer.created_at < pg_catalog.now() - pg_catalog.make_interval(days => v_program.invite_claim_days) then 'CLAIM_WINDOW_CLOSED'
    when exists (
      select 1 from public.jobs as job
      where job.customer_id = p_customer_id and job.paid_at is not null
    ) then 'ALREADY_TRANSACTED'
    else 'LINKED'
  end;

  insert into public.referral_claim_attempts (customer_id, code_entered, outcome)
  values (p_customer_id, pg_catalog.left(coalesce(nullif(v_code, ''), '-'), 32), v_outcome);

  if v_outcome = 'ALREADY_LINKED' then
    return query select v_outcome, v_open.id, v_open.worker_id;
    return;
  end if;
  if v_outcome <> 'LINKED' then
    return query select v_outcome, null::uuid, null::uuid;
    return;
  end if;

  insert into public.customer_worker_links (
    customer_id, worker_id, source, program_version_id, formed_at, expires_at
  ) values (
    p_customer_id, v_worker_id, 'invite_code', v_program.id, pg_catalog.now(),
    v_customer.created_at + pg_catalog.make_interval(months => v_program.link_months)
  ) returning id into v_link_id;

  return query select v_outcome, v_link_id, v_worker_id;
end;
$function$;

revoke all on function public.ensure_worker_referral_code(uuid) from public, anon, authenticated;
revoke all on function public.claim_referral_code(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_worker_referral_code(uuid) to service_role;
grant execute on function public.claim_referral_code(uuid, text) to service_role;

commit;
