begin;

create table public.job_rfq_price_proposals (
  id uuid primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.profiles(id),
  customer_id uuid not null references public.profiles(id),
  quote_mode public.service_quote_mode not null check (quote_mode in ('rfq','inspection_only')),
  scope_summary text not null check (length(btrim(scope_summary)) between 10 and 2000),
  customer_total integer not null check (customer_total > 0),
  currency text not null default 'VND' check (currency='VND'),
  commission_level integer not null check (commission_level > 0),
  commission_rate_bps integer not null check (commission_rate_bps between 0 and 1500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  synthetic_cohort_id text,
  check ((status='pending') = (decided_at is null))
);
create unique index job_rfq_price_one_open_or_approved
  on public.job_rfq_price_proposals(job_id) where status in ('pending','approved');
create index job_rfq_price_job_history on public.job_rfq_price_proposals(job_id,created_at desc);
alter table public.job_rfq_price_proposals enable row level security;
revoke all on public.job_rfq_price_proposals from public,anon,authenticated,service_role;
grant select on public.job_rfq_price_proposals to service_role;

create function private.protect_rfq_price_proposal()
returns trigger language plpgsql set search_path='' as $fn$
begin
  if tg_op='DELETE' then
    -- Exact-cohort cleanup owns job deletion; no participant can delete quotes.
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception using errcode='42501',message='RFQ_PRICE_IMMUTABLE';
  end if;
  if (to_jsonb(new)-'status'-'decided_at') is distinct from
     (to_jsonb(old)-'status'-'decided_at')
     or old.status <> 'pending' or new.status not in ('approved','rejected')
     or new.decided_at is null then
    raise exception using errcode='42501',message='RFQ_PRICE_IMMUTABLE';
  end if;
  return new;
end;
$fn$;
create trigger job_rfq_price_immutable before update or delete on public.job_rfq_price_proposals
for each row execute function private.protect_rfq_price_proposal();

create function private.rfq_price_is_approved(p_job public.jobs)
returns boolean language sql stable security definer set search_path='' as $fn$
  select coalesce(p_job.quote_mode in ('rfq','inspection_only'),false) and exists(
    select 1 from public.job_rfq_price_proposals q
    where q.job_id=p_job.id and q.worker_id=p_job.worker_id and q.customer_id=p_job.customer_id
      and q.quote_mode=p_job.quote_mode and q.customer_total=p_job.final_price
      and q.synthetic_cohort_id is not distinct from p_job.synthetic_cohort_id
      and q.status='approved' and q.decided_at is not null
  );
$fn$;

create function public.propose_rfq_price_atomic(
  p_job_id uuid,p_worker_id uuid,p_request_id uuid,p_customer_total integer,p_scope_summary text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare j public.jobs%rowtype; q public.job_rfq_price_proposals%rowtype; tier record;
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.worker_id is distinct from p_worker_id or p_worker_id is null
    or not exists(select 1 from public.profiles where id=p_worker_id and role='worker') then
    raise exception using errcode='P0002',message='RFQ_PRICE_NOT_FOUND';
  end if;
  if p_request_id is null or p_customer_total is null or p_customer_total<=0
    or p_scope_summary is null or length(btrim(p_scope_summary)) not between 10 and 2000 then
    raise exception using errcode='22023',message='RFQ_PRICE_INVALID_INPUT';
  end if;
  select * into q from public.job_rfq_price_proposals where id=p_request_id;
  if found then
    if q.job_id is distinct from p_job_id or q.worker_id is distinct from p_worker_id
      or q.customer_id is distinct from j.customer_id or q.customer_total is distinct from p_customer_total
      or q.scope_summary is distinct from btrim(p_scope_summary)
      or q.quote_mode is distinct from j.quote_mode
      or q.synthetic_cohort_id is distinct from j.synthetic_cohort_id then
      raise exception using errcode='22023',message='RFQ_PRICE_REQUEST_CONFLICT';
    end if;
    return to_jsonb(q);
  end if;
  if (j.quote_mode in ('rfq','inspection_only')) is not true or j.status <> 'inspecting'
    or j.final_price is not null then
    raise exception using errcode='55000',message='RFQ_PRICE_STATE_CHANGED';
  end if;
  if exists(select 1 from public.job_rfq_price_proposals where job_id=j.id and status in ('pending','approved')) then
    raise exception using errcode='55000',message='RFQ_PRICE_PENDING';
  end if;
  select * into strict tier from private.resolve_worker_commission_tier(p_worker_id);
  insert into public.job_rfq_price_proposals(id,job_id,worker_id,customer_id,quote_mode,
    scope_summary,customer_total,commission_level,commission_rate_bps,synthetic_cohort_id)
  values(p_request_id,j.id,p_worker_id,j.customer_id,j.quote_mode,btrim(p_scope_summary),
    p_customer_total,tier.commission_level,tier.commission_rate_bps,j.synthetic_cohort_id)
  returning * into q;
  insert into public.job_events(job_id,event_type,actor_id,actor_role,from_status,to_status,safe_metadata)
  values(j.id,'rfq_price_proposed',p_worker_id,'worker',j.status,j.status,
    jsonb_build_object('proposal_id',q.id,'quote_mode',j.quote_mode));
  insert into public.notifications(user_id,job_id,event_type,title,body,safe_metadata)
  values(j.customer_id,j.id,'rfq_price_proposed','Báo giá sau khảo sát',
    'Thợ đã gửi báo giá. Vui lòng xem và xác nhận trước khi bắt đầu công việc.',
    jsonb_build_object('proposal_id',q.id));
  return to_jsonb(q);
end;
$fn$;

create function public.decide_rfq_price_atomic(
  p_job_id uuid,p_customer_id uuid,p_proposal_id uuid,p_approve boolean
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare j public.jobs%rowtype; q public.job_rfq_price_proposals%rowtype; outcome text;
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found or j.customer_id is distinct from p_customer_id or p_customer_id is null
    or not exists(select 1 from public.profiles where id=p_customer_id and role='customer') then
    raise exception using errcode='P0002',message='RFQ_PRICE_NOT_FOUND';
  end if;
  if p_approve is null then
    raise exception using errcode='22023',message='RFQ_PRICE_INVALID_INPUT';
  end if;
  select * into q from public.job_rfq_price_proposals
    where id=p_proposal_id and job_id=p_job_id and customer_id=p_customer_id for update;
  if not found or q.worker_id is distinct from j.worker_id
    or q.quote_mode is distinct from j.quote_mode
    or q.synthetic_cohort_id is distinct from j.synthetic_cohort_id then
    raise exception using errcode='P0002',message='RFQ_PRICE_NOT_FOUND';
  end if;
  outcome := case when p_approve then 'approved' else 'rejected' end;
  if q.status <> 'pending' then
    if q.status <> outcome then
      raise exception using errcode='22023',message='RFQ_PRICE_DECISION_CONFLICT';
    end if;
    return to_jsonb(q);
  end if;
  if (j.quote_mode in ('rfq','inspection_only')) is not true or j.quote_mode is distinct from q.quote_mode
    or j.status <> 'inspecting' or j.final_price is not null
    or j.synthetic_cohort_id is distinct from q.synthetic_cohort_id then
    raise exception using errcode='55000',message='RFQ_PRICE_STATE_CHANGED';
  end if;
  update public.job_rfq_price_proposals set status=outcome,decided_at=clock_timestamp()
    where id=q.id returning * into q;
  if p_approve then
    update public.jobs set final_price=q.customer_total,
      worker_commission_level=q.commission_level,worker_commission_rate_bps=q.commission_rate_bps
      where id=j.id;
  end if;
  insert into public.job_events(job_id,event_type,actor_id,actor_role,from_status,to_status,safe_metadata)
  values(j.id,'rfq_price_'||outcome,p_customer_id,'customer',j.status,j.status,
    jsonb_build_object('proposal_id',q.id,'quote_mode',j.quote_mode));
  insert into public.notifications(user_id,job_id,event_type,title,body,safe_metadata)
  values(j.worker_id,j.id,'rfq_price_'||outcome,'Phản hồi báo giá',
    case when p_approve then 'Khách đã xác nhận báo giá. Bạn có thể tiếp tục công việc.'
      else 'Khách chưa đồng ý báo giá. Hãy trao đổi lại trước khi bắt đầu công việc.' end,
    jsonb_build_object('proposal_id',q.id));
  return to_jsonb(q);
end;
$fn$;

revoke all on function public.propose_rfq_price_atomic(uuid,uuid,uuid,integer,text),
 public.decide_rfq_price_atomic(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.propose_rfq_price_atomic(uuid,uuid,uuid,integer,text),
 public.decide_rfq_price_atomic(uuid,uuid,uuid,boolean) to service_role;
revoke all on function private.protect_rfq_price_proposal(),private.rfq_price_is_approved(public.jobs)
 from public,anon,authenticated;
grant execute on function private.rfq_price_is_approved(public.jobs) to service_role;

create function private.guard_rfq_work_price()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
  if new.quote_mode in ('rfq','inspection_only') and new.status in ('repairing','completed_by_worker')
    and (tg_op='INSERT' or new.status is distinct from old.status)
    and (new.final_price is null or new.final_price<=0) then
    raise exception using errcode='23514',message='RFQ_PRICE_CONFIRMATION_REQUIRED';
  end if;
  return new;
end;
$fn$;
create trigger jobs_rfq_work_price before insert or update on public.jobs
for each row execute function private.guard_rfq_work_price();
revoke all on function private.guard_rfq_work_price() from public,anon,authenticated;

create or replace function public.guard_bilateral_final_price_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.final_price is null
    or (tg_op = 'UPDATE' and new.final_price is not distinct from old.final_price)
  then
    return new;
  end if;

  if private.rfq_price_is_approved(new) then return new; end if;

  if not exists (
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
  ) and not exists (
    select 1
    from public.scope_change_requests as scope
    where scope.job_id = new.id
      and scope.status = 'approved_by_customer'::public.scope_change_status
      and scope.kael_computed_min = new.final_price
      and scope.kael_computed_max = new.final_price
      and pg_catalog.jsonb_typeof(scope.kael_review) = 'object'
      and scope.kael_review ->> 'price_source' = 'verified_baseline'
      and scope.kael_review ->> 'pricing_mode' = 'full_scope_total'
      and scope.kael_review ->> 'selection_rule'
        = 'verified_neutral_midpoint_with_bilateral_confirmation'
      and scope.kael_review #>> '{worker_price_confirmation,confirmed}' = 'true'
      and nullif(pg_catalog.btrim(
        scope.kael_review #>> '{worker_price_confirmation,quote_id}'
      ), '') is not null
      and nullif(pg_catalog.btrim(
        scope.kael_review #>> '{worker_price_confirmation,confirmed_at}'
      ), '') is not null
      and scope.kael_review #>> '{stakeholder_balance,customer_confirmation_required}' = 'true'
      and scope.kael_review #>> '{stakeholder_balance,worker_confirmation_required}' = 'true'
      and (scope.kael_review #>> '{stakeholder_balance,customer_total}')::numeric
        = new.final_price
  ) then
    raise exception using
      errcode = '23514',
      message = 'final price requires bilateral verified approval';
  end if;

  return new;
end;
$$;

create or replace function private.guard_synthetic_job_release_boundary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_verified_original_scope_price boolean := new.final_price is null;
  v_terminal_authorized boolean :=
    pg_catalog.current_setting('app.synthetic_terminal_cohort', true) = new.synthetic_cohort_id
    and pg_catalog.current_setting('app.synthetic_terminal_job_id', true) = new.id::text;
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

  v_verified_original_scope_price := v_verified_original_scope_price or private.rfq_price_is_approved(new);

  if not v_verified_original_scope_price
    or new.gross_amount is not null
    or new.platform_fee is not null
    or new.worker_net is not null
    or new.payment_code is not null
    or new.payment_transfer_content is not null
    or new.payment_qr_image_url is not null
    or new.payment_expires_at is not null
    or new.sepay_transaction_id is not null
    or new.sepay_reference_code is not null
    or new.payment_failure_reason is not null
  then
    raise exception using
      errcode = '42501',
      message = 'SYNTHETIC_RELEASE_BOUNDARY_EXCEEDED';
  end if;

  if v_terminal_authorized then
    if new.status = 'confirmed_by_customer'::public.job_status then
      if new.payment_status <> 'not_started' or new.payment_provider is not null
        or new.confirmed_at is null or new.paid_at is not null
        or new.payment_received_at is not null or new.payment_amount_received is not null
      then
        raise exception using errcode = '42501', message = 'SYNTHETIC_TERMINAL_STATE_INVALID';
      end if;
    elsif new.status = 'payment_pending'::public.job_status then
      if new.payment_status <> 'pending' or new.payment_provider <> 'staging_simulator'
        or new.confirmed_at is null or new.paid_at is not null
        or new.payment_received_at is not null or new.payment_amount_received is not null
      then
        raise exception using errcode = '42501', message = 'SYNTHETIC_TERMINAL_STATE_INVALID';
      end if;
    elsif new.status in ('paid'::public.job_status, 'reviewed'::public.job_status) then
      if new.payment_status <> 'received' or new.payment_provider <> 'staging_simulator'
        or new.confirmed_at is null or new.paid_at is null
        or new.payment_received_at is null
        or new.payment_amount_received is distinct from new.final_price
        or (new.status = 'reviewed'::public.job_status and new.reviewed_at is null)
      then
        raise exception using errcode = '42501', message = 'SYNTHETIC_TERMINAL_STATE_INVALID';
      end if;
    else
      raise exception using errcode = '42501', message = 'SYNTHETIC_TERMINAL_STATE_INVALID';
    end if;
    return new;
  end if;

  if new.status not in (
    'draft'::public.job_status,
    'analyzing'::public.job_status,
    'estimate_ready'::public.job_status,
    'awaiting_customer_confirm'::public.job_status,
    'broadcasting'::public.job_status,
    'worker_candidate_pending'::public.job_status,
    'worker_matched'::public.job_status,
    'worker_on_way'::public.job_status,
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status,
    'scope_change_pending'::public.job_status,
    'completed_by_worker'::public.job_status,
    'cancelled'::public.job_status
  ) or new.payment_status <> 'not_started'
    or new.payment_provider is not null
    or new.confirmed_at is not null
    or new.paid_at is not null
    or new.reviewed_at is not null
    or new.payment_received_at is not null
    or new.payment_amount_received is not null
  then
    raise exception using
      errcode = '42501',
      message = 'SYNTHETIC_RELEASE_BOUNDARY_EXCEEDED';
  end if;

  return new;
end;
$function$;

commit;
