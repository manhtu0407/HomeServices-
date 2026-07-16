-- Align the direct Storage boundary with the Edge job-media contract: an
-- assigned worker may upload a private Kael reference, while customer-only
-- before photos and all image/audio guards remain unchanged.

begin;

drop policy if exists "Participants upload job media files" on storage.objects;
create policy "Participants upload job media files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-media'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (
        (
          (storage.foldername(name))[2] = 'before'
          and private.is_job_customer(((storage.foldername(name))[1])::uuid)
        )
        or (
          (storage.foldername(name))[2] = 'kael_reference'
          and (
            private.is_job_customer(((storage.foldername(name))[1])::uuid)
            or private.is_job_worker(((storage.foldername(name))[1])::uuid)
          )
        )
        or (
          (storage.foldername(name))[2] in ('after', 'cancellation_evidence', 'scope_change_evidence', 'access_check_in')
          and private.is_job_worker(((storage.foldername(name))[1])::uuid)
        )
        or private.is_admin()
      )
      else false
    end
    and case
      when (storage.foldername(name))[2] in ('before', 'kael_reference') then (
        (
          lower(coalesce(metadata ->> 'mimetype', '')) in ('image/jpeg', 'image/png', 'image/webp')
          and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
        )
        or (
          lower(coalesce(metadata ->> 'mimetype', '')) = 'video/mp4'
          and lower(storage.extension(name)) = 'mp4'
          and (
            (storage.foldername(name))[2] = 'before'
            or private.is_job_customer(((storage.foldername(name))[1])::uuid)
          )
        )
      )
      when (storage.foldername(name))[2] in (
        'after', 'cancellation_evidence', 'scope_change_evidence', 'access_check_in'
      ) then
        lower(coalesce(metadata ->> 'mimetype', '')) in ('image/jpeg', 'image/png', 'image/webp')
        and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
      else false
    end
  );

commit;
