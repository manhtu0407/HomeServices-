begin;

do $$
declare
  v_token constant text := 'ExponentPushToken[codex-shared-device-verification]';
  v_customer_a constant uuid := '94000000-0000-4000-8000-000000000001';
  v_customer_b constant uuid := '94000000-0000-4000-8000-000000000002';
  v_enabled_owner uuid;
  v_enabled_count integer;
  v_result_count integer;
  v_old_owner_token text;
  v_unregistered boolean;
  v_unique_index_blocked boolean := false;
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values
    (
      v_customer_a,
      'authenticated',
      'authenticated',
      'codex-push-owner-a@example.test',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_customer_b,
      'authenticated',
      'authenticated',
      'codex-push-owner-b@example.test',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    );

  update public.profiles
  set role = 'customer'
  where id in (v_customer_a, v_customer_b);

  select count(*)::integer
  into v_result_count
  from public.register_device_push_token_atomic(
    v_customer_a,
    'ios',
    'ExponentPushToken[invalid-array-metadata]',
    'granted',
    '[]'::jsonb
  );

  if v_result_count <> 0 then
    raise exception 'non-object push metadata crossed the database boundary';
  end if;

  select count(*)::integer
  into v_result_count
  from public.register_device_push_token_atomic(
    v_customer_a,
    'ios',
    'ExponentPushToken[oversized-object-metadata]',
    'granted',
    pg_catalog.jsonb_build_object('value', pg_catalog.repeat('x', 4097))
  );

  if v_result_count <> 0 then
    raise exception 'oversized push metadata crossed the database boundary';
  end if;

  select count(*)::integer
  into v_result_count
  from public.register_device_push_token_atomic(
    v_customer_a,
    'ios',
    'ExponentPushToken[unknown-object-metadata]',
    'granted',
    '{"phone":"0901234567"}'::jsonb
  );

  if v_result_count <> 0 then
    raise exception 'unknown push metadata key crossed the database boundary';
  end if;

  perform public.register_device_push_token_atomic(
    v_customer_a,
    'ios',
    v_token,
    'granted',
    '{}'::jsonb
  );
  perform public.register_device_push_token_atomic(
    v_customer_b,
    'ios',
    v_token,
    'granted',
    '{}'::jsonb
  );

  select count(*)
    into v_enabled_count
  from public.device_push_tokens
  where enabled is true
    and token_hash = pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  select user_id
    into v_enabled_owner
  from public.device_push_tokens
  where enabled is true
    and token_hash = pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex')
  limit 1;

  if v_enabled_count <> 1 or v_enabled_owner <> v_customer_b then
    raise exception 'shared token transfer expected only owner B enabled';
  end if;

  select push_token
    into v_old_owner_token
  from public.device_push_tokens
  where user_id = v_customer_a
    and token_hash = pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  if v_old_owner_token <> '' then
    raise exception 'transferred token plaintext remained on the disabled owner row';
  end if;

  select unregistered_out
    into v_unregistered
  from public.unregister_device_push_token_atomic(v_customer_a, v_token);

  if v_unregistered is true then
    raise exception 'old owner unregistered the new owner token';
  end if;

  select count(*)
    into v_enabled_count
  from public.device_push_tokens
  where user_id = v_customer_b
    and enabled is true;

  if v_enabled_count <> 1 then
    raise exception 'old-owner unregister disabled the current owner';
  end if;

  select unregistered_out
    into v_unregistered
  from public.unregister_device_push_token_atomic(v_customer_b, v_token);

  if v_unregistered is not true then
    raise exception 'current owner unregister did not disable its token';
  end if;

  select unregistered_out
    into v_unregistered
  from public.unregister_device_push_token_atomic(v_customer_b, v_token);

  if v_unregistered is true then
    raise exception 'repeated unregister was not idempotent';
  end if;

  perform public.register_device_push_token_atomic(
    v_customer_a,
    'ios',
    v_token,
    'granted',
    '{}'::jsonb
  );

  begin
    update public.device_push_tokens
    set enabled = true, push_token = v_token
    where user_id = v_customer_b
      and token_hash = pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');
  exception
    when unique_violation then
      v_unique_index_blocked := true;
  end;

  if v_unique_index_blocked is not true then
    raise exception 'partial unique index allowed two enabled owners';
  end if;
end $$;

rollback;
