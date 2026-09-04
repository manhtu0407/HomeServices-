begin;

create or replace function private.guard_synthetic_job_release_boundary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_verified_original_scope_price boolean := new.final_price is null;
begin
  if new.synthetic_cohort_id is null then
    return new;
  end if;

  if new.final_price is not null then
    select exists (
      select 1
      from public.job_worker_candidates as candidate
      where candidate.job_id = new.id
        and candidate.worker_id = new.worker_id
        and candidate.status = 'customer_confirmed'
        and candidate.customer_decided_at is not null
        and candidate.customer_decided_at <= candidate.expires_at
        and private.is_valid_original_scope_price_quote(
          candidate.original_scope_price_quote,
          candidate.job_id,
          candidate.worker_id,
          candidate.broadcast_id,
          candidate.expires_at,
          true
        )
        and (candidate.original_scope_price_quote ->> 'customer_total')::integer
          = new.final_price
    ) into v_verified_original_scope_price;
  end if;

  if new.status not in (
    'draft'::public.job_status,
    'analyzing'::public.job_status,
    'estimate_ready'::public.job_status,
    'awaiting_customer_confirm'::public.job_status,
    'broadcasting'::public.job_status,
    'worker_candidate_pending'::public.job_status,
    'worker_matched'::public.job_status,
    'cancelled'::public.job_status
  ) or new.payment_status <> 'not_started'
    or new.payment_provider is not null
    or not v_verified_original_scope_price
    or new.gross_amount is not null
    or new.platform_fee is not null
    or new.worker_net is not null
    or new.completed_at is not null
    or new.confirmed_at is not null
    or new.paid_at is not null
  then
    raise exception using
      errcode = '42501',
      message = 'SYNTHETIC_RELEASE_BOUNDARY_EXCEEDED';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_synthetic_job_release_boundary()
from public, anon, authenticated;
grant execute on function private.guard_synthetic_job_release_boundary()
to service_role;

comment on function private.guard_synthetic_job_release_boundary() is
  'Lets a synthetic smoke reach official match with only a canonically verified bilateral original-scope price; money, completion, and post-match states remain blocked.';

commit;
