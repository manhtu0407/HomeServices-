create index if not exists admin_operator_accounts_granted_by_idx
  on public.admin_operator_accounts (granted_by);

create index if not exists admin_operator_accounts_last_changed_by_idx
  on public.admin_operator_accounts (last_changed_by);

create index if not exists admin_worker_application_reviews_decided_by_idx
  on public.admin_worker_application_reviews (decided_by);
