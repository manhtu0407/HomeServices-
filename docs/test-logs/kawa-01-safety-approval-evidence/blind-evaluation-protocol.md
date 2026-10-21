# Independent blind evaluation of the emergency classifier

Purpose: produce the one number that does not exist yet, recall on wording the implementer has not seen, plus the
false-alarm rate, reported separately. The harness and its tests are P415 (`kael-emergency-blind-eval-pillar.test.ts`,
`helpers/emergency-blind-eval.ts`). This protocol is the human side. The implementer does not write, read or tune against
the set.

## Roles

| Role | Who | May | May not |
|---|---|---|---|
| Reviewer | nominated by the owner; fluent in Vietnamese and English; took no part in writing the cues or the development sets | write or source the rows, seal them, register the hash, read the report, give category-level feedback | share row text with the implementer |
| Implementer | the agent or engineer who maintains the classifier | run the harness on the file the reviewer hands over, read the report (ids and counts only) | read the rows, write rows, edit the classifier toward individual misses |
| Owner | product owner | nominate the reviewer, approve thresholds, choose the follow-up (see `classifier-assessment.md`) | |

## What the set contains

Minimum, all rows labelled by the reviewer before any run:

| Stratum | Minimum rows |
|---|---|
| Positives per route: fire, medical, police, wiring or water, fuel gas | 40 each |
| Positives: unclear emergency | 30 |
| Negatives (ordinary requests, plus hard negatives: negated, past, hypothetical, prevention equipment, cooking smoke, refrigerant gas, maintenance wording, tone-mark look-alikes) | 200 |
| Judgement rows (labels the reviewer is unsure of) | any number; they are excluded from every rate |

Cover, inside each route: Vietnamese with tone marks, Vietnamese typed without them, English, mixed language; a typed
message, a speech-to-text transcript with recognition errors, an evidence summary, a booking description, a skip reason;
terse, panicked and fragmented wording, and long narratives with the hazard in one clause; typos, stretched letters, no
spaces, slang. Rows must not reuse a phrase from the development sets or the sealed set H5.

Why these sizes: with no misses, a 95 % Wilson interval puts the recall lower bound at 91.2 % for 40 rows, 95.0 % for 73
and 98.0 % for 189 (`zeroMissSampleFor` in the helper). Forty per route is the smallest size at which a clean result
means more than "probably above 90 %".

## Sealing

1. The reviewer writes `kael_emergency_blind_set.v1` JSON:

```json
{
  "schema": "kael_emergency_blind_set.v1",
  "reviewer_attestation": {
    "reviewer": "a role or pseudonym, no personal data",
    "author_is_implementer": false,
    "sealed_at": "ISO 8601 time",
    "sealed_sha256": "hash of the rows (below)",
    "source": "written fresh, or sampled from consented and redacted reports"
  },
  "rows": [
    { "id": "B-001", "text": "…", "expected": "fire | medical | police | electrical_water | gas | uncertain | null",
      "language": "vi | en", "kind": "clear | judgement", "service": "optional service type" }
  ]
}
```

2. `sealed_sha256` is the SHA-256 of `JSON.stringify(rows.map(r => [id, text, expected, language, kind, service ?? null]))`
   (`canonicalBlindHash` in the helper).
3. The reviewer sends that hash to the owner out of band (message, ticket or commit comment) **before** the file reaches
   the implementer. The file may not be edited afterwards.

## Running it

```bash
KAEL_EVALUATE_BLIND_SET=<path to the sealed file> \
KAEL_BLIND_REGISTERED_SHA256=<hash the owner received from the reviewer> \
KAEL_BLIND_EVAL_OUT=<path for the report> \
corepack pnpm --filter @nestscout/api exec vitest run kael-emergency-blind-eval
```

Without `KAEL_EVALUATE_BLIND_SET` the run is NOT_RUN, never a pass. The report names the sample, recall with its interval
(overall and per route), false alarms with their interval, the ids of misses, wrong routes and false alarms, any shortfall
against the minimum sizes, and `release_blocker`. It never contains a row's text.

A report is labelled `INDEPENDENT_BLIND` only when the reviewer attested that the author is not the implementer, the rows
match the sealed hash, and they match the hash registered out of band. Otherwise it is `NOT_INDEPENDENT` and always a
blocker.

## After a result

- Poor result: a safety release blocker. The data is not edited, re-weighted or re-selected.
- Feedback to the implementer is by category ("verbs of intrusion", "weights inside gas-cylinder phrases"), never by row.
- Any classifier change after a run needs a fresh set. A used set is a development set from then on.
- Record the number of evaluation rounds: repeated tries on selected sets bias the result upward.
- The proposed thresholds are in `PROPOSED_BLIND_THRESHOLDS` and carry `owner_approved: false` until the owner approves.

## Limits

T0 only: the rule classifier on text. It says nothing about speech-to-text quality on a device, about a model second
opinion, or about real customers. A pass supports a recall claim for the wording the reviewer sampled.
