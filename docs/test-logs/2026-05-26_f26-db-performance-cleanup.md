# 2026-05-26 F26 DB Performance Cleanup

Plan ref: `Plan.md` §26.10.

## Scope

- Added covering indexes for all advisor-reported unindexed foreign keys.
- Dropped advisor-reported secondary indexes only when `pg_stat_user_indexes.idx_scan = 0`.
- Kept FK-supporting indexes instead of dropping them blindly.

## Staging Evidence

```text
project_ref: xyylanuyflrjzbjzhqfl
stats_reset: 2026-05-07 18:19:10+00
before: 15 unindexed_foreign_keys, 44 unused_index
after apply: 0 unindexed_foreign_keys
after drop/probe: 1 unused_index
remaining_info: chat_messages_job_id_idx
db lint --linked --fail-on error: No schema errors found
db push --dry-run --linked: Remote database is up to date
```

## Production Evidence

```text
project_ref: iwevizmsedyqozxlawwl
applied:
- 20260526195300_source_trust_registry_f26.sql
- 20260526203000_f26_fk_performance_indexes.sql
- 20260526203100_f26_drop_unused_indexes.sql
after drop/probe: 4 unused_index
remaining_info:
- chat_messages_job_id_idx
- jobs_status_idx
- kael_admin_queue_status_priority_idx
- worker_cancellation_requests_reason_idx
db lint --linked --fail-on error: No schema errors found
db push --dry-run --linked: Remote database is up to date
security advisor: existing auth_leaked_password_protection warning only
```

## Migration Notes

`20260526203000_f26_fk_performance_indexes.sql` adds 15 FK-covering indexes.
The original audit mentioned 14; F5 introduced `source_trust_registry`, so the
live advisor list had 15.

`20260526203100_f26_drop_unused_indexes.sql` drops 37 zero-scan secondary
indexes. Seven zero-scan indexes from the original list were retained because
they covered foreign keys. Post-apply probes used read-only equality predicates
with `enable_seqscan = off` to verify the retained/new indexes are usable.

## Result

F7 passes: staging and production have no unindexed FK findings, dropped at
least 30 unused indexes, and both performance advisor counts are below 10.
