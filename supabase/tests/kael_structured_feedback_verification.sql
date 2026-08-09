begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('f5000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'kael-feedback-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f5000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'kael-feedback-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles set role = 'worker'::public.user_role
where id = 'f5000000-0000-4000-8000-000000000002';

insert into public.customer_kael_feedback (
  customer_id, source, language, message, message_scrubbed, response_id, rating, status, safe_metadata
) values (
  'f5000000-0000-4000-8000-000000000001', 'customer_chat', 'vi',
  'Phản hồi Kael được đánh dấu hữu ích.', 'Phản hồi Kael được đánh dấu hữu ích.',
  'response-customer-1', 'useful', 'new', '{"structured":true}'
)
on conflict (customer_id, response_id) do update set rating = excluded.rating;

insert into public.customer_kael_feedback (
  customer_id, source, language, message, message_scrubbed, response_id, rating, status, safe_metadata
) values (
  'f5000000-0000-4000-8000-000000000001', 'customer_chat', 'vi',
  'Phản hồi Kael được đánh dấu chưa hữu ích.', 'Phản hồi Kael được đánh dấu chưa hữu ích.',
  'response-customer-1', 'not_useful', 'new', '{"structured":true}'
)
on conflict (customer_id, response_id) do update set rating = excluded.rating;

insert into public.worker_kael_feedback (
  worker_id, source, language, raw_message, scrubbed_message, response_id, rating, status, safe_metadata
) values (
  'f5000000-0000-4000-8000-000000000002', 'worker_chat', 'en',
  'Kael response marked useful.', 'Kael response marked useful.',
  'response-worker-1', 'useful', 'new', '{"structured":true}'
)
on conflict (worker_id, response_id) do update set rating = excluded.rating;

do $$
begin
  if (select count(*) from public.customer_kael_feedback where customer_id = 'f5000000-0000-4000-8000-000000000001' and response_id = 'response-customer-1') <> 1 then
    raise exception 'customer structured feedback was not idempotent';
  end if;
  if (select rating from public.customer_kael_feedback where customer_id = 'f5000000-0000-4000-8000-000000000001' and response_id = 'response-customer-1') <> 'not_useful' then
    raise exception 'customer structured feedback did not overwrite the prior rating';
  end if;
  if (select count(*) from public.worker_kael_feedback where worker_id = 'f5000000-0000-4000-8000-000000000002' and response_id = 'response-worker-1') <> 1 then
    raise exception 'worker structured feedback was not stored';
  end if;
end;
$$;

rollback;
