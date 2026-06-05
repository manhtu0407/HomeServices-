# Kael Section 32 Production Smoke Report

Date: 2026-06-05T11:26:58.215Z
Run id: section32-prod-1780658800793-55ee9f13
Status: passed
Target ref: iwevizmsedyqozxlawwl

## Checks

- worker_chat_job_scoped_idempotency: passed
- worker_chat_turn_job_id: passed
- worker_chat_ai_model_column: passed
- worker_chat_sse_result: passed
- worker_chat_job_scoped_session_rows: passed

## Evidence

- Worker stream duration ms: 1475
- SSE event types: stage, stage, result
- Answer turn: {"role":"kael","content_type":"text","ai_provider":"deepseek","ai_model":"deepseek-v4-flash","cost_usd":0.000134,"fallback_used":false,"guardrail_reason":null,"provider_attempts":["primary:deepseek:success:ok:timeout=5000:latency=133"]}
- Cleanup: {"ok":true,"errors":[],"residue":{"jobs":0,"profiles":0,"worker_profiles":0,"customer_profiles":0,"kael_worker_chat_sessions_by_job":0,"kael_worker_chat_sessions_by_id":0,"kael_worker_chat_turns_by_job":0,"kael_worker_chat_turns_by_session":0,"kael_worker_chat_rate_limit_log":0,"api_logs":0,"kael_guardrail_trip_audit":0,"kael_admin_queue":0,"kael_interaction_log":0,"job_events":0,"notifications_by_job":0,"notifications_by_user":0,"worker_kael_memory":0},"residue_total":0,"job_ids":2,"users":2,"sessions":2}

## Limitations

- None.

## Error

- None.
