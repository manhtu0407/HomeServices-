begin;

create table public.admin_data_revisions (
  section text primary key check (section in ('overview', 'operations', 'workers', 'finance', 'team', 'system')),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

insert into public.admin_data_revisions (section)
values ('overview'), ('operations'), ('workers'), ('finance'), ('team'), ('system');

create or replace function private.can_read_admin_data_revision(p_section text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_admin()
    or exists (
      select 1
      from public.profiles as profile
      join public.admin_operator_accounts as account on account.user_id = profile.id
      where profile.id = (select auth.uid())
        and profile.role::text = 'admin_operator'
        and account.status = 'active'
        and case p_section
          when 'overview' then account.capabilities && array['operations.read']::text[]
          when 'operations' then account.capabilities && array['transactions.read']::text[]
          when 'workers' then account.capabilities && array['workers.read']::text[]
          when 'finance' then account.capabilities && array['finance.read', 'finance.reconcile', 'payouts.read', 'payouts.process']::text[]
          when 'team' then account.capabilities && array['team.read']::text[]
          when 'system' then account.capabilities && array['system.read']::text[]
          else false
        end
    );
$function$;

revoke all on function private.can_read_admin_data_revision(text) from public, anon;
grant execute on function private.can_read_admin_data_revision(text) to authenticated;

alter table public.admin_data_revisions enable row level security;
revoke all on table public.admin_data_revisions from public, anon, authenticated;
grant select on table public.admin_data_revisions to authenticated, service_role;
create policy admin_data_revisions_capability_read
  on public.admin_data_revisions
  for select to authenticated
  using (private.can_read_admin_data_revision(section));

create or replace function private.bump_admin_data_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_section text;
begin
  foreach v_section in array tg_argv loop
    update public.admin_data_revisions
    set revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where section = v_section;
  end loop;
  return null;
end;
$function$;

revoke all on function private.bump_admin_data_revision() from public, anon, authenticated;

do $triggers$
declare
  v_source record;
begin
  for v_source in
    select * from (values
      ('jobs', array['overview','operations','finance']::text[]),
      ('disputes', array['overview','operations']::text[]),
      ('scope_change_requests', array['overview','operations']::text[]),
      ('workflow_recovery_cases', array['overview','operations']::text[]),
      ('workflow_recovery_action_audit', array['overview','operations']::text[]),
      ('matching_operations', array['overview','operations']::text[]),
      ('matching_capacity_reservations', array['overview','operations']::text[]),
      ('kael_admin_queue', array['overview','operations','workers']::text[]),
      ('worker_profiles', array['overview','workers']::text[]),
      ('job_payment_orders', array['overview','finance']::text[]),
      ('job_payment_reconciliation_events', array['overview','finance']::text[]),
      ('admin_support_case_notes', array['operations']::text[]),
      ('admin_support_case_preparations', array['operations']::text[]),
      ('evidence_snapshots', array['operations']::text[]),
      ('job_media_assets', array['operations']::text[]),
      ('worker_payment_ledger', array['overview','workers','finance']::text[]),
      ('worker_withdrawal_requests', array['workers','finance']::text[]),
      ('worker_payout_methods', array['workers','finance']::text[]),
      ('platform_bank_balance_snapshots', array['finance']::text[]),
      ('admin_finance_tax_policies', array['finance']::text[]),
      ('admin_finance_tax_rules', array['finance']::text[]),
      ('admin_worker_application_reviews', array['workers']::text[]),
      ('worker_violation_cases', array['workers']::text[]),
      ('worker_violation_case_events', array['workers']::text[]),
      ('worker_violation_appeals', array['workers']::text[]),
      ('worker_discipline_entries', array['workers']::text[]),
      ('worker_discipline_policy', array['workers']::text[]),
      ('worker_ambassador_point_entries', array['workers']::text[]),
      ('ambassador_program_versions', array['workers']::text[]),
      ('ambassador_milestones', array['workers']::text[]),
      ('ambassador_multiplier_tiers', array['workers']::text[]),
      ('compensation_negotiations', array['workers']::text[]),
      ('compensation_offers', array['workers']::text[]),
      ('worker_bonus_redemptions', array['workers']::text[]),
      ('worker_bonus_clawbacks', array['workers']::text[]),
      ('worker_suspension_events', array['workers']::text[]),
      ('worker_identity_numbers', array['workers']::text[]),
      ('identity_blocklist', array['workers']::text[]),
      ('admin_manager_nominations', array['team']::text[]),
      ('admin_operator_accounts', array['team']::text[]),
      ('admin_operator_provisioning', array['team']::text[]),
      ('kael_permission_audit', array['operations','workers','team']::text[]),
      ('admin_model_health_daily', array['system']::text[]),
      ('kael_cost_daily_summary', array['finance','system']::text[]),
      ('kael_estimate_accuracy', array['system']::text[]),
      ('price_baselines', array['system']::text[]),
      ('price_baseline_versions', array['system']::text[]),
      ('price_baseline_governance_heads', array['system']::text[]),
      ('price_baseline_governance_audit', array['system']::text[]),
      ('admin_price_evidence_packages', array['system']::text[]),
      ('service_categories', array['system']::text[]),
      ('service_problems', array['system']::text[]),
      ('service_taxonomy_revisions', array['system']::text[]),
      ('service_intake_policies', array['system']::text[]),
      ('service_intake_policy_heads', array['system']::text[]),
      ('service_intake_policy_audit', array['system']::text[]),
      ('learning_rules', array['system']::text[]),
      ('learning_rule_versions', array['system']::text[]),
      ('learning_rule_dependencies', array['system']::text[]),
      ('learning_rule_revocations', array['system']::text[]),
      ('learning_candidates', array['system']::text[]),
      ('kael_market_cache', array['system']::text[]),
      ('kael_provider_circuit', array['system']::text[])
    ) as sources(table_name, sections)
  loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_source.table_name)) is not null then
      execute pg_catalog.format(
        'create trigger %I after insert or update or delete on public.%I for each statement execute function private.bump_admin_data_revision(%s)',
        'admin_revision_' || v_source.table_name,
        v_source.table_name,
        array_to_string(array(select quote_literal(section_name) from unnest(v_source.sections) as source_sections(section_name)), ', ')
      );
    end if;
  end loop;
end;
$triggers$;

create or replace function private.bump_admin_support_message_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job_id uuid;
begin
  v_job_id := coalesce(new.job_id, old.job_id);
  if v_job_id is not null and (
    exists (select 1 from public.disputes where job_id = v_job_id)
    or exists (select 1 from public.kael_admin_queue where job_id = v_job_id)
  ) then
    update public.admin_data_revisions
    set revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where section = 'operations';
  end if;
  return null;
end;
$function$;

revoke all on function private.bump_admin_support_message_revision() from public, anon, authenticated;

do $focused_sources$
begin
  if pg_catalog.to_regclass('public.profiles') is not null then
    execute 'create trigger admin_revision_profiles_insert after insert on public.profiles for each row when (new.role::text in (''admin'', ''admin_operator'', ''worker'')) execute function private.bump_admin_data_revision(''overview'', ''operations'', ''workers'', ''finance'', ''team'', ''system'')';
    execute 'create trigger admin_revision_profiles_delete after delete on public.profiles for each row when (old.role::text in (''admin'', ''admin_operator'', ''worker'')) execute function private.bump_admin_data_revision(''overview'', ''operations'', ''workers'', ''finance'', ''team'', ''system'')';
    execute 'create trigger admin_revision_profiles_update after update of role, full_name, phone on public.profiles for each row when (old.role is distinct from new.role or old.full_name is distinct from new.full_name or old.phone is distinct from new.phone) execute function private.bump_admin_data_revision(''overview'', ''operations'', ''workers'', ''finance'', ''team'', ''system'')';
  end if;

  if pg_catalog.to_regclass('public.api_logs') is not null then
    execute 'create trigger admin_revision_api_logs_signal after insert on public.api_logs for each row when (new.success is false or new.fallback_used is true) execute function private.bump_admin_data_revision(''system'')';
  end if;

  if pg_catalog.to_regclass('public.chat_messages') is not null
     and pg_catalog.to_regclass('public.disputes') is not null
     and pg_catalog.to_regclass('public.kael_admin_queue') is not null then
    execute 'create trigger admin_revision_chat_messages_support_only after insert or update or delete on public.chat_messages for each row execute function private.bump_admin_support_message_revision()';
  end if;
end;
$focused_sources$;

do $publication$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_data_revisions'
     ) then
    alter publication supabase_realtime add table public.admin_data_revisions;
  end if;
end;
$publication$;

commit;
