begin;

alter table public.kael_admin_queue
  drop constraint if exists kael_admin_queue_queue_type_check;

alter table public.kael_admin_queue
  add constraint kael_admin_queue_queue_type_check
  check (queue_type in (
    'demanding_customer',
    'worker_cancellation_review',
    'worker_no_show',
    'customer_cancellation_review',
    'dispute_review',
    'autonomy_escalation',
    'disintermediation_risk',
    'worker_application_review'
  ));

comment on constraint kael_admin_queue_queue_type_check on public.kael_admin_queue is
  'Allows worker application review tickets while keeping worker role assignment behind admin/manual approval.';

commit;
