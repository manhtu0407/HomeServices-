create or replace function private.can_delete_worker_verification_draft(
  p_object_name text,
  p_object_owner uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_storage_ref text;
begin
  if v_actor_id is null
     or p_object_name is null
     or p_object_owner is distinct from v_actor_id
     or pg_catalog.strpos(p_object_name, '..') > 0
     or pg_catalog.strpos(p_object_name, '//') > 0
     or pg_catalog.strpos(p_object_name, pg_catalog.chr(92)) > 0
     or p_object_name !~ (
       '^' || v_actor_id::text
       || '/(cccd-front|cccd-back|selfie)/'
       || '[A-Za-z0-9][A-Za-z0-9._-]{0,119}[.](jpg|jpeg|png|webp)$'
     ) then
    return false;
  end if;

  -- Registration takes FOR UPDATE on this same parent before checking Storage.
  -- Holding KEY SHARE makes either cleanup or submission finish first, so a
  -- submitted reference cannot race with deletion of its backing object.
  perform profile.id
  from public.profiles as profile
  where profile.id = v_actor_id
  for key share;

  if not found then
    return false;
  end if;

  v_storage_ref := 'supabase://worker-verification/' || p_object_name;
  if exists (
    select 1
    from public.worker_profiles as worker
    where worker.id = v_actor_id
      and (
        worker.cccd_front_url = v_storage_ref
        or worker.cccd_back_url = v_storage_ref
        or worker.selfie_url = v_storage_ref
      )
  ) then
    return false;
  end if;

  return true;
end;
$function$;

revoke execute on function private.can_delete_worker_verification_draft(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.can_delete_worker_verification_draft(text, uuid)
  to authenticated;

drop policy if exists "Users remove unsubmitted worker verification drafts"
  on storage.objects;
create policy "Users remove unsubmitted worker verification drafts"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'worker-verification'
    and owner is not distinct from (select auth.uid())
    and private.can_delete_worker_verification_draft(name, owner)
  );

comment on function private.can_delete_worker_verification_draft(text, uuid) is
  'RLS helper: serializes owner-only deletion of unsubmitted worker verification drafts against registration.';
