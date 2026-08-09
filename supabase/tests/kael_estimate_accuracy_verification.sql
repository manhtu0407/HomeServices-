begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'f5100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'kael-accuracy@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.jobs (
  id, customer_id, service_type, description, address_district, status,
  kael_complexity, kael_price_min, kael_price_max, final_price, completed_at
) values
  ('f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000001', 'electrical', 'in band', 'q1', 'paid', 'small', 200000, 300000, 250000, '2099-08-02'),
  ('f5200000-0000-4000-8000-000000000002', 'f5100000-0000-4000-8000-000000000001', 'electrical', 'below band', 'q1', 'paid', 'small', 200000, 300000, 100000, '2099-08-03'),
  ('f5200000-0000-4000-8000-000000000003', 'f5100000-0000-4000-8000-000000000001', 'electrical', 'above band', 'q1', 'paid', 'small', 200000, 300000, 450000, '2099-08-04'),
  ('f5200000-0000-4000-8000-000000000004', 'f5100000-0000-4000-8000-000000000001', 'electrical', 'not completed', 'q1', 'repairing', 'small', 200000, 300000, 250000, null);

do $$
declare
  v_row record;
begin
  select * into v_row
  from public.kael_estimate_accuracy
  where service_type = 'electrical' and complexity = 'small' and month = '2099-08-01';
  if v_row.job_count <> 3 or v_row.in_band_count <> 1 or v_row.under_count <> 1 or v_row.over_count <> 1 then
    raise exception 'kael estimate accuracy direction counts are wrong';
  end if;
  if v_row.in_band_rate <> 0.3333 then
    raise exception 'kael estimate accuracy in-band rate is wrong: %', v_row.in_band_rate;
  end if;
  if v_row.p90_miss_ratio <= 0 then
    raise exception 'kael estimate accuracy p90 was not calculated';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'kael_estimate_accuracy'
      and coalesce(relation.reloptions, '{}') @> array['security_invoker=true']
  ) then
    raise exception 'kael estimate accuracy view must use security_invoker';
  end if;
  if has_table_privilege('authenticated', 'public.kael_estimate_accuracy', 'select') then
    raise exception 'authenticated must not have direct access to kael estimate accuracy';
  end if;
  if not has_table_privilege('service_role', 'public.kael_estimate_accuracy', 'select') then
    raise exception 'service_role must retain kael estimate accuracy access';
  end if;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'f5100000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  begin
    perform 1 from public.kael_estimate_accuracy limit 1;
    raise exception 'authenticated must not read kael estimate accuracy';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.kael_estimate_accuracy
  where service_type = 'electrical' and complexity = 'small' and month = '2099-08-01';
  if v_count <> 1 then
    raise exception 'service_role must read kael estimate accuracy';
  end if;
end;
$$;

reset role;
rollback;
