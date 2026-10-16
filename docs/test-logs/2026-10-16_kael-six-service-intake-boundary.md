# Six-service intake public boundary

Baseline e8b95d2122a8ce802c5504630a778f6e51daa72f, uncommitted test-only extension
on codex/kael56-admin-partial-loading-20261016. Product Edge code is unchanged.

The original P342 public handler case and assertion title remain intact. Its
fixture now also covers electrical, cleaning, HVAC, upholstery and handyman,
with distinct synthetic messages, correct persisted service identity and owner.
All six paths stop at defer_analysis, persist the first turn and return through
the actual createMobileApiHandler and createEdgeServices. A fetch spy rejects
network calls and must record zero calls; it is restored even when a case fails.

This is a genuine handler/domain test with an injected Auth/DB boundary. It does
not execute PostgREST or PostgreSQL and does not prove diagnosis, pricing, live
model quality or a complete App journey. The real SQL suite is separate evidence.

## Results

- Targeted P342 suite: 9/9 PASS. Six service paths plus existing role/domain/
  pending-create cases; fixture seam uses the existing makeSequenceClient.
- Compile-only mutation changes the persisted service to plumbing: 4 PASS /
  5 FAIL, precisely the five other service assertions. No product file is edited.
- Restoring the compile transform: 9/9 PASS, same Vitest configuration.
- pnpm test:api --reporter=json --outputFile=../../.scratch/intake-api-full.json:
  2174 PASS / 2 skipped, Node 114 PASS / 1 skipped, exit 0.
- pnpm type-check:api: exit 0.

Actual artifacts: .scratch/six-service-intake.json, six-service-mutant.json,
six-service-restored.json, intake-api-full.json, intake-api-full.log and
intake-type-check.log. No synthetic pass report was generated.

Review fixed point: git diff HEAD from e8, no new commits. Spec: K07-K12 initial
intake boundary. Rules: no paid I/O or credentials, fixed six-service scope, owner
binding preserved. Maintainability: one existing fixture helper reused; no new
runtime helper, dependency or production behavior. Remaining full journey proof
is explicitly unverified.
