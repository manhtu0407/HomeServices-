# System Health Monitor Operations

## Scope

The implemented monitoring profile is `cloudflare-admin-v1`. When activated, Supabase Cron runs the collector once per minute and the Cloudflare Worker runs independently once per minute, storing observer ticks, incidents, and Supabase outage events in D1. The Admin view is under **Admin Sections → Hệ thống → Sức khỏe hệ thống**.

Source code, local test results, and Preview are not evidence that Production monitoring is active. The release workflow must verify the deployed Edge and Worker identities, a fresh collector snapshot, and a persisted D1 tick before the profile is treated as live.

The profile requires Backend, Kael, native App connectivity, collector freshness, enabled scheduled workers, and Cloudflare observer/D1 evidence. A missing or expired required signal is gray and prevents an overall green status. Browser Preview is not native App evidence.

Crash coverage and push notifications are deferred. The interface must say that crash tracking and push notifications are not enabled. Do not configure Sentry or Telegram for this profile. Monitoring does not call AI inference providers.

## Secrets inventory

| Name | Store | Use |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub repository secret | Release workflow access to the approved Workers and D1 account |
| `SYSTEM_HEALTH_MONITOR_SECRET` | GitHub Production environment secret; copied into Supabase Vault | Authenticates the scheduled Supabase collector |
| `SYSTEM_HEALTH_OBSERVER_SECRET` | GitHub Production environment secret; Supabase Function and Cloudflare Worker secret | Authenticates observer reads and writes between Supabase and Cloudflare |
| `system_health_monitor_secret` | Supabase Vault | Secret read by the database scheduled collector |

Use 64-character lowercase hexadecimal values for both system health secrets. Do not put secret values in the repository, workflow artifacts, logs, support packets, or screenshots. The release workflow checks the named secrets before any Production deployment. Sentry and Telegram credentials are not required.

## Release order

The release workflow checks the exact Cloudflare account and D1 identity, records the current Worker and Edge deployment identities, and verifies the active release before changing the monitoring runtime. It applies the D1 migrations without deleting evidence, deploys the collector, configures its Vault secret and Cron, waits for a fresh schema-v2 snapshot, then deploys the Cloudflare observer and verifies a live D1 tick.

The release manifest binds the profile, Worker source/configuration hash, D1 migration hashes, and `system-monitor` Edge source/configuration. Workflow artifacts include the target receipt, before/after identities, first collector snapshot, Worker deployment identity, D1 tick evidence, and rollback evidence. Secret files are written under the runner temporary directory with restrictive permissions and removed after use.

Production release remains behind the existing strict configuration and readiness gates. Do not set strict release, FCM, APNs, or push receipt readiness flags without current, independently verifiable evidence. A skipped or failed Production lane is not evidence of deployment.

## Inspect Cloudflare evidence

In the Cloudflare Dashboard, select account `45dec251ed1c9627256f9b6ba24bcdff`, open Workers & Pages, and select `nestscout-system-health-observer`. Check the deployment tag against the active release and inspect invocation status and CPU. Open D1 database `nestscout-system-health-observer` (`33d39ec6-73a4-44e6-b030-fb9ee3e4f281`) to inspect the independent observer ledger.

Use bounded, read-only queries in the D1 console:

```sql
SELECT * FROM monitor_state WHERE singleton_id = 1;
SELECT incident_id, fingerprint, component, severity, status, reason_code, opened_at, last_seen_at, resolved_at
FROM monitor_incidents ORDER BY last_seen_at DESC LIMIT 100;
SELECT external_incident_id, event_kind, reason_code, recorded_at, sync_status
FROM monitor_outage_events ORDER BY recorded_at DESC LIMIT 100;
SELECT scheduled_at, completed_at, outcome, fencing_token
FROM monitor_ticks ORDER BY scheduled_at DESC LIMIT 100;
```

`monitor_ticks` is retained for seven days. Incident and outage history is retained for 30 days. The bounded cleanup only removes monitoring rows; it does not touch application or harness data.

## Expected states and limits

- Two consecutive availability failures open a red incident; two consecutive passes recover it.
- A collector snapshot older than 180 seconds is stale. Future evidence beyond the accepted clock skew is rejected.
- A Cloudflare tick with missing D1 persistence or reconciliation evidence is degraded, never green.
- Cloudflare records Supabase outage open/update/resolve events independently and retries reconciliation idempotently after Supabase returns.
- If Supabase and Cloudflare are both unreachable, this release has no third notification channel. Admin may show stale data until either service returns.
- No crash data means crash coverage is unavailable; heartbeat is not proof that the App did not crash.
- No Telegram or push delivery is available in this release.
- A one-minute schedule is a sampling interval, not a guarantee that every failure is detected within exactly 60 seconds.

## Rollback

The release workflow owns Production schedule changes. On a post-configuration failure it restores the previously registered Worker version and downloaded `system-monitor` Edge source when a prior monitoring release exists. When monitoring was not part of the prior release, it disables the Supabase collector schedule and deploys a Worker configuration with Cron removed. Both paths retain D1 and Supabase monitoring evidence; do not drop monitoring tables or clear incident rows during rollback.

If automatic rollback evidence is incomplete, treat Production runtime identity as unverified and stop promotion. Do not manually modify business kill switches or workflow state to recover a monitor failure.
