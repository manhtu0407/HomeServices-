begin;

-- Trigger functions execute through their owning trigger and must never remain
-- directly callable by API roles through PostgreSQL's default PUBLIC grant.
revoke all on function public.guard_synthetic_matching_identity()
  from public, anon, authenticated;

commit;
