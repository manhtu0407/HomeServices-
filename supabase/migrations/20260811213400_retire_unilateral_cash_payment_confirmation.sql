-- Legacy worker-only confirmation must fail closed after the two-party direct receipt is introduced.
revoke execute on function public.confirm_worker_cash_payment(uuid, uuid)
  from public, anon, authenticated, service_role;
