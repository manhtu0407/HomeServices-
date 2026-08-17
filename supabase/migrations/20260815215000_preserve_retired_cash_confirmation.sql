begin;

-- The bilateral commission refresh must not reopen the retired worker-only settlement path.
revoke all on function public.confirm_worker_cash_payment(uuid, uuid)
  from public, anon, authenticated, service_role;

commit;
