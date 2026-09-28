begin;

-- When a customer's message in an active job goes unanswered, Kael reminds the worker and tells
-- the customer it has done so. This is a reminder only: nothing here proposes a violation case,
-- and the rows double as the measurement a later slow-response rule would be calibrated on.
-- Stages where the worker is driving or already in the apartment are skipped on purpose.

create table public.worker_reply_nudges (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  customer_message_id uuid not null unique references public.chat_messages(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  customer_message_at timestamptz not null,
  job_status text not null,
  nudged_at timestamptz not null default now()
);

create index worker_reply_nudges_worker_idx on public.worker_reply_nudges (worker_id, nudged_at desc);
create index worker_reply_nudges_job_idx on public.worker_reply_nudges (job_id, nudged_at desc);

alter table public.worker_reply_nudges enable row level security;
revoke all on table public.worker_reply_nudges from public, anon, authenticated;
grant select on table public.worker_reply_nudges to service_role;

-- Claims every due reminder in one transaction: the nudge row, the Kael line the customer sees
-- and the worker's inbox entry are written together, and the caller only sends the push.
create or replace function public.claim_worker_reply_nudges(p_limit integer)
returns table (nudge_id uuid, job_id uuid, worker_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_policy public.worker_discipline_policy%rowtype;
  v_due record;
  v_nudge_id uuid;
begin
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'INVALID_LIMIT' using errcode = '22023';
  end if;
  select * into v_policy from public.worker_discipline_policy where id = 1;

  for v_due in
    select job.id as job_id, job.worker_id, job.status::text as job_status, latest.id as message_id, latest.created_at
    from public.jobs as job
    cross join lateral (
      select message.id, message.created_at
      from public.chat_messages as message
      where message.job_id = job.id and message.sender_role = 'customer'
      order by message.created_at desc
      limit 1
    ) as latest
    where job.worker_id is not null
      and job.status in ('worker_matched', 'completed_by_worker', 'confirmed_by_customer', 'payment_pending')
      and latest.created_at <= pg_catalog.now() - pg_catalog.make_interval(mins => v_policy.reply_nudge_minutes)
      -- Messages older than this predate the reminder window; nudging them would only be noise.
      and latest.created_at > pg_catalog.now() - interval '2 hours'
      and not exists (
        select 1 from public.chat_messages as reply
        where reply.job_id = job.id and reply.sender_role = 'worker' and reply.created_at > latest.created_at
      )
      and not exists (
        select 1 from public.worker_reply_nudges as recent
        where recent.job_id = job.id and recent.nudged_at > pg_catalog.now() - interval '1 hour'
      )
    order by latest.created_at
    limit p_limit
    for update of job skip locked
  loop
    insert into public.worker_reply_nudges (job_id, customer_message_id, worker_id, customer_message_at, job_status)
    values (v_due.job_id, v_due.message_id, v_due.worker_id, v_due.created_at, v_due.job_status)
    on conflict (customer_message_id) do nothing
    returning id into v_nudge_id;
    continue when v_nudge_id is null;

    insert into public.chat_messages (job_id, sender_id, sender_role, content)
    values (v_due.job_id, null, 'kael', 'Kael đã nhắc thợ trả lời tin nhắn của bạn.');
    perform public.insert_notification_atomic(
      v_due.worker_id, v_due.job_id, 'worker_reply_nudge',
      'Khách đang chờ bạn trả lời',
      'Khách đã nhắn trong phòng việc. Trả lời sớm để khách yên tâm.',
      pg_catalog.jsonb_build_object('message_id', v_due.message_id)
    );

    nudge_id := v_nudge_id;
    job_id := v_due.job_id;
    worker_id := v_due.worker_id;
    return next;
  end loop;
end;
$function$;

revoke all on function public.claim_worker_reply_nudges(integer) from public, anon, authenticated;
grant execute on function public.claim_worker_reply_nudges(integer) to service_role;

commit;
