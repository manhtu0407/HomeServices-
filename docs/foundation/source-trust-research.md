# Source Trust Research - Section 25 R1

Status: R1 live verified; R2 code implemented; F26 R3-R6 source-trust registry, citation quorum, and LS1 aggregation verified on staging.
Date: 2026-05-26.
Plan ref: `Plan.md` Section 25.5.

## Scope

R1 verifies a maximum-20 Perplexity allowlist for Vietnamese/HCMC home-service market evidence. R2 wires that allowlist into the Edge `market_lookup` Perplexity path behind `KAEL_TRUST_PERPLEXITY_FILTER_ENABLED`. F26 adds DB-backed source-trust lookup, citation quorum validation, persisted market citation artifacts, and LS1 weighted aggregation.

## API Constraints Verified

- Perplexity domain filters support allowlist mode when domains have no `-` prefix.
- The documented limit is 20 domains per request.
- Domains must be root domains without protocol, path, trailing slash, or `www`.
- Live R1 testing found that `search_domain_filter` and `search_recency_filter` must be sent at the top level for the current Sonar endpoint to enforce domain filtering. A diagnostic run with `web_search_options.search_domain_filter` returned 200 but leaked citations outside the requested domain.
- Perplexity Sonar chat completion returns `citations` and `search_results`.
- Anthropic prompt caching uses `cache_control: { "type": "ephemeral" }`; usage reports cache creation/read token fields.

References:
- https://docs.perplexity.ai/docs/search/filters/domain-filter
- https://docs.perplexity.ai/api-reference/sonar-post
- https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

## Final R1 Candidate Domains

Live output: `docs/foundation/source-trust-samples/source-trust-r1-1779781564809.json`

Run summary:
- 20 domains tested.
- 5 Vietnamese/HCMC price queries per domain.
- 100 Perplexity calls returned HTTP 200.
- 368 total on-domain citations/search results.
- 0 outside-domain citation violations.
- 0 zero-citation domains.

These are the R2 allowlist candidates used by the staging source-trust smoke. They are not approved for production rollout until the later Section 25 rollout gates pass.

| Domain | Category | R1 citations/search results | Outside-domain violations | R1 status |
|---|---:|---:|---:|---|
| btaskee.com | Marketplace | 33 | 0 | Candidate |
| jupviec.vn | Marketplace | 1 | 0 | Candidate, weak evidence |
| tuoitre.vn | News | 40 | 0 | Candidate |
| thanhnien.vn | News | 38 | 0 | Candidate |
| dienmayxanh.com | Retail/service knowledge | 41 | 0 | Candidate |
| suachuatainha.com.vn | Service provider | 26 | 0 | Candidate |
| tktclean.com | Cleaning provider | 9 | 0 | Candidate |
| cleanipedia.com | Cleaning knowledge | 2 | 0 | Candidate, knowledge only |
| hoanmyclean.vn | Cleaning provider | 21 | 0 | Candidate |
| thoviet.com.vn | Service provider | 31 | 0 | Candidate |
| thosaigon.vn | Service provider | 20 | 0 | Candidate |
| suadiennuocnamviet.com | Service provider | 13 | 0 | Candidate |
| khodiennuoc.com | Service provider | 20 | 0 | Candidate |
| f24.vn | Service provider | 27 | 0 | Candidate |
| suadiennuocvn.net | Service provider | 10 | 0 | Candidate |
| saigonfix.vn | Service provider | 2 | 0 | Candidate, weak evidence |
| diennuochonglinh.com | Service provider | 14 | 0 | Candidate |
| moitruongmiendong.com | Cleaning/environment provider | 18 | 0 | Candidate |
| drhome.com.vn | Service provider | 1 | 0 | Candidate, weak evidence |
| diennuochuongthinh.com | Service provider | 1 | 0 | Candidate, weak evidence |

Dropped from the original candidate list because top-level domain-filtered R1 returned 0 citations: `btaskee.work`, `rada.com.vn`, `anvui.com`, `247shome.com`, `service.vn`, `vnexpress.net`, `thopro.vn`, `cleanhouse.com.vn`, `vesinhnhaviet.vn`, `guvico.com`. `6ixgo.com` returned a small usable signal but remains excluded from the final 20 because the business-identity trust level is lower than the replacement service-provider domains.

## Untrust Patterns

Reject or heavily down-rank these patterns in later R4/R5 code:

1. Facebook group URLs and social profile posts.
2. Zalo-only or phone-only listings without business identity.
3. Reddit/forum anecdotes.
4. Blogspot/WordPress personal blogs.
5. Scraped price-table pages without source attribution.
6. Coupon/affiliate pages optimized around "gia re" terms.
7. Aggregators without address, company name, or service scope.
8. Pages older than 24 months when price/date context matters.
9. Non-HCMC pages used for HCMC apartment pricing.
10. Appliance retail articles presented as repair labor pricing.
11. Classified-listing pages where workers self-post prices.
12. Pages with impossible low-price hooks and hidden surcharge wording.

## Verification Script

Script: `scripts/source-trust-research/run-perplexity-r1.mjs`

Run only when a Perplexity key is intentionally available in the shell:

```powershell
$env:SOURCE_TRUST_RUN_LIVE = "1"
$env:PERPLEXITY_API_KEY = "<redacted>"
node scripts/source-trust-research/run-perplexity-r1.mjs
```

Output goes to `docs/foundation/source-trust-samples/` and records per-domain status, citations, search results, and outside-domain citation violations.

Current local status:
- R1 live verification completed with Tu-provided local `.env.local` key.
- Edge/provider wrapper now sends Perplexity domain and recency filters at the top level to match live enforcement behavior.
- R2 Edge config is implemented behind `KAEL_TRUST_PERPLEXITY_FILTER_ENABLED`.
- R2 staging provider smoke with the flag enabled produced `market_lookup` provider `perplexity`, model `sonar-pro`, `source_trust_enabled=true`, `search_domain_filter_count=20`, `search_recency_filter=month`, `latency_budget_ms=6000`, and fail-closed `insufficient_trusted_data`; the job still completed through baseline fallback and fixture cleanup returned all tracked counts to 0.
- The staging flag was restored to rollback-off after smoke while Q5/DeepSeek health was remeasured.
- F26 F5 created `source_trust_registry`, seeded 20 active Tier 1 domains, deployed `mobile-api` on staging, and verified 6 accepted citation artifacts in a staging audit window. Live Perplexity remains fail-closed when trusted data is insufficient.
- Registry maintenance rules now live in `docs/foundation/source-trust-maintenance.md`.

## Approval Gate

- [x] 20 domains verified with Perplexity API.
- [x] Candidate list prepared.
- [x] Untrust patterns documented.
- [x] Research script prepared.
- [x] R2 Edge config implemented behind rollback flag.
- [x] R2 staging smoke proves allowlist config reaches live Edge provider calls.
- [x] F26 R3 citations persisted in staging market artifacts.
- [x] F26 R4 citation quorum validator implemented and tested.
- [x] F26 R5 registry seeded and loaded from DB with decay.
- [x] F26 R6 LS1 outlier + weighted median aggregation implemented and tested.
- [ ] Production source-trust rollout approval.
