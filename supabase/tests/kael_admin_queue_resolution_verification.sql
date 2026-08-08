begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'f5300000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'kael-queue-admin@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
);
update public.profiles set role = 'admin'::public.user_role
where id = 'f5300000-0000-4000-8000-000000000001';

insert into public.kael_admin_queue (
  id, actor_id, actor_role, queue_type, priority, status, escalation_level,
  reason_code, response_summary, safe_metadata
) values (
  'f5400000-0000-4000-8000-000000000001',
  'f5300000-0000-4000-8000-000000000001', 'admin', 'demanding_customer',
  'high', 'open', 'hard', 'verification', 'Safe verification summary', '{}'
);

update public.kael_admin_queue
set status = 'resolved',
    resolved_by = 'f5300000-0000-4000-8000-000000000001',
    resolved_at = now(),
    resolution_note = 'Verified and resolved safely.'
where id = 'f5400000-0000-4000-8000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.kael_admin_queue
    where id = 'f5400000-0000-4000-8000-000000000001'
      and status = 'resolved'
      and resolved_by = 'f5300000-0000-4000-8000-000000000001'
      and resolved_at is not null
  ) then
    raise exception 'kael admin queue resolution metadata was not persisted';
  end if;
end;
$$;

rollback;
