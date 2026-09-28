-- @pillar id: P258-commission-tiers-service-only-sql
-- @pillar invariant: The 15% platform fee cannot be changed by a signed-in account: authenticated admins may read worker_commission_tiers but every insert, update or delete is refused, and the seeded level-1 rate stays 1500 bps
-- @pillar authority: governance/RULES.md #7 | Tu 2026-09-25: commission fixed at 15%
-- @pillar target: supabase/migrations/20260925103000_commission_tiers_service_only.sql
-- @pillar layer: sql
-- @pillar siblings: P10-per-actor-rls
-- @pillar mutation: Re-grant insert, update, delete on worker_commission_tiers to authenticated; the admin update succeeds and P209 raises

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('c2090000-0000-4000-8000-000000000001','authenticated','authenticated','commission-policy-p209@example.test',
  '{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='admin' where id='c2090000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'c2090000-0000-4000-8000-000000000001';

do $admin_read$
begin
  if not exists (select 1 from public.worker_commission_tiers where level = 1) then
    raise exception 'P258_ADMIN_READ_LOST';
  end if;
end;
$admin_read$;

do $admin_update$
begin
  begin
    update public.worker_commission_tiers set commission_rate_bps = 1000 where level = 1;
    raise exception 'P258_ADMIN_UPDATE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end;
$admin_update$;

do $admin_insert$
begin
  begin
    insert into public.worker_commission_tiers(level,min_completed_jobs,min_average_rating,commission_rate_bps)
    values (9, 1, 0, 1000);
    raise exception 'P258_ADMIN_INSERT_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end;
$admin_insert$;

do $admin_delete$
begin
  begin
    delete from public.worker_commission_tiers where level = 1;
    raise exception 'P258_ADMIN_DELETE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end;
$admin_delete$;

reset role;

do $rate_unchanged$
begin
  if (select commission_rate_bps from public.worker_commission_tiers where level = 1) <> 1500 then
    raise exception 'P258_RATE_CHANGED';
  end if;
end;
$rate_unchanged$;

rollback;
