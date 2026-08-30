begin;

-- Production recorded this historical version after its worker-deletion
-- dependency existed. The canonical, replay-safe implementation remains in
-- 20260822211500_account_deletion_job_media_cleanup.sql, after that dependency.
-- Keep this no-op ledger entry so fresh databases and Production share the
-- same migration history without applying the cleanup routines twice.

commit;
