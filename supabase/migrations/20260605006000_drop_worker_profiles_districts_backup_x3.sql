-- Claude review follow-up: the X3 worker district backup table was a temporary
-- migration safety snapshot. It has no runtime owner and can retain stale
-- worker district data, so remove it after production verification.

drop table if exists public.worker_profiles_districts_backup_x3;
