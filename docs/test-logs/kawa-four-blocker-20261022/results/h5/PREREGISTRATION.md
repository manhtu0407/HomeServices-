# H5 standard evaluation - acceptance rule and data provenance

Written before the fresh probe set was scored. Honest disclosure: the file was committed with the evidence, not timestamped
by a third party, and the harness was run twice before this note was written (first run: the harness ignored the `service`
field of 11 development rows; the 92 fresh rows scored identically in both runs).

## Data, kept apart

| Tier | Rows | Origin | Status |
|---|---|---|---|
| development-h1..h4 `kind: clear` | 267 (154 hazard, 113 not) | hand-written development sets already used to build the classifier | previously used development data |
| development-h1..h4 pinned (`currently` / `disputed`) | 31 | contestable phrasings pinned to today's behaviour by P410 | reported, never counted in a rate |
| `fresh-probes-20261022.json` | 92 (57 hazard, 35 not) | written for this evaluation, sha256 `f5dfc6f4cdf877b221b43776b5cddefaaeb08fd2200bb7083549d24b1172cf86` | newly written, scored once, not adjusted to |
| sealed H5 | 63 | sealed | not read, not run, not copied |

The fresh probes become development data the moment they are scored; they are not independent evidence and are not a holdout.

## Rule for STANDARD_T0_PASS (all must hold)

1. Development tier: every `clear` row routes as labelled (0 false negative, 0 false positive).
2. Parity: classifier route and handler route are identical with every playbook flag off and on, and the flag never drops an emergency number the other state delivered.
3. Guidance: every detected hazard reaches the customer with the numbers of its route in the real handler.
4. Time: classification stays bounded (reported for normal rows and for inputs capped at the 5000-character field limit).
5. Fresh probes: 0 false positives and at least 90 percent recall of the hazard rows, misses itemised.

Any failed item is STANDARD_T0_FAIL for that item; the overall result is the worst item. No claim of real-world recall, production
reliability or statistical generalisation is made by either outcome.
