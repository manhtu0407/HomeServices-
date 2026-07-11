-- Kael multimodal privacy boundary.
--
-- Raw voice is transcribed and reviewed on-device. Edge already rejects audio
-- MIME types; this bucket restriction closes the lower-level Storage path so an
-- authenticated client cannot bypass that API boundary and upload raw audio.

begin;

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm'
]
where id = 'kael-chat-media';

drop policy if exists "Users remove own kael chat media" on storage.objects;
create policy "Users remove own kael chat media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'kael-chat-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

commit;
