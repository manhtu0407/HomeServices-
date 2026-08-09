-- Verify the district contract and its volatility classification after the
-- migration. This test is rollback-only and safe for the local SQL harness.

begin;

do $$
declare
  v_volatility text;
begin
  select p.provolatile::text
    into strict v_volatility
    from pg_proc as p
   where p.oid = 'public.normalize_hcmc_district_code(text)'::regprocedure;

  if v_volatility <> 's' then
    raise exception 'normalize_hcmc_district_code must be STABLE, got %', v_volatility;
  end if;

  if public.normalize_hcmc_district_code(U&'Qu\1EADn 7') is distinct from 'q7' then
    raise exception 'district normalization no longer recognizes Quan 7';
  end if;

  if public.normalize_hcmc_district_code(U&'Th\00E0nh ph\1ED1 Th\1EE7 \0110\1EE9c') is distinct from 'thu_duc' then
    raise exception 'district normalization no longer recognizes Thanh pho Thu Duc';
  end if;

  if public.normalize_hcmc_district_code('unknown district') is not null then
    raise exception 'district normalization must reject unknown districts';
  end if;
end
$$;

rollback;
