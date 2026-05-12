-- =============================================================================
-- Migration: 20260512000000_security_hardening.sql
-- Fixes: role escalation vulnerability, missing admin RLS policies
-- =============================================================================

-- =============================================================================
-- FIX C2: Role escalation in handle_new_user()
-- Previously: user could pass { role: 'admin' } in signup metadata
-- Now: all signups forced to 'customer'. Admin/worker assigned by admin only.
-- =============================================================================

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, phone)
  values (
    new.id,
    'customer',
    new.phone
  );
  return new;
end;
$$ language plpgsql security definer;

-- =============================================================================
-- FIX C4: Admin RLS policies
-- Admin (role = 'admin') needs full access to manage the platform.
-- =============================================================================

-- Helper: check if current user is admin
create or replace function is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer stable;

-- profiles: admin can view and update all
create policy "Admin view all profiles"
  on profiles for select using (is_admin());

create policy "Admin update all profiles"
  on profiles for update using (is_admin());

-- customer_profiles: admin can view all
create policy "Admin view all customer profiles"
  on customer_profiles for select using (is_admin());

-- worker_profiles: admin can view and update all (approve workers)
create policy "Admin view all worker profiles"
  on worker_profiles for select using (is_admin());

create policy "Admin update all worker profiles"
  on worker_profiles for update using (is_admin());

-- price_baselines: admin can manage (CRUD)
create policy "Admin manage price baselines"
  on price_baselines for all using (is_admin());

-- jobs: admin can view and update all
create policy "Admin view all jobs"
  on jobs for select using (is_admin());

create policy "Admin update all jobs"
  on jobs for update using (is_admin());

-- job_broadcasts: admin can view all
create policy "Admin view all broadcasts"
  on job_broadcasts for select using (is_admin());

-- chat_messages: admin can view all (for dispute resolution)
create policy "Admin view all messages"
  on chat_messages for select using (is_admin());

-- reviews: admin can view and manage all
create policy "Admin manage reviews"
  on reviews for all using (is_admin());

-- api_logs: admin can view all (monitoring)
create policy "Admin view all api logs"
  on api_logs for select using (is_admin());
