-- §32.7 worker lobby check-in (manual_photo): dedicated `access_check_in` media stage.
--
-- Why a new stage: `after` is gated to repairing/completed_by_worker and its refs are merged
-- into jobs.completion_photo_urls (a lobby photo must never pollute completion evidence);
-- cancellation/scope stages carry the wrong meaning. Check-in photos need their own folder
-- and their own status window (worker_on_way/arrived).
--
-- Also fixes a pre-existing gap: `scope_change_evidence` was added to the storage policy
-- (20260524105341) and to the shared/Edge schemas, but the job_media_assets.stage CHECK
-- (created in 20260519090200) was never extended — so attaching scope-change photos violated
-- the CHECK and failed with DB_ERROR. Both values are added in one constraint rebuild.

begin;

alter table public.job_media_assets
  drop constraint if exists job_media_assets_stage_check;

alter table public.job_media_assets
  add constraint job_media_assets_stage_check check (stage in (
    'before',
    'after',
    'kael_reference',
    'cancellation_evidence',
    'scope_change_evidence',
    'access_check_in'
  ));

-- Storage upload policy: workers may upload into the access_check_in folder of their job.
drop policy if exists "Participants upload job media files" on storage.objects;
create policy "Participants upload job media files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-media'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (
        (
          (storage.foldername(name))[2] in ('before', 'kael_reference')
          and private.is_job_customer(((storage.foldername(name))[1])::uuid)
        )
        or (
          (storage.foldername(name))[2] in ('after', 'cancellation_evidence', 'scope_change_evidence', 'access_check_in')
          and private.is_job_worker(((storage.foldername(name))[1])::uuid)
        )
        or private.is_admin()
      )
      else false
    end
  );

comment on constraint job_media_assets_stage_check on public.job_media_assets is
  '§32.7: + access_check_in (worker lobby check-in photo) and scope_change_evidence (CHECK was missed when the stage shipped in PR #29).';

commit;
