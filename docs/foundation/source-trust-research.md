# Source Trust Research - Section 25 R1

Status: started, not approved for R2.
Date: 2026-05-26.
Plan ref: `Plan.md` Section 25.5.

## Scope

R1 verifies a maximum-20 Perplexity allowlist for Vietnamese/HCMC home-service market evidence. This document is the handoff artifact for Tu approval before Section 25 R2. Code-side citation rejection, source-trust registry, and blended price synthesis remain out of scope until R2-R6.

## API Constraints Verified

- Perplexity domain filters support allowlist mode when domains have no `-` prefix.
- The documented limit is 20 domains per request.
- Domains must be root domains without protocol, path, trailing slash, or `www`.
- Perplexity Sonar chat completion returns `citations` and `search_results`; Sonar search controls belong under `web_search_options`.
- Anthropic prompt caching uses `cache_control: { "type": "ephemeral" }`; usage reports cache creation/read token fields.

References:
- https://docs.perplexity.ai/docs/search/filters/domain-filter
- https://docs.perplexity.ai/api-reference/sonar-post
- https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

## Candidate Domains

These are candidates only. They are not approved Tier 1 sources until the Perplexity R1 script returns accessible, on-domain citations and Tu approves the final list.

| Domain | Category | Initial role | Status |
|---|---|---|---|
| btaskee.com | Marketplace | Cleaning/home service pricing | Candidate |
| btaskee.work | Marketplace | bTaskee public service pages surfaced in search | Candidate |
| jupviec.vn | Marketplace | Cleaning/housekeeping pricing | Candidate |
| rada.com.vn | Marketplace | Home repair marketplace | Candidate |
| anvui.com | Marketplace | Plan-listed marketplace candidate | Candidate |
| 247shome.com | Service provider | Home service pricing, verify existence | Candidate |
| service.vn | Directory | Yellow-pages style fallback | Candidate |
| tuoitre.vn | News | Public news cross-check, not primary pricing | Candidate |
| vnexpress.net | News | Public news cross-check, not primary pricing | Candidate |
| thanhnien.vn | News | Public news cross-check, not primary pricing | Candidate |
| dienmayxanh.com | Retail/service knowledge | Appliance/electrical context, not primary pricing | Candidate |
| suachuatainha.com.vn | Service provider | Electrical/plumbing public price pages surfaced in search | Candidate |
| thopro.vn | Service provider | Electrical repair public price page surfaced in search | Candidate |
| tktclean.com | Cleaning provider | Apartment cleaning pages surfaced in search | Candidate |
| cleanipedia.com | Cleaning knowledge | Safety/process reference, not primary pricing | Candidate |
| cleanhouse.com.vn | Cleaning provider | Cleaning service candidate | Candidate |
| hoanmyclean.vn | Cleaning provider | Cleaning service candidate | Candidate |
| vesinhnhaviet.vn | Cleaning provider | Cleaning service candidate | Candidate |
| guvico.com | Marketplace | Home cleaning app/provider candidate | Candidate |
| 6ixgo.com | Local listing | Backup only; likely lower trust than provider sites | Candidate |

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
- `PERPLEXITY_API_KEY` is not present in this Codex shell.
- Perplexity R1 live calls were not run in this batch.
- R2 remains blocked until live R1 output exists and Tu approves the final 20-domain list.

## Approval Gate

- [ ] 20 domains verified with Perplexity API.
- [x] Candidate list prepared.
- [x] Untrust patterns documented.
- [x] Research script prepared.
- [ ] Tu approval before R2.
