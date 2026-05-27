# Q3 Provider Failure Root Cause - Plan 26 F4

Date: 2026-05-26
Scope: Plan 26 F4 provider success regression investigation

## Finding

The F3 staging baseline produced provider success `0.9174` with 10 failures out of 121 provider rows.

Failure breakdown:

```text
failure_count=10
failure_rate=0.0826
by_error_code={"AI call failed: HTTP_400":10}
by_purpose_provider={"vision_analysis:anthropic":10}
```

All failures came from the F3 baseline photo fixture path, not from DeepSeek intent, Perplexity market lookup, or the direct purpose probes.

## Root Cause

The Q1.5 baseline harness used a Wikimedia thumbnail URL as the fixture photo. Anthropic returned HTTP 400 for those `vision_analysis` requests when Edge passed the URL image block through the Messages API.

This is a harness-input problem: the current Anthropic Messages examples document URL image source support, and their example uses a canonical Wikimedia original image URL. The harness should use a stable original image URL for vision smoke instead of a thumbnail transform URL that can be rejected by the provider fetch/validation path.

Source: https://docs.anthropic.com/en/api/messages-examples

During the fix pass, direct Anthropic URL-image checks showed public image URLs can still be rejected by provider-side download and robots policies. The production-safe fix therefore moved URL fetch responsibility into Edge: Edge fetches allowed image URLs, converts them to base64 image blocks for Anthropic, and skips vision safely when no image can be fetched.

## Fix

`supabase/functions/mobile-api/_shared/kael/vision.ts` now converts fetchable image URLs to base64 before the Anthropic call. `apps/api/scripts/kael-q1-baseline.mjs` now uses a small fetchable image fixture URL:

```text
https://placehold.co/64x64.jpg
```

No provider routing was changed.

## Verification Plan

Ran the staging baseline with 100 jobs after the Edge and fixture update:

```text
Q1_SAMPLE_SIZE=100
Q1_USE_PHOTOS=1
Q1_PURPOSE_PROBES=1
```

Acceptance:

- provider success rate `0.9548`, meeting the `>= 0.95` target
- `vision_analysis:anthropic` no longer reports the HTTP 400 fixture download pattern; residual optional vision rows timed out at the existing 4.5s vision budget
- cleanup counts returned to `0`

Final failure pattern:

```text
failure_count=10
failure_rate=0.0452
by_error_code={"TIMEOUT":10}
by_purpose_provider={"vision_analysis:anthropic":10}
```

This closes the Plan 26 F4 success-rate gate. Further lowering optional vision timeout rows is a separate latency/SLO tuning task, not a blocker for the F4 `>= 0.95` provider success target.
