begin;

alter table public.job_worker_candidates
  add column if not exists customer_decision_kind text
  check (customer_decision_kind in ('confirm','reject'));

create or replace function private.candidate_has_customer_decision(p_candidate_id uuid,p_decision text)
returns boolean language sql stable security definer set search_path='' as $func$
  select exists(
    select 1 from public.job_worker_candidates candidate
    join public.jobs job on job.id=candidate.job_id
    join public.job_events event on event.job_id=job.id
    where candidate.id=p_candidate_id and candidate.customer_decided_at is not null
      and event.safe_metadata->>'candidate_id'=candidate.id::text
      and event.safe_metadata->>'worker_id'=candidate.worker_id::text
      and (
        (p_decision='confirm' and candidate.status='customer_confirmed'
          and event.event_type='customer_confirmed_worker' and event.actor_id=job.customer_id
          and event.actor_role='customer')
        or (p_decision='reject' and candidate.status='customer_declined'
          and event.event_type='customer_rejected_worker'
          and event.safe_metadata->>'customer_id'=job.customer_id::text)
      )
  );
$func$;

create or replace function private.guard_worker_candidate_decision()
returns trigger language plpgsql security definer set search_path='' as $func$
begin
  if row(new.id,new.job_id,new.worker_id,new.broadcast_id)
    is distinct from row(old.id,old.job_id,old.worker_id,old.broadcast_id) then
    raise exception using errcode='23514',message='CANDIDATE_IDENTITY_IMMUTABLE';
  end if;
  if (old.status<>'proposed' and row(new.status,new.customer_decided_at)
      is distinct from row(old.status,old.customer_decided_at))
    or (old.customer_decision_kind is not null
      and new.customer_decision_kind is distinct from old.customer_decision_kind) then
    raise exception using errcode='23514',message='CANDIDATE_DECISION_IMMUTABLE';
  end if;
  if new.customer_decision_kind is not null
    and new.customer_decision_kind is distinct from old.customer_decision_kind
    and not private.candidate_has_customer_decision(old.id,new.customer_decision_kind) then
    raise exception using errcode='23514',message='CANDIDATE_DECISION_AUDIT_REQUIRED';
  end if;
  return new;
end;
$func$;

create or replace function private.record_worker_candidate_decision()
returns trigger language plpgsql security definer set search_path='' as $func$
declare v_decision text;
begin
  if new.event_type not in ('customer_confirmed_worker','customer_rejected_worker') then return new; end if;
  v_decision:=case when new.event_type='customer_confirmed_worker' then 'confirm' else 'reject' end;
  update public.job_worker_candidates candidate set customer_decision_kind=v_decision
    where candidate.job_id=new.job_id and candidate.id::text=new.safe_metadata->>'candidate_id'
      and candidate.worker_id::text=new.safe_metadata->>'worker_id'
      and private.candidate_has_customer_decision(candidate.id,v_decision);
  if not found then raise exception using errcode='23514',message='CANDIDATE_DECISION_AUDIT_REQUIRED'; end if;
  return new;
end;
$func$;

create or replace function private.guard_worker_proposal_terms()
returns trigger language plpgsql set search_path='' as $func$
begin
  if row(new.id,new.job_id,new.worker_id,new.broadcast_id,new.candidate_id,new.scope_summary,new.price_min,new.price_max)
    is distinct from row(old.id,old.job_id,old.worker_id,old.broadcast_id,old.candidate_id,old.scope_summary,old.price_min,old.price_max) then
    raise exception using errcode='23514',message='WORKER_PROPOSAL_TERMS_IMMUTABLE';
  end if;
  return new;
end;
$func$;

revoke all on function private.candidate_has_customer_decision(uuid,text),
  private.guard_worker_candidate_decision(),private.record_worker_candidate_decision(),
  private.guard_worker_proposal_terms() from public,anon,authenticated,service_role;

do $triggers$
begin
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.job_worker_candidates'::regclass
    and tgname='job_worker_candidates_decision_guard' and not tgisinternal) then
    create trigger job_worker_candidates_decision_guard before update on public.job_worker_candidates
      for each row execute function private.guard_worker_candidate_decision();
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.job_events'::regclass
    and tgname='job_events_candidate_decision_receipt' and not tgisinternal) then
    create trigger job_events_candidate_decision_receipt after insert on public.job_events
      for each row execute function private.record_worker_candidate_decision();
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.worker_matching_proposals'::regclass
    and tgname='worker_matching_proposals_terms_guard' and not tgisinternal) then
    create trigger worker_matching_proposals_terms_guard before update on public.worker_matching_proposals
      for each row execute function private.guard_worker_proposal_terms();
  end if;
end;
$triggers$;

-- Legacy retirement can also say customer_declined; only a matching audit proves an explicit decision.
update public.job_worker_candidates candidate set customer_decision_kind=
  case when candidate.status='customer_confirmed' then 'confirm' else 'reject' end
where candidate.customer_decision_kind is null
  and candidate.status in ('customer_confirmed','customer_declined')
  and private.candidate_has_customer_decision(candidate.id,
    case when candidate.status='customer_confirmed' then 'confirm' else 'reject' end);

commit;
