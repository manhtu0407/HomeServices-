Document type:
P15 staging E2E test report
Audience:
Tu, future AI agent, reviewer.
Facts captured:
- Status: passed
- Staging ref: xyylanuyflrjzbjzhqfl
- Run id: p15-1779805818040-5cbca2
- Actors: 5 customers, 5 workers, 1 admin.
- Case matrix:
- normal_transaction: 10
- demanding_customer: 5
- worker_cancellation: 10 (5 explicit, 5 no-show)
- customer_cancellation: 5
- dispute: 3
- Case 4 sub-cases: before_a7, after_a7_before_worker_accept, after_worker_accept, after_worker_completed_trigger_dispute, scheduled_job
- Case 5 dispute types: completion_rejected, damage_claim, abusive_behavior_customer
- Realtime kael_progress: verified
Decisions:
- Edge mobile-api handled workflow-sensitive actions.
- Direct DB was used only for staging fixtures, timer preconditions, realtime trigger stimulus, metrics, and cleanup.
- Evidence snapshot cleanup used a scoped staging SQL cleanup for tracked P15 job ids only.
Verification:
- Intake latency ms: p50=5146, p95=6578, p99=8043, limit=12000.
- API latency ms: p50=543, p95=5146, p99=6325.
- Cost USD: total=0.002479, worst_transaction=0.000552, provider_rows=40, jobs_with_logs=20, limit=0.3.
- Cleanup: ok=true, counts={"jobs":0,"job_events":0,"job_broadcasts":0,"chat_messages":0,"reviews":0,"api_logs":0,"kael_admin_queue":0,"kael_interaction_log":0,"worker_cancellation_requests":0,"customer_cancellation_records":0,"disputes":0,"evidence_snapshots":0,"profiles":0}.
Limitations:
- None observed in this run.
Next use:
- Treat this report as the P15 acceptance artifact only when Status is passed and cleanup ok=true.
