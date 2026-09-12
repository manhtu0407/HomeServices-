-- Keep a complete, append-only preimage before reconciling duplicate tracking rows.
-- Rehearsal is the default; the ledger and audit writes roll back together.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';
lock table supabase_migrations.schema_migrations in exclusive mode;

do $reconcile$
declare
  v_run_id constant uuid := '6a50ce5a-f170-4a9d-8f8c-df5cd75c025b';
  v_release_id constant text := 'harness-468c7fdc0740-e08320fd4766';
  v_before constant text := '888c89e9cfd2fc1b92dbe8bbb6c72139911055e9c1f74fb600bed78b69dabb81';
  v_after constant text := '4949e00e6fbdb62f52684a3fcad8ed7287fb873b874f149592a8354040db84ab';
  v_snapshot_sha constant text := 'bd6637f74ded9201fd340155be798224fcf35e1aaee96285341e3b3dda505272';
  v_duplicates constant text[] := array[
    '20260822211500', '20260823182000', '20260823183000', '20260823184000',
    '20260823185000', '20260823190000', '20260823190100'
  ];
  v_aliases constant text[] := array[
    '20260822150502', '20260823040643', '20260823041352', '20260823043422',
    '20260823050437', '20260823063343', '20260823063416'
  ];
  v_history text;
  v_snapshot text;
  v_encoded text;
  v_recovered text;
  v_alias_preimage jsonb;
  v_alias_after jsonb;
  v_count integer;
  v_chunk integer;
  v_chunks integer;
begin
  if current_setting('session_replication_role') <> 'origin' or not exists (
    select 1 from public.harness_releases
    where release_id = v_release_id and environment = 'staging'
      and git_sha = '468c7fdc0740bbafa4ca07f7bb7a1c6e28dd1c1b'
      and release_artifact->>'sourceBundleSha256' =
        'e371e7518e29e3651526dd108efb544223e4acd0283e1b60bd16b4783c01fda7'
      and release_artifact->'environmentBinding'->>'providerConfigurationClass' = 'staging-isolated'
  ) then
    raise exception 'STAGING_HISTORY_TARGET_MISMATCH';
  end if;
  if exists (
    select 1 from pg_trigger where tgrelid = 'supabase_migrations.schema_migrations'::regclass
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger where tgrelid = 'public.harness_events'::regclass
      and tgname = 'harness_events_append_only' and tgenabled = 'O'
      and tgfoid = 'public.reject_harness_append_only_mutation()'::regprocedure
  ) then
    raise exception 'STAGING_HISTORY_AUDIT_GUARD_UNAVAILABLE';
  end if;
  if (select count(*) from pg_class where oid in (
    'public.harness_events'::regclass, 'public.harness_runs'::regclass
  ) and relrowsecurity) <> 2 or (
    select count(*) from pg_policies where schemaname = 'public'
      and tablename in ('harness_events', 'harness_runs')
  ) <> 2 or exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename in ('harness_events', 'harness_runs')
      and (roles <> array['authenticated']::name[] or cmd <> 'SELECT' or qual <> 'private.is_admin()')
  ) then
    raise exception 'STAGING_HISTORY_AUDIT_PRIVACY_MISMATCH';
  end if;

  select encode(sha256(convert_to(string_agg(version, E'\n' order by version), 'UTF8')), 'hex')
    into v_history from supabase_migrations.schema_migrations;
  if v_history = v_before then
    select jsonb_agg(to_jsonb(m) order by version)::text, count(*) into v_snapshot, v_count
      from supabase_migrations.schema_migrations m where version = any(v_duplicates);
    if v_count <> 7 or encode(sha256(convert_to(v_snapshot, 'UTF8')), 'hex') <> v_snapshot_sha
      or exists (
        select 1 from supabase_migrations.schema_migrations where version = any(v_duplicates)
          and (created_by is not null or idempotency_key is not null or rollback is not null)
      ) then
      raise exception 'STAGING_HISTORY_PREIMAGE_MISMATCH';
    end if;
    select jsonb_agg(to_jsonb(m) order by version), count(*) into v_alias_preimage, v_count
      from supabase_migrations.schema_migrations m where version = any(v_aliases);
    if v_count <> 7 then raise exception 'STAGING_HISTORY_ORIGINAL_ALIAS_MISSING'; end if;

    insert into public.harness_runs (
      run_id, trace_id, actor_role, route_kind, capability, environment, release_id, safe_metadata
    ) values (
      v_run_id, v_run_id, 'system', 'ops.staging_migration_history_reconciliation',
      'release.migration_history.reconcile', 'staging', v_release_id,
      jsonb_build_object('project_ref', 'xyylanuyflrjzbjzhqfl',
        'subject_release_only', true, 'history_before_sha256', v_before,
        'history_after_sha256', v_after, 'snapshot_sha256', v_snapshot_sha)
    );
    v_encoded := replace(encode(convert_to(v_snapshot, 'UTF8'), 'base64'), E'\n', '');
    v_chunks := (length(v_encoded) + 3999) / 4000;
    for v_chunk in 0..v_chunks - 1 loop
      insert into public.harness_events (
        run_id, trace_id, event_class, stage, status, release_id, environment, safe_metadata
      ) values (
        v_run_id, v_run_id, 'migration_history_snapshot', 'archive', 'observed',
        v_release_id, 'staging',
        jsonb_build_object('snapshot_sha256', v_snapshot_sha, 'encoding', 'base64-jsonb',
          'chunk_index', v_chunk, 'chunk_count', v_chunks,
          'payload', substr(v_encoded, 1 + v_chunk * 4000, 4000))
      );
    end loop;
  elsif v_history <> v_after or not exists (
    select 1 from public.harness_runs where run_id = v_run_id and status = 'completed'
      and route_kind = 'ops.staging_migration_history_reconciliation'
      and environment = 'staging' and release_id = v_release_id
      and safe_metadata->>'snapshot_sha256' = v_snapshot_sha
  ) then
    raise exception 'STAGING_HISTORY_LEDGER_CHANGED';
  end if;

  select convert_from(decode(string_agg(safe_metadata->>'payload', ''
    order by (safe_metadata->>'chunk_index')::integer), 'base64'), 'UTF8'), count(*)
    into v_recovered, v_count from public.harness_events
    where run_id = v_run_id and event_class = 'migration_history_snapshot'
      and safe_metadata->>'snapshot_sha256' = v_snapshot_sha;
  if v_recovered is null or encode(sha256(convert_to(v_recovered, 'UTF8')), 'hex') <> v_snapshot_sha
    or jsonb_array_length(v_recovered::jsonb) <> 7 or v_count <> 13 then
    raise exception 'STAGING_HISTORY_ARCHIVE_ROUNDTRIP_FAILED';
  end if;

  if v_history = v_before then
    delete from supabase_migrations.schema_migrations where version = any(v_duplicates);
    get diagnostics v_count = row_count;
    if v_count <> 7 then raise exception 'STAGING_HISTORY_RECONCILIATION_COUNT_MISMATCH'; end if;
    select jsonb_agg(to_jsonb(m) order by version) into v_alias_after
      from supabase_migrations.schema_migrations m where version = any(v_aliases);
    if v_alias_after is distinct from v_alias_preimage then
      raise exception 'STAGING_HISTORY_ORIGINAL_ALIAS_CHANGED';
    end if;
    select encode(sha256(convert_to(string_agg(version, E'\n' order by version), 'UTF8')), 'hex')
      into v_history from supabase_migrations.schema_migrations;
    if v_history <> v_after then raise exception 'STAGING_HISTORY_POSTIMAGE_MISMATCH'; end if;
    insert into public.harness_events (
      run_id, trace_id, event_class, stage, status, release_id, environment, safe_metadata
    ) values (
      v_run_id, v_run_id, 'migration_history_reconciliation', 'ledger', 'succeeded',
      v_release_id, 'staging', jsonb_build_object(
        'history_before_sha256', v_before, 'history_after_sha256', v_after,
        'snapshot_sha256', v_snapshot_sha, 'archived_tracking_versions', v_duplicates,
        'retained_original_versions', v_aliases, 'schema_replayed', false)
    );
    update public.harness_runs set status = 'completed', finished_at = clock_timestamp()
      where run_id = v_run_id;
  end if;
end;
$reconcile$;

select run_id, status, environment, safe_metadata,
  (select count(*) from public.harness_events e where e.run_id = r.run_id) as audit_events,
  (select count(*) from supabase_migrations.schema_migrations) as ledger_rows
from public.harness_runs r where run_id = '6a50ce5a-f170-4a9d-8f8c-df5cd75c025b';
rollback;
