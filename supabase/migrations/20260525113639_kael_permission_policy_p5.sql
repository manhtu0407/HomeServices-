-- P5 Kael permission response policy: worker safety + legal awareness patterns.

create table if not exists public.worker_safety_patterns (
  id uuid primary key default gen_random_uuid(),
  pattern_key text not null unique check (char_length(pattern_key) between 3 and 120),
  service_type text not null check (service_type in ('electrical', 'plumbing', 'cleaning', 'general')),
  trigger_topic text not null check (char_length(trigger_topic) between 3 and 120),
  severity text not null default 'advisory' check (severity in ('advisory', 'warning', 'urgent')),
  response_guidance text not null check (char_length(response_guidance) between 10 and 1000),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_awareness_patterns (
  id uuid primary key default gen_random_uuid(),
  pattern_key text not null unique check (char_length(pattern_key) between 3 and 120),
  topic text not null check (char_length(topic) between 3 and 120),
  boundary_type text not null check (boundary_type in ('awareness_only', 'redirect_required', 'emergency_redirect')),
  response_guidance text not null check (char_length(response_guidance) between 10 and 1000),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.worker_safety_patterns enable row level security;
alter table public.legal_awareness_patterns enable row level security;

drop trigger if exists worker_safety_patterns_updated_at on public.worker_safety_patterns;
create trigger worker_safety_patterns_updated_at
  before update on public.worker_safety_patterns
  for each row execute function public.update_updated_at();

drop trigger if exists legal_awareness_patterns_updated_at on public.legal_awareness_patterns;
create trigger legal_awareness_patterns_updated_at
  before update on public.legal_awareness_patterns
  for each row execute function public.update_updated_at();

create index if not exists worker_safety_patterns_lookup_idx
  on public.worker_safety_patterns (service_type, trigger_topic)
  where is_enabled;

create index if not exists legal_awareness_patterns_lookup_idx
  on public.legal_awareness_patterns (topic, boundary_type)
  where is_enabled;

drop policy if exists "Admins view worker safety patterns" on public.worker_safety_patterns;
create policy "Admins view worker safety patterns"
  on public.worker_safety_patterns
  for select
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins view legal awareness patterns" on public.legal_awareness_patterns;
create policy "Admins view legal awareness patterns"
  on public.legal_awareness_patterns
  for select
  to authenticated
  using (private.is_admin());

revoke all on public.worker_safety_patterns from public;
revoke all on public.worker_safety_patterns from anon;
revoke all on public.worker_safety_patterns from authenticated;
revoke insert, update, delete on public.worker_safety_patterns from authenticated;
grant select on public.worker_safety_patterns to authenticated;
grant all on public.worker_safety_patterns to service_role;

revoke all on public.legal_awareness_patterns from public;
revoke all on public.legal_awareness_patterns from anon;
revoke all on public.legal_awareness_patterns from authenticated;
revoke insert, update, delete on public.legal_awareness_patterns from authenticated;
grant select on public.legal_awareness_patterns to authenticated;
grant all on public.legal_awareness_patterns to service_role;

insert into public.worker_safety_patterns (
  pattern_key,
  service_type,
  trigger_topic,
  severity,
  response_guidance,
  safe_metadata
) values
  (
    'electrical_lockout_before_repair',
    'electrical',
    'worker_safety_advisory',
    'urgent',
    'Nhắc thợ ngắt nguồn điện khu vực liên quan, kiểm tra khô ráo và không thao tác nếu có mùi khét hoặc tia lửa.',
    '{"phase":"P5","source":"plan_23_10"}'::jsonb
  ),
  (
    'plumbing_floor_protection_before_repair',
    'plumbing',
    'worker_safety_advisory',
    'warning',
    'Nhắc thợ khóa nước khu vực liên quan, đặt khăn hoặc khay hứng nước và chụp ảnh phần phát sinh trước khi đề xuất scope-change.',
    '{"phase":"P5","source":"plan_23_10"}'::jsonb
  ),
  (
    'cleaning_chemical_ventilation',
    'cleaning',
    'worker_safety_advisory',
    'advisory',
    'Nhắc thợ không trộn hóa chất, giữ thông gió và xác nhận bề mặt nhạy cảm trước khi dùng chất tẩy mạnh.',
    '{"phase":"P5","source":"plan_23_10"}'::jsonb
  )
on conflict (pattern_key) do update set
  service_type = excluded.service_type,
  trigger_topic = excluded.trigger_topic,
  severity = excluded.severity,
  response_guidance = excluded.response_guidance,
  safe_metadata = excluded.safe_metadata,
  is_enabled = true,
  updated_at = now();

insert into public.legal_awareness_patterns (
  pattern_key,
  topic,
  boundary_type,
  response_guidance,
  safe_metadata
) values
  (
    'deposit_and_payment_dispute_awareness',
    'legal_safety_awareness',
    'awareness_only',
    'Kael chỉ giải thích ranh giới an toàn và quy trình trong app; không tư vấn pháp lý hay kết luận trách nhiệm thanh toán.',
    '{"phase":"P5","source":"plan_23_10"}'::jsonb
  ),
  (
    'professional_legal_advice_redirect',
    'legal_advice',
    'redirect_required',
    'Nếu người dùng cần tư vấn pháp lý, Kael phải từ chối và hướng người dùng tham vấn luật sư.',
    '{"phase":"P5","source":"plan_23_10"}'::jsonb
  )
on conflict (pattern_key) do update set
  topic = excluded.topic,
  boundary_type = excluded.boundary_type,
  response_guidance = excluded.response_guidance,
  safe_metadata = excluded.safe_metadata,
  is_enabled = true,
  updated_at = now();

comment on table public.worker_safety_patterns is
  'Kael P5 worker safety response patterns. Service role owns writes; admins read.';
comment on table public.legal_awareness_patterns is
  'Kael P5 legal-awareness boundary patterns. Service role owns writes; admins read.';
