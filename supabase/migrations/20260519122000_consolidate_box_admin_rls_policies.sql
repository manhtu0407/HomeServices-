-- Avoid duplicate permissive SELECT policies on service boxes/media/artifact
-- tables while keeping admin DML available only through explicit actions.

drop policy if exists "Admins manage service knowledge boxes" on public.service_knowledge_boxes;
create policy "Admins insert service knowledge boxes"
  on public.service_knowledge_boxes for insert
  to authenticated
  with check (private.is_admin());
create policy "Admins update service knowledge boxes"
  on public.service_knowledge_boxes for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());
create policy "Admins delete service knowledge boxes"
  on public.service_knowledge_boxes for delete
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins manage Kael market artifacts" on public.kael_market_artifacts;
create policy "Admins insert Kael market artifacts"
  on public.kael_market_artifacts for insert
  to authenticated
  with check (private.is_admin());
create policy "Admins update Kael market artifacts"
  on public.kael_market_artifacts for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());
create policy "Admins delete Kael market artifacts"
  on public.kael_market_artifacts for delete
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins manage job media assets" on public.job_media_assets;
create policy "Admins insert job media assets"
  on public.job_media_assets for insert
  to authenticated
  with check (private.is_admin());
create policy "Admins update job media assets"
  on public.job_media_assets for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());
create policy "Admins delete job media assets"
  on public.job_media_assets for delete
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins manage Kael analysis artifacts" on public.kael_analysis_artifacts;
create policy "Admins insert Kael analysis artifacts"
  on public.kael_analysis_artifacts for insert
  to authenticated
  with check (private.is_admin());
create policy "Admins update Kael analysis artifacts"
  on public.kael_analysis_artifacts for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());
create policy "Admins delete Kael analysis artifacts"
  on public.kael_analysis_artifacts for delete
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins manage device push tokens" on public.device_push_tokens;
create policy "Admins insert device push tokens"
  on public.device_push_tokens for insert
  to authenticated
  with check (private.is_admin());
create policy "Admins update device push tokens"
  on public.device_push_tokens for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());
create policy "Admins delete device push tokens"
  on public.device_push_tokens for delete
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins manage worker cancellation requests" on public.worker_cancellation_requests;
create policy "Admins insert worker cancellation requests"
  on public.worker_cancellation_requests for insert
  to authenticated
  with check (private.is_admin());
create policy "Admins update worker cancellation requests"
  on public.worker_cancellation_requests for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());
create policy "Admins delete worker cancellation requests"
  on public.worker_cancellation_requests for delete
  to authenticated
  using (private.is_admin());
