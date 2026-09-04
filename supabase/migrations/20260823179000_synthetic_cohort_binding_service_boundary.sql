begin;

create or replace function public.bind_synthetic_matching_cohort(
  p_cohort_id text,
  p_customer_ids uuid[],
  p_worker_ids uuid[]
) returns table(bound_customers integer, bound_workers integer)
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_customer_count integer;
  v_worker_count integer;
begin
  if p_cohort_id !~ '^synthetic-[a-z0-9-]{8,100}$'
    or cardinality(p_customer_ids) < 1
    or cardinality(p_worker_ids) < 1
    or array_position(p_customer_ids, null) is not null
    or array_position(p_worker_ids, null) is not null
  then
    raise exception using errcode = '22023', message = 'SYNTHETIC_COHORT_BINDING_INVALID';
  end if;

  if exists (
    select 1
    from unnest(p_customer_ids) requested(id)
    left join public.profiles profile on profile.id = requested.id
    left join auth.users identity on identity.id = requested.id
    where profile.id is null
      or profile.role <> 'customer'
      or identity.email is null
      or identity.email not like '%@example.test'
      or exists (select 1 from public.jobs job where job.customer_id = requested.id)
      or exists (
        select 1 from public.kael_chat_sessions session
        where session.customer_id = requested.id
      )
  ) or exists (
    select 1
    from unnest(p_worker_ids) requested(id)
    left join public.profiles profile on profile.id = requested.id
    left join auth.users identity on identity.id = requested.id
    where profile.id is null
      or profile.role <> 'worker'
      or identity.email is null
      or identity.email not like '%@example.test'
  ) then
    raise exception using errcode = '42501', message = 'SYNTHETIC_DEDICATED_IDENTITY_REQUIRED';
  end if;

  if exists (
    select 1 from public.worker_payout_methods method
    where method.worker_id = any(p_worker_ids)
  ) or exists (
    select 1 from public.worker_withdrawal_requests request
    where request.worker_id = any(p_worker_ids)
  ) or exists (
    select 1 from public.worker_payment_ledger ledger
    where ledger.worker_id = any(p_worker_ids)
  ) or exists (
    select 1 from public.customer_favorite_workers favorite
    where favorite.worker_id = any(p_worker_ids)
      and not (favorite.customer_id = any(p_customer_ids))
  ) or exists (
    select 1 from public.customer_favorite_workers favorite
    where favorite.customer_id = any(p_customer_ids)
      and not (favorite.worker_id = any(p_worker_ids))
  ) then
    raise exception using errcode = '42501', message = 'SYNTHETIC_EXISTING_RELATIONSHIP_FORBIDDEN';
  end if;

  insert into public.synthetic_matching_cohorts(cohort_id)
  values (p_cohort_id)
  on conflict do nothing;

  insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
  select p_cohort_id, requested.id, 'customer'
  from unnest(p_customer_ids) requested(id)
  on conflict (profile_id) do update
  set cohort_id = excluded.cohort_id,
      member_role = excluded.member_role;
  get diagnostics v_customer_count = row_count;

  insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
  select p_cohort_id, requested.id, 'worker'
  from unnest(p_worker_ids) requested(id)
  on conflict (profile_id) do update
  set cohort_id = excluded.cohort_id,
      member_role = excluded.member_role;
  get diagnostics v_worker_count = row_count;

  update public.worker_profiles profile
  set synthetic_cohort_id = p_cohort_id,
      matching_push_proven_at = null,
      matching_foreground_active_until = null,
      updated_at = now()
  where profile.id = any(p_worker_ids);

  return query select v_customer_count, v_worker_count;
end;
$func$;

revoke execute on function public.bind_synthetic_matching_cohort(text, uuid[], uuid[])
from public, anon, authenticated;
grant execute on function public.bind_synthetic_matching_cohort(text, uuid[], uuid[])
to service_role;

comment on function public.bind_synthetic_matching_cohort(text, uuid[], uuid[]) is
  'Binds dedicated synthetic Auth identities through the service-owned smoke boundary; never callable by app actors.';

commit;
