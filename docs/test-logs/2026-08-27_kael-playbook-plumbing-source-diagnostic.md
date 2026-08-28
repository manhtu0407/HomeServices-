# Kael plumbing source diagnostic — 2026-08-27

## Hypothesis

Registering a plumbing-specific, flag-gated playbook with the existing generic intake path should add no default runtime behavior while providing a stable artifact that can later be measured on staging. The source phase is successful only if the plumbing contract, segment, corpus, and holdout agree; it does not establish that Kael performs better.

## Changed

- Added `PLUMBING_PLAYBOOK_VERSION = plumbing-playbook-2026-08-27.v1` and a byte-stable plumbing segment covering the eight profile slugs, six quote drivers, both safety gates, routing, complexity, evidence, and HCMC apartment boundaries.
- Registered plumbing in the shared playbook registry behind `KAEL_PLAYBOOK_PLUMBING_ENABLED`; the flag defaults off and is independent from electrical.
- Added the human textbook at `docs/playbooks/services/plumbing.md`.
- Added a 24-case corpus and a separate 24-case synthetic holdout with new wording. Labels are marked as self-review and remain diagnostic only.
- Generalized the evaluator's service selection and selected-service corpus validation while preserving the electrical source path.
- Extended the selected-playbook runtime safety path to recognize plumbing signals, preserve them through observation/response handling, and produce plumbing-specific safety/inspection wording without changing electrical defaults.

## Baseline

**NOT RUN.** No plumbing baseline request was sent to staging. The required Edge/Deno precondition was unavailable, so there is no baseline pass rate, scope signal, safety recall, latency, or deployment version to report.

## After

**NOT RUN.** `KAEL_PLAYBOOK_PLUMBING_ENABLED` was not enabled, no plumbing runtime arm was deployed, and no production or staging flag was changed during this source phase.

## Delta

**NOT COMPUTED.** A local validator and an electrical fixture replay cannot substitute for a matched plumbing staging baseline/after pair. There is no evidence for a positive or non-regressing plumbing delta.

## Diagnostic/live metrics

| Item | Result |
|---|---|
| Ground-truth-style corpus | 24/24 strict-valid; 8 unique plumbing slugs; 19 slug-routed cases |
| Synthetic holdout | 24/24 strict-valid; 8 unique plumbing slugs; every rationale starts `[SYNTHETIC SELF-REVIEW]` |
| Segment/textbook parity | PASS; Appendix A equals the runtime segment byte-for-byte |
| Default flag state | OFF by code path; no enablement performed |
| Staging live metrics | NOT RUN |
| Production mutation | NONE |

## Verification actually run

- `node --input-type=module -e ... validatePlaybookCorpus(..., 'plumbing')` — PASS for both plumbing JSON files, 24 cases each.
- `node --input-type=module -e ...` Appendix A parity check — PASS.
- `pnpm test:api -- src/__tests__/unit/kael-playbook-registry-pillar.test.ts` — PASS, 1 file and 4 tests.
- `node apps/api/scripts/kael-playbook-eval.mjs --help` — PASS; runner lists all six supported services.
- Electrical fixture contract replay through the generalized runner — PASS with `errored=0`; this is not plumbing live evidence and the temporary generated report was removed.
- `pnpm type-check:api` — PASS (`tsc --noEmit`).
- `pnpm test:api` — PASS, 24 files passed and 1 skipped; 600 tests passed and 1 skipped.
- `pnpm lint:comments --working` — PASS; no note-banner comments found.
- `node scripts/check-edge-db-contract.mjs --emit-sql` — PASS (`exit 0`).
- `node scripts/check-work-plan.mjs` — PASS, 10 slices closed and 103 changed paths inside the declared read-window.
- `node scripts/check-work-plan.mjs --coverage` — PASS; 38/38 skills reachable, 5 always-on exempt, 12 protocol-only names trapped.
- `git diff --check` — PASS (`exit 0`).
- `node scripts/check-authority-citations.mjs` — PASS; 177 citations across 2038 files resolve. Existing archived-Plan warnings remain non-blocking.
- `node scripts/check-ship-ready.mjs` — exit 1 only because the worktree has 103 uncommitted paths; all 11 content gates are green.
- Recovery attempt: `docker desktop start` and Docker daemon readiness — PASS; server `29.7.2` became reachable.
- `docker compose pull --policy missing deno` — PASS; pinned `denoland/deno:2.9.4` image was already present.
- `pnpm db:local:doctor` — BLOCKED/FAIL: available RAM was `1.85 GB` against the `4 GB` floor; disk and all checked ports were OK. No local stack was started.
- G2 follow-up — NOT RUN after the doctor refusal; the earlier attempt was blocked by the unavailable daemon/no PATH Deno, and this retry is now blocked by the RAM precondition.
- Next Step retry — `docker desktop restart` exit 0; `docker info` reached server `29.7.2`; `docker compose pull --policy missing deno` exit 0 with the pinned image already present; `pnpm db:local:doctor` again refused at `3.94 GB` available versus the `4 GB` floor. No local stack or `pnpm edge:check` was started.
- Cleanup attempt: closed Claude, Edge, Settings, Discord, Douyin, Riot Client, Teams, and Microsoft Copilot; all targeted processes reached zero. Three stale Expo web Preview launch trees plus their Jest/ESLint residue were then closed after the largest node measured roughly `1.1 GB`; ChatGPT/Codex, system/security processes, and Codex-owned runtimes were preserved.
- Docker cleanup: `docker desktop stop` completed, no Docker containers remain, and the daemon is stopped. An exact `wsl --terminate docker-desktop` was also attempted; the distro respawned under the WSL service, so no broad WSL shutdown was used and Codex-owned MCP/runtime processes were not force-killed.
- Post-cleanup host check — PASS for the cleanup target set; physical RAM first reached `4.17 GB`, then `4.86 GB`, `5.55 GB`, and stabilized at `5.15 GB` free after the first cleanup. The Next Step retry measured `3.94 GB` with Docker running, so the RAM guard remained closed; the final post-stop sample after the repeat cleanup was `5.12 GB` free. `PreviewNodeCount=0`, `ClaudeProcessCount=0`, and the named optional-app target set was `0`; Docker daemon remains stopped. Two `NvBroadcast.Container` helpers reappeared under NVIDIA's container service and were retained as driver-adjacent infrastructure rather than disabling the service. The exact `docker-desktop` WSL terminate completed but the distro respawned under `wslservice`; no broad WSL shutdown was used.

## Human/domain review still required

- Confirm that the eight slug boundaries map to the intended plumbing pricing and workflow rows.
- Review the shared-riser/main-supply/common-area routing boundary and whether any case should hard-route to BQL instead of on-site assessment.
- Review the four Vietnamese safety sentences and the rule against chemical, electrical, or dismantling instructions.
- Replace self-reviewed labels with independent plumbing-domain labels before treating the holdout as generalization evidence.
- Attest the exact deployed segment/version after a staging deployment.

## Risks/Limitations

- G2 is unresolved, so the new Deno segment has not passed the required local Edge check. Docker/image recovery succeeded, but the local doctor measured only `3.94 GB` available RAM versus the `4 GB` floor when Docker was running.
- No Supabase local container was started; the RAM guard was respected.
- The `docker-desktop` WSL distro respawned after an exact terminate under the WSL service; Docker's Linux daemon is still stopped. No broad WSL shutdown was used because it could affect unrelated WSL workloads and the active Codex toolchain.
- No baseline/after arm, live holdout, required-safety recall, or G5 decision exists for plumbing.
- The corpus and holdout are self-labeled; they can detect obvious regressions but cannot prove generalization.
- The evaluator and selected-playbook safety path were generalized in the same dirty worktree as unrelated Claude/user changes; no commit, push, merge, or reset was performed.

## Decision

`SOURCE_ARTIFACT_READY / NEEDS_HOLDOUT / TOOLCHAIN_BLOCKED` — keep `KAEL_PLAYBOOK_PLUMBING_ENABLED` disabled. This report makes no production-readiness or intelligence-improvement claim.

## Next Step

Per Tu's instruction, Docker is skipped for this continuation after the `3.94 GB < 4 GB` refusal; do not start the local stack or bypass G2. Keep the plumbing flag OFF and complete the independent plumbing-domain review/label replacement that is still required. If the RAM gate becomes available later, rerun `pnpm db:local:doctor` and G2 (`pnpm edge:check`), then execute deployment-attested plumbing baseline and after arms with the prescribed pacing before moving to HVAC.
