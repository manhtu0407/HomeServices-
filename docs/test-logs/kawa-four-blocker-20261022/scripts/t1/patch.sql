alter table auth.users
  add column if not exists phone text,
  add column if not exists email_confirmed_at timestamptz,
  add column if not exists phone_confirmed_at timestamptz,
  add column if not exists is_sso_user boolean not null default false,
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists banned_until timestamptz,
  add column if not exists last_sign_in_at timestamptz,
  add column if not exists email_change_confirm_status smallint default 0,
  add column if not exists reauthentication_token text default '',
  add column if not exists phone_change text default '',
  add column if not exists phone_change_token text default '',
  add column if not exists phone_change_sent_at timestamptz,
  add column if not exists confirmation_token text default '',
  add column if not exists email_change_token_new text default '',
  add column if not exists email_change_token_current text default '',
  add column if not exists reauthentication_sent_at timestamptz,
  add column if not exists raw_user_meta_data jsonb;
create unique index if not exists users_phone_key on auth.users (phone);
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
create table if not exists storage.buckets (
  id text primary key, name text not null, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  public boolean default false, avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], owner_id text);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz default now(),
  metadata jsonb, path_tokens text[] generated always as (string_to_array(name, '/')) stored, version text, owner_id text, user_metadata jsonb);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language plpgsql as $$
declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts, 1) - 1]; end $$;
create or replace function storage.filename(name text) returns text language plpgsql as $$
declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[array_length(_parts, 1)]; end $$;
create or replace function storage.extension(name text) returns text language plpgsql as $$
declare _parts text[]; _filename text; begin select string_to_array(name, '/') into _parts; select _parts[array_length(_parts, 1)] into _filename; return reverse(split_part(reverse(_filename), '.', 1)); end $$;
alter table storage.buckets owner to postgres;
alter table storage.objects owner to postgres;
grant select, insert, update, delete on storage.objects, storage.buckets to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role, postgres;
