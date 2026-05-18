-- Scope-change reject path writes `rejected`; the original v1 check only
-- allowed approved/cancelled and would break decide_scope_change_atomic.

alter table public.jobs
  drop constraint if exists jobs_scope_change_customer_decision_check;

alter table public.jobs
  add constraint jobs_scope_change_customer_decision_check
  check (
    scope_change_customer_decision is null
    or scope_change_customer_decision in ('approved', 'rejected', 'cancelled')
  );
