begin;

-- Appeal evidence is private and has no RLS policy for any signed-in role: the Edge function
-- hands out short-lived signed upload URLs under appeals/<worker>/<case>/ and signed read URLs
-- to admins who decide the appeal. submit_violation_appeal re-checks every path's prefix.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'discipline-evidence', 'discipline-evidence', false, 26214400,
  array['image/jpeg', 'image/png', 'video/mp4', 'audio/m4a', 'audio/mp4', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
