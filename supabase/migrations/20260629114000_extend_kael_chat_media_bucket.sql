begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kael-chat-media',
  'kael-chat-media',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'audio/m4a',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/aac',
    'audio/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own kael chat media" on storage.objects;
create policy "Users upload own kael chat media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kael-chat-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users read own kael chat media" on storage.objects;
create policy "Users read own kael chat media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kael-chat-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

commit;
