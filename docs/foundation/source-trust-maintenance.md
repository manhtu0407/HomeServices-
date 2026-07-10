# Source Trust Maintenance

Status: F26 R5 registry live on staging; Plan §40 S1–S6 upgrade implemented locally and awaiting staging migration apply.
Plan ref: `Plan.md` §40 (supersedes the older §25 price-weight/quorum behavior) and §26.8.

## Purpose

`source_trust_registry` is the durable allowlist for market citations used by
Kael's Perplexity `market_lookup` path. Edge code may use the hardcoded 20-domain
list only as a fallback when the registry cannot be loaded.

## Review Rules

- Review Tier 1 domains at least quarterly.
- Set `is_active=false` for domains with repeated citation drift, low-quality
  price pages, stale pricing, or unclear business identity.
- Use `last_reviewed_at`, `last_reviewer_id`, and `review_notes` for every
  manual review.
- Keep `tier='blocked'` for domains that should never satisfy citation quorum.
- Do not add Facebook groups, personal blogs, forums, open classifieds, or
  scraped price-table pages as trusted market sources.

## Runtime Rules

- Staging source-trust smoke currently uses
  `KAEL_TRUST_PERPLEXITY_FILTER_ENABLED=true`.
- Production should keep the flag off until Tu approves a separate production
  source-trust rollout.
- The trusted response carries per-source price evidence plus A–G signals. The
  deterministic rulebook computes the effective T1–T5 tier; a provider tier
  claim is discarded.
- Citation quorum requires at least 2 effective T1–T2 sources below the
  server-configured high-value threshold and at least 3 at or above it.
- One or more effective T1–T2 sources below quorum is a weak market signal:
  keep the locked 50/50 baseline/market blend, widen the deterministic band,
  and require an on-site inspection. Zero effective T1–T2 sources, invalid
  configuration, stale/mixed-unit evidence, or `insufficient_trusted_data`
  remains a safe baseline fallback.

## Verification

Use the guarded staging harness only with short-lived process env values:

```powershell
$env:F26_RUN_SOURCE_TRUST_SMOKE = "1"
$env:F26_SUPABASE_URL = "https://xyylanuyflrjzbjzhqfl.supabase.co"
$env:F26_API_BASE_URL = "https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api"
$env:F26_SUPABASE_ANON_KEY = "<redacted>"
$env:F26_SUPABASE_SERVICE_ROLE_KEY = "<redacted>"
node apps/api/scripts/kael-f26-source-trust-smoke.mjs
```

Expected evidence:

- registry has at least 20 active Tier 1 rows
- market logs show `source_trust_registry_source=db`
- accepted citation artifacts include at least 2 trusted domains per accepted row
- cleanup removes temporary users, jobs, and logs
