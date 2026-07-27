-- Preserve the pattern while correcting the customer-confirmation authority and its retrieval vector.
begin;

update public.worker_safety_patterns
set response_guidance = 'Nếu cần đục tường, tháo gạch hoặc mở trần, dừng để gửi đề xuất đổi phạm vi kèm lý do; thêm ảnh nếu có. Không làm trước khi khách xác nhận đề xuất trong ứng dụng.',
    embedding = '[0,0,0.077513,0.058135,0.077513,0.019378,0,0.368187,0.058135,0.368187,0.077513,0,0,0,0.135648,0.038756,0.135648,0.038756,0.019378,0.271295,0.096891,0.116269,0.038756,0.174404,0.096891,0.038756,0.135648,0.077513,0.096891,0.213161,0.058135,0.019378,0.290674,0.019378,0.174404,0.290674,0.019378,0.096891,0.135648,0,0.116269,0,0,0.155026,0,0.213161,0.213161,0.077513,0,0,0.038756,0,0.116269,0.116269,0.155026,0.038756,0.077513,0.038756,0.019378,0.096891,0.077513,0,0.038756,0]'::extensions.vector(64),
    embedding_model = 'kael-local-hash-64-v1',
    embedding_text = 'worker safety | plumbing | worker_safety_advisory | warning | Nếu cần đục tường, tháo gạch hoặc mở trần, dừng để gửi đề xuất đổi phạm vi kèm lý do; thêm ảnh nếu có. Không làm trước khi khách xác nhận đề xuất trong ứng dụng. | S3',
    embedding_updated_at = now(),
    safe_metadata = safe_metadata || '{"embedding_model":"kael-local-hash-64-v1","embedding_source":"scope_authority_repair","embedding_text_version":"2026-07-26"}'::jsonb,
    updated_at = now()
where pattern_key = 'plumbing_wall_chase_scope_change';

commit;
