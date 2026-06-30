-- =============================================================================
-- Production Supabase boxes: media, Kael artifacts, notifications, cancellation.
--
-- Public tables created here are RLS-enabled and intentionally granted only to
-- the roles that need them. Workflow writes remain service-role/Edge-owned.
-- =============================================================================

create table if not exists job_media_assets (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid references jobs on delete cascade not null,
  owner_id        uuid references profiles on delete cascade not null,
  service_type    service_type not null,
  stage           text not null check (stage in (
    'before',
    'after',
    'kael_reference',
    'cancellation_evidence'
  )),
  bucket_id       text not null check (bucket_id = 'job-media'),
  object_path     text not null,
  mime_type       text,
  file_size_bytes int check (file_size_bytes is null or file_size_bytes >= 0),
  safe_metadata   jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (bucket_id, object_path)
);

create index if not exists job_media_assets_job_stage_idx
  on job_media_assets (job_id, stage, created_at desc);
create index if not exists job_media_assets_owner_idx
  on job_media_assets (owner_id, created_at desc);
create index if not exists job_media_assets_service_idx
  on job_media_assets (service_type, stage, created_at desc);

create table if not exists kael_analysis_artifacts (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid references jobs on delete cascade,
  service_type       service_type not null,
  service_problem_id uuid references service_problems on delete set null,
  artifact_type      text not null check (artifact_type in (
    'intent',
    'vision',
    'baseline',
    'market_synthesis',
    'final_estimate',
    'worker_brief',
    'notification_decision',
    'cancellation_review'
  )),
  provider           api_provider,
  summary            text,
  confidence         numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  safe_payload       jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists kael_analysis_artifacts_job_idx
  on kael_analysis_artifacts (job_id, created_at desc);
create index if not exists kael_analysis_artifacts_box_idx
  on kael_analysis_artifacts (service_type, artifact_type, created_at desc);
create index if not exists kael_analysis_artifacts_problem_idx
  on kael_analysis_artifacts (service_problem_id, created_at desc);

create table if not exists device_push_tokens (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references profiles on delete cascade not null,
  platform          text not null check (platform in ('ios', 'android', 'web', 'unknown')),
  push_token        text not null,
  token_hash        text not null,
  token_last4       text not null,
  permission_status text not null check (permission_status in ('granted', 'denied', 'undetermined')),
  enabled           boolean not null default true,
  safe_metadata     jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  unique (user_id, token_hash)
);

create index if not exists device_push_tokens_user_enabled_idx
  on device_push_tokens (user_id, enabled, last_seen_at desc);

create trigger device_push_tokens_updated_at
  before update on device_push_tokens
  for each row execute function update_updated_at();

create table if not exists worker_cancellation_requests (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid references jobs on delete cascade not null,
  worker_id           uuid references profiles on delete cascade not null,
  status              text not null default 'reviewing_by_kael' check (status in (
    'requested',
    'reviewing_by_kael',
    'approved',
    'rejected',
    'cancelled'
  )),
  reason              text not null check (char_length(reason) between 10 and 1000),
  evidence_photo_urls text[] not null default '{}'::text[],
  kael_review         jsonb,
  admin_decision_by   uuid references profiles on delete set null,
  admin_decision_at   timestamptz,
  review_note         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists worker_cancellation_requests_status_idx
  on worker_cancellation_requests (status, created_at desc);
create index if not exists worker_cancellation_requests_job_idx
  on worker_cancellation_requests (job_id, created_at desc);
create index if not exists worker_cancellation_requests_worker_idx
  on worker_cancellation_requests (worker_id, created_at desc);

create trigger worker_cancellation_requests_updated_at
  before update on worker_cancellation_requests
  for each row execute function update_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('worker-verification', 'worker-verification', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('job-media', 'job-media', false, 26214400, array['image/jpeg','image/png','image/webp','video/mp4','audio/m4a','audio/mp4','audio/mpeg','audio/wav','audio/aac'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.job_media_assets enable row level security;
alter table public.kael_analysis_artifacts enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.worker_cancellation_requests enable row level security;

create policy "Participants read job media assets"
  on job_media_assets for select
  to authenticated
  using (private.is_job_participant(job_id) or private.is_admin());

create policy "Admins manage job media assets"
  on job_media_assets for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Admins read Kael analysis artifacts"
  on kael_analysis_artifacts for select
  to authenticated
  using (private.is_admin());

create policy "Admins manage Kael analysis artifacts"
  on kael_analysis_artifacts for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Admins read device push tokens"
  on device_push_tokens for select
  to authenticated
  using (private.is_admin());

create policy "Admins manage device push tokens"
  on device_push_tokens for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Participants read worker cancellation requests"
  on worker_cancellation_requests for select
  to authenticated
  using (private.is_job_participant(job_id) or private.is_admin());

create policy "Admins manage worker cancellation requests"
  on worker_cancellation_requests for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

revoke insert, update, delete on public.job_media_assets from authenticated;
revoke insert, update, delete on public.kael_analysis_artifacts from authenticated;
revoke insert, update, delete on public.device_push_tokens from authenticated;
revoke insert, update, delete on public.worker_cancellation_requests from authenticated;

grant select on public.job_media_assets to authenticated;
grant select on public.kael_analysis_artifacts to authenticated;
grant select on public.worker_cancellation_requests to authenticated;
grant all on public.job_media_assets to service_role;
grant all on public.kael_analysis_artifacts to service_role;
grant all on public.device_push_tokens to service_role;
grant all on public.worker_cancellation_requests to service_role;

drop policy if exists "Users upload worker verification files" on storage.objects;
create policy "Users upload worker verification files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'worker-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users view worker verification files" on storage.objects;
create policy "Users view worker verification files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'worker-verification'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.is_admin()
    )
  );

drop policy if exists "Participants upload job media files" on storage.objects;
create policy "Participants upload job media files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-media'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] in ('before', 'after', 'kael_reference', 'cancellation_evidence')
    and private.is_job_participant(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Participants view job media files" on storage.objects;
create policy "Participants view job media files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'job-media'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      private.is_job_participant(((storage.foldername(name))[1])::uuid)
      or private.is_admin()
    )
  );

create or replace function public.insert_notification_atomic(
  p_user_id uuid,
  p_job_id uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_safe_metadata jsonb default '{}'::jsonb
) returns table (
  notification_id uuid,
  created_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
begin
  insert into public.notifications (
    user_id,
    job_id,
    event_type,
    title,
    body,
    safe_metadata
  ) values (
    p_user_id,
    p_job_id,
    left(p_event_type, 120),
    left(p_title, 160),
    left(p_body, 500),
    coalesce(p_safe_metadata, '{}'::jsonb)
  )
  returning id, created_at into notification_id, created_at_ts;

  return next;
end;
$func$;

revoke execute on function public.insert_notification_atomic(uuid, uuid, text, text, text, jsonb) from public;
revoke execute on function public.insert_notification_atomic(uuid, uuid, text, text, text, jsonb) from anon;
revoke execute on function public.insert_notification_atomic(uuid, uuid, text, text, text, jsonb) from authenticated;
grant execute on function public.insert_notification_atomic(uuid, uuid, text, text, text, jsonb) to service_role;

create or replace function public.register_device_push_token_atomic(
  p_user_id uuid,
  p_platform text,
  p_push_token text,
  p_permission_status text,
  p_safe_metadata jsonb default '{}'::jsonb
) returns table (
  token_id uuid,
  enabled_out boolean,
  updated_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_hash text;
  v_last4 text;
  v_now timestamptz := now();
begin
  if p_platform not in ('ios', 'android', 'web', 'unknown') then
    return;
  end if;
  if p_permission_status not in ('granted', 'denied', 'undetermined') then
    return;
  end if;
  if p_push_token is null or char_length(p_push_token) < 8 then
    return;
  end if;

  v_hash := md5(p_push_token);
  v_last4 := right(p_push_token, 4);

  insert into public.device_push_tokens (
    user_id,
    platform,
    push_token,
    token_hash,
    token_last4,
    permission_status,
    enabled,
    safe_metadata,
    last_seen_at
  ) values (
    p_user_id,
    p_platform,
    p_push_token,
    v_hash,
    v_last4,
    p_permission_status,
    p_permission_status = 'granted',
    coalesce(p_safe_metadata, '{}'::jsonb),
    v_now
  )
  on conflict (user_id, token_hash) do update
  set
    platform = excluded.platform,
    push_token = excluded.push_token,
    token_last4 = excluded.token_last4,
    permission_status = excluded.permission_status,
    enabled = excluded.enabled,
    safe_metadata = excluded.safe_metadata,
    last_seen_at = excluded.last_seen_at,
    updated_at = v_now
  returning id, enabled, updated_at into token_id, enabled_out, updated_at_ts;

  return next;
end;
$func$;

revoke execute on function public.register_device_push_token_atomic(uuid, text, text, text, jsonb) from public;
revoke execute on function public.register_device_push_token_atomic(uuid, text, text, text, jsonb) from anon;
revoke execute on function public.register_device_push_token_atomic(uuid, text, text, text, jsonb) from authenticated;
grant execute on function public.register_device_push_token_atomic(uuid, text, text, text, jsonb) to service_role;

create or replace function public.request_worker_cancellation_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_reason text,
  p_evidence_photo_urls text[] default '{}'::text[]
) returns table (
  ok boolean,
  error_code text,
  cancellation_id uuid,
  cancellation_status text,
  job_id_out uuid,
  created_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_job record;
  v_existing record;
  v_id uuid;
  v_created timestamptz;
begin
  if p_reason is null or char_length(p_reason) < 10 or char_length(p_reason) > 1000 then
    return query select false, 'INVALID_REASON'::text, null::uuid, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  select id, status, worker_id
    into v_job
    from public.jobs
    where id = p_job_id
    for update;

  if not found or v_job.worker_id <> p_worker_id then
    return query select false, 'NOT_FOUND'::text, null::uuid, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  if v_job.status not in (
    'worker_matched'::public.job_status,
    'worker_on_way'::public.job_status,
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status,
    'scope_change_pending'::public.job_status
  ) then
    return query select false, 'INVALID_STATUS'::text, null::uuid, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  select id, status into v_existing
    from public.worker_cancellation_requests
    where job_id = p_job_id
      and worker_id = p_worker_id
      and status in ('requested', 'reviewing_by_kael')
    order by created_at desc
    limit 1
    for update;

  if found then
    return query select false, 'ALREADY_REQUESTED'::text, v_existing.id, v_existing.status, p_job_id, null::timestamptz;
    return;
  end if;

  insert into public.worker_cancellation_requests (
    job_id,
    worker_id,
    status,
    reason,
    evidence_photo_urls
  ) values (
    p_job_id,
    p_worker_id,
    'reviewing_by_kael',
    p_reason,
    coalesce(p_evidence_photo_urls, '{}'::text[])
  )
  returning id, created_at into v_id, v_created;

  return query select true, null::text, v_id, 'reviewing_by_kael'::text, p_job_id, v_created;
end;
$func$;

revoke execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) from public;
revoke execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) from anon;
revoke execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) from authenticated;
grant execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) to service_role;

create or replace function public.decide_worker_cancellation_atomic(
  p_cancellation_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_review_note text default null
) returns table (
  ok boolean,
  error_code text,
  cancellation_status text,
  job_id_out uuid,
  job_status public.job_status,
  service_type_out public.service_type,
  district_code text,
  worker_id_out uuid,
  decided_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_request record;
  v_job record;
  v_now timestamptz := now();
  v_is_admin boolean;
begin
  if p_decision not in ('approve', 'reject') then
    return query select false, 'INVALID_DECISION'::text, null::text, null::uuid, null::public.job_status, null::public.service_type, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  select exists (
    select 1
      from public.profiles
      where id = p_admin_id
        and role = 'admin'::public.user_role
  ) into v_is_admin;
  if v_is_admin is not true then
    return query select false, 'AUTH_FORBIDDEN'::text, null::text, null::uuid, null::public.job_status, null::public.service_type, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  select id, job_id, worker_id, status
    into v_request
    from public.worker_cancellation_requests
    where id = p_cancellation_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text, null::text, null::uuid, null::public.job_status, null::public.service_type, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  if v_request.status not in ('requested', 'reviewing_by_kael') then
    return query select false, 'ALREADY_DECIDED'::text, v_request.status, v_request.job_id, null::public.job_status, null::public.service_type, null::text, v_request.worker_id, null::timestamptz;
    return;
  end if;

  select id, status, worker_id, service_type, address_district
    into v_job
    from public.jobs
    where id = v_request.job_id
    for update;

  if not found or v_job.worker_id <> v_request.worker_id then
    return query select false, 'JOB_CHANGED'::text, null::text, v_request.job_id, null::public.job_status, null::public.service_type, null::text, v_request.worker_id, null::timestamptz;
    return;
  end if;

  if p_decision = 'reject' then
    update public.worker_cancellation_requests
      set status = 'rejected',
          admin_decision_by = p_admin_id,
          admin_decision_at = v_now,
          review_note = p_review_note
      where id = p_cancellation_id;

    return query select true, null::text, 'rejected'::text, v_job.id, v_job.status, v_job.service_type, v_job.address_district, v_request.worker_id, v_now;
    return;
  end if;

  update public.worker_cancellation_requests
    set status = 'approved',
        admin_decision_by = p_admin_id,
        admin_decision_at = v_now,
        review_note = p_review_note
    where id = p_cancellation_id;

  update public.job_broadcasts
    set status = 'reassigned'::public.broadcast_status,
        responded_at = v_now
    where job_id = v_job.id
      and status in ('pending'::public.broadcast_status, 'sent'::public.broadcast_status, 'accepted'::public.broadcast_status);

  update public.jobs
    set worker_id = null,
        status = 'broadcasting'::public.job_status,
        broadcast_at = v_now,
        matched_at = null
    where id = v_job.id;

  return query select true, null::text, 'approved'::text, v_job.id, 'broadcasting'::public.job_status, v_job.service_type, v_job.address_district, v_request.worker_id, v_now;
end;
$func$;

revoke execute on function public.decide_worker_cancellation_atomic(uuid, uuid, text, text) from public;
revoke execute on function public.decide_worker_cancellation_atomic(uuid, uuid, text, text) from anon;
revoke execute on function public.decide_worker_cancellation_atomic(uuid, uuid, text, text) from authenticated;
grant execute on function public.decide_worker_cancellation_atomic(uuid, uuid, text, text) to service_role;
