-- Scope-change evidence is private, attached job media. Arbitrary remote URLs
-- must never be stored or rendered on a customer device.

begin;

create or replace function public.validate_scope_change_evidence_refs(
  p_job_id uuid,
  p_worker_id uuid,
  p_media_refs text[]
)
returns table (
  ok boolean,
  reason text,
  validated_refs text[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_assigned_worker_id uuid;
  v_expected integer;
  v_valid integer;
  v_refs text[];
begin
  select customer_id, worker_id
    into v_customer_id, v_assigned_worker_id
  from public.jobs
  where id = p_job_id;

  if v_customer_id is null or v_assigned_worker_id is distinct from p_worker_id then
    return query select false, 'JOB_ACCESS_DENIED', array[]::text[];
    return;
  end if;

  select count(distinct btrim(value))::integer
    into v_expected
  from unnest(coalesce(p_media_refs, array[]::text[])) as refs(value)
  where value is not null and btrim(value) <> '';

  if v_expected = 0 then
    return query select true, null::text, array[]::text[];
    return;
  end if;
  if v_expected > 5 then
    return query select false, 'TOO_MANY_MEDIA', array[]::text[];
    return;
  end if;

  select count(*)::integer,
         array_agg('supabase://job-media/' || asset.object_path order by asset.object_path)
    into v_valid, v_refs
  from public.job_media_assets as asset
  join storage.objects as object
    on object.bucket_id = 'job-media'
    and object.name = asset.object_path
  where asset.job_id = p_job_id
    and asset.bucket_id = 'job-media'
    and ('supabase://job-media/' || asset.object_path) = any(p_media_refs)
    and asset.stage in ('before', 'kael_reference', 'scope_change_evidence')
    and (
      (asset.stage = 'scope_change_evidence' and asset.owner_id = p_worker_id)
      or (asset.stage = 'before' and asset.owner_id = v_customer_id)
      or (
        asset.stage = 'kael_reference'
        and asset.owner_id in (v_customer_id, p_worker_id)
      )
    )
    and lower(coalesce(asset.mime_type, '')) like 'image/%'
    and lower(coalesce(object.metadata ->> 'mimetype', '')) like 'image/%';

  if v_valid <> v_expected then
    return query select false, 'INVALID_SCOPE_MEDIA_REF', array[]::text[];
    return;
  end if;

  return query select true, null::text, coalesce(v_refs, array[]::text[]);
end;
$$;

revoke all on function public.validate_scope_change_evidence_refs(
  uuid, uuid, text[]
) from public, anon, authenticated;
grant execute on function public.validate_scope_change_evidence_refs(
  uuid, uuid, text[]
) to service_role;

commit;
