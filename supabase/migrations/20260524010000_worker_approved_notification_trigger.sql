-- Phase 2.4 (plan §22.7.G, 2026-05-23): notify worker khi admin chuyển
-- worker_profiles.verification_status từ 'submitted' / 'under_review' /
-- 'rejected' / 'suspended' / 'draft' sang 'approved'. Worker mobile sẽ deep-link
-- vào /(worker)/home để bật availability.
--
-- Idempotent: chỉ emit khi trạng thái mới THỰC SỰ là approved và trạng thái cũ
-- khác approved. Không nhắc lại khi update các field khác hoặc khi worker bị
-- approved → suspended → approved (trigger fires lại lần đó vì old != approved).
--
-- Notification row uses public.insert_notification_atomic, mirror với các call
-- site Edge khác (Phase 2.3 customer notifications).

begin;

create or replace function public.notify_worker_account_approved()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_old worker_verification_status;
  v_new worker_verification_status;
  v_recent_job_id uuid;
begin
  v_old := old.verification_status;
  v_new := new.verification_status;

  if v_new is distinct from 'approved'::worker_verification_status then
    return new;
  end if;

  if v_old is not distinct from v_new then
    return new;
  end if;

  -- Most recent job for deep-link context (optional). Workers thường chưa có
  -- job nào lúc approve — lookup nullable.
  select id into v_recent_job_id
  from public.jobs
  where worker_id = new.id
  order by created_at desc
  limit 1;

  insert into public.notifications (
    user_id,
    job_id,
    event_type,
    title,
    body,
    safe_metadata
  ) values (
    new.id,
    v_recent_job_id,
    'account_approved',
    'Tài khoản thợ đã duyệt',
    'Hồ sơ của bạn đã được duyệt. Bật trạng thái sẵn sàng để nhận việc.',
    jsonb_build_object('verification_status', v_new::text)
  );

  return new;
end;
$func$;

drop trigger if exists worker_account_approved_notify on public.worker_profiles;
create trigger worker_account_approved_notify
  after update of verification_status on public.worker_profiles
  for each row execute function public.notify_worker_account_approved();

revoke execute on function public.notify_worker_account_approved() from public;
revoke execute on function public.notify_worker_account_approved() from anon;
revoke execute on function public.notify_worker_account_approved() from authenticated;
grant execute on function public.notify_worker_account_approved() to service_role;

comment on function public.notify_worker_account_approved() is
  'Phase 2.4 (2026-05-23): emits account_approved notification when worker verification_status transitions to approved.';

commit;
