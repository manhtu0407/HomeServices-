-- Drop the orphaned admin worker-cancellation decision RPC.
--
-- Worker cancellation became auto-approved through the autonomy-gated request flow, and the admin
-- decide endpoint (route, dispatch, DTO, service, error mapper) was removed from mobile-api. This
-- function was the last piece left behind: no Edge or mobile caller reaches it, yet it still holds
-- execute rights for service_role and its body writes public.worker_cancellation_requests,
-- public.job_broadcasts and public.jobs. A job-status write that bypasses the autonomy gate is a
-- surface we do not want standing with no caller, so it goes.
--
-- Created by 20260519090200_supabase_boxes_notifications_media_cancellation.sql and redefined by
-- 20260519120720_fix_worker_cancellation_race_and_media_stage_rls.sql. Those merged migrations stay
-- untouched; this one removes the function going forward.
--
-- request_worker_cancellation_atomic is the live path and is deliberately left in place.

drop function if exists public.decide_worker_cancellation_atomic(uuid, uuid, text, text);
