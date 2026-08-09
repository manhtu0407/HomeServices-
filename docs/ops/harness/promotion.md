# Harness Promotion Controller

Promotion always selects one immutable release bundle and one environment identity. The allowed path is `assembled -> verified -> staging -> shadow -> canary -> production`. Every remote transition requires explicit human approval, matching migration and function digests, a passing evaluation report, a selected rollback release, and zero critical authorization, safety, or confirmation failures.

The controller records each attempted transition before traffic changes. Staging, shadow, and canary evidence are release-specific. A failed threshold moves the promotion to `aborted`; it never silently skips a stage. Production audit sessions remain read-only.

Operator sequence:

1. Build and verify the release bundle.
2. Compare the ordered migration inventory with the target environment.
3. Run deterministic evaluation and affected live-provider evaluation.
4. Select the previous compatible release as rollback target.
5. Record explicit approval and transition one state.
6. Observe the configured window and abort on any threshold breach.
7. Archive the promotion packet and release-specific evidence.
