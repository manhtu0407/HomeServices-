# Kael Incident Response

This runbook covers operational failures in the Kael runtime. Use only repository commands and admin routes that exist at the current commit. Never use a live Supabase project as a substitute for an unavailable local verification environment.

## 1. Widespread wrong price guidance

**Symptom:** estimate complaints rise or the `kael_estimate_accuracy` view shows a material increase in out-of-band final prices.

**Action:**

```bash
node apps/api/scripts/kael-eval.mjs --mode deterministic --report /tmp/kael-eval.md
node apps/api/scripts/kael-multi-turn-eval.mjs
```

Enable the existing Kael kill switch through the approved environment-management process when customer harm is plausible. Pause learning-rule promotion. Review the admin estimate-accuracy route and affected service/complexity/month groups.

**Recovery proof:** deterministic gates pass, the reviewed live staging evaluation passes, the unsafe route is disabled or corrected, and a reviewer signs off before production promotion.

## 2. AI spend spike

**Symptom:** durable spend reservations block globally or for one actor.

**Action:** inspect the spend ledger and scope returned by `reserve_kael_ai_spend`; verify the configured global, per-user daily, and per-user monthly USD caps. Do not raise caps before identifying the actor or workload responsible.

**Recovery proof:** expected requests reserve and finalize spend, abusive or accidental loops remain blocked, and no key or user content appears in the incident record.

## 3. Provider outage or model retirement

**Action:**

```bash
node apps/api/scripts/kael-model-health.mjs --list
node apps/api/scripts/kael-model-health.mjs
```

Read circuit-breaker state, identify the affected provider/model, and use only reviewed routing fallback. The live command requires process-only provider credentials and costs tokens.

**Recovery proof:** the intended route responds within the timeout, circuit state closes normally, and deterministic plus live staging evaluation remain within accepted thresholds.

## 4. Learning regression

**Symptom:** quality drops after a learning rule changes.

**Action:** stop promotion, identify the rule and `kael_rule_effects` rows, rollback the rule through the existing admin learning workflow, then rerun deterministic evaluation and the affected service cases.

**Recovery proof:** the prior rule version is active, the failing cases pass, and the effect ledger identifies the rollback.

## 5. Escalation queue backlog

**Action:** open `/admin/kael-queue` in the admin reference app or call:

```text
GET  /admin/kael-queue?status=open&escalation_level=hard
POST /admin/kael-queue/<queue-id>/resolve
```

Use a short-lived admin token. Resolution notes must not contain PII. Prioritize hard escalations and high-stakes reasons.

**Recovery proof:** queue items are resolved by an authenticated admin, resolution timestamps are present, and no raw actor identifier or conversation text is exposed by the route.

## 6. Prompt leakage or jailbreak suspicion

**Action:** run the offline corpus first, then the live staging runner only with explicit approval:

```bash
pnpm --filter @nestscout/api exec vitest run kael-redteam
KAEL_REDTEAM_RUN_LIVE=yes node apps/api/scripts/kael-live-redteam.mjs
```

**Recovery proof:** all blocking cases remain blocked, truthful AI introductions remain allowed, no provider/model/prompt/key details leak, and the result is tied to a commit SHA and staging target.
