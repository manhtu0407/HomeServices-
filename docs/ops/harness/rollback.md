# Harness Rollback

Rollback targets the full compatible release, not one prompt, function, or migration in isolation. First contain the failing dependency with the narrowest kill switch, preserve traces and external receipts, then select the previous verified release. Code rollback never rewrites migration history or assumes an external side effect was reversed.

Required rollback evidence: failed release ID, target release ID, environment, reason code, approval ID, active containment switches, migration compatibility, provider/payment reconciliation, and post-rollback health verification.
