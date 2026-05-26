# Source Trust Maintenance

Status: F26 R5 registry live on staging.
Plan ref: `Plan.md` §25.9 and §26.8.

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
- Citation quorum requires at least 2 accepted Tier 1 domains with effective
  trust score >= 0.5.
- `insufficient_trusted_data` is a safe failure; the product should continue
  through baseline fallback instead of trusting weak market data.

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
