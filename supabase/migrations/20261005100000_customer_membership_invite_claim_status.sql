begin;

-- The membership summary now says whether the customer can still claim an invite code, so
-- the app shows the code field only when a claim could succeed instead of letting the
-- customer type a code the server will refuse. The checks run in the same order as
-- public.claim_referral_code, and every existing field keeps its shape.
create or replace function public.get_customer_membership_summary(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_program public.ambassador_program_versions%rowtype;
  v_link public.customer_worker_links%rowtype;
  v_customer_created_at timestamptz;
  v_closes_at timestamptz;
  v_claim_status text;
begin
  v_program := private.current_ambassador_program();
  select * into v_link from public.customer_worker_links
  where customer_id = p_customer_id and ended_at is null and expires_at > pg_catalog.now();
  select profile.created_at into v_customer_created_at
  from public.profiles as profile where profile.id = p_customer_id;

  if v_program.id is not null and v_customer_created_at is not null then
    v_closes_at := v_customer_created_at + pg_catalog.make_interval(days => v_program.invite_claim_days);
  end if;

  v_claim_status := case
    when v_program.id is null or v_customer_created_at is null then 'program_unavailable'
    when v_link.id is not null then 'linked'
    when v_closes_at < pg_catalog.now() then 'window_closed'
    when exists (
      select 1 from public.jobs as job
      where job.customer_id = p_customer_id and job.paid_at is not null
    ) then 'transacted'
    else 'open'
  end;

  return pg_catalog.jsonb_build_object(
    'points', coalesce((select sum(points) from public.customer_membership_point_entries
      where customer_id = p_customer_id), 0),
    'customer_vnd_per_point', v_program.customer_vnd_per_point,
    'linked_worker', case when v_link.id is null then null else pg_catalog.jsonb_build_object(
      'worker_id', v_link.worker_id,
      'display_name', (select profile.full_name from public.profiles as profile where profile.id = v_link.worker_id),
      'source', v_link.source,
      'expires_at', v_link.expires_at
    ) end,
    'invite_claim', pg_catalog.jsonb_build_object(
      'status', v_claim_status,
      'closes_at', v_closes_at,
      'claim_days', v_program.invite_claim_days,
      'link_months', v_program.link_months
    ),
    'recent_entries', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'job_id', entry.job_id,
        'entry_kind', entry.entry_kind,
        'points', entry.points,
        'created_at', entry.created_at
      ) order by entry.created_at desc)
      from (
        select * from public.customer_membership_point_entries
        where customer_id = p_customer_id
        order by created_at desc
        limit 20
      ) as entry
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_customer_membership_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_customer_membership_summary(uuid) to service_role;

commit;
