# Compatibility and rollback

Everything here is one commit on top of `8a03e780`, pushed to the same branch (PR #403) at the owner's request so it can be reviewed. Nothing was merged or deployed.

## What did not change

| Surface | Status |
|---|---|
| Request and response schemas, the error envelope, SSE payloads | unchanged; no file under `supabase/functions/_shared/contracts/**`, `packages/shared/src/contracts/**` or `packages/shared/src/types/database/**` is touched |
| Database | no migration, RPC, trigger, policy, index or generated type; nothing written to a hosted database |
| Mobile app (`apps/mobile/**`) | untouched; no new build is needed |
| Environment, flags, secrets, dependencies, lockfile | untouched |
| The classifier (`emergency-guidance.ts`, `emergency-signal-text.ts`) and the sealed set `sealed-h5.json` | byte-identical to `8a03e780` |
| Locked docs, `scripts/harness/*`, `supabase/migrations`, earlier evidence folders | untouched |

## Observable behaviour changes (all in `supabase/functions/mobile-api/_shared`)

| Route | Request | Before | After |
|---|---|---|---|
| `POST /kael/chat` (new Case) | emergency text with an invalid schedule | 400 `VALIDATION` with the guidance in front of the message (shown as generic copy by the app) | 201 ordinary chat reply with the guidance; the schedule is applied nowhere and the analysis is deferred |
| `POST /kael/chat` with `session_id`, with or without a typed message | same | 400 | 201 chat |
| `POST /kael/chat/:id` and `/stream` | emergency text with an invalid schedule, open Case, owner | 400 | 200 chat (the stream route calls the same function) |
| same | same, closed Case | 4xx with the guidance in front | unchanged; no write |
| same | same, another customer or a missing Case | plain refusal | unchanged |
| any of the above | invalid schedule, no emergency | 400 | unchanged |
| `POST /kael/assistant`, `customer_case` surface | emergency text on a job in a closed status | 409 `INVALID_STATUS` | 200 with the guidance |
| `POST /kael/assistant` | emergency text with the quota spent | 429 | 200 with the guidance; quota not consumed |
| `POST /kael/assistant` | any text, job in a closed status or quota spent, no emergency | 409 / 429 | unchanged (409 first, then 429) |
| `POST /me/kael/conversations/:id/turn`, `/stream` | emergency text | paid summary, paid web search, stored-context read and image consumption ran first | none of them runs for a clear report; a report that depends on the service still reads the stored conversation; images in an emergency turn are not consumed |
| `POST /kael/chat/:id/intake-confirmation` and the evidence routes | called as an admin | accepted; a turn written as the customer | 403 `AUTH_FORBIDDEN`, nothing written |
| `POST /jobs/:id/accept` and `/decline` | called as an admin or a customer | reached the RPC / query (SQL actor binding stopped the effect) | 403 `AUTH_FORBIDDEN` before any database call |

Anything not in this table behaves as before. The success response shape of every route above is the existing one; the
only status changes are 4xx or 429 → 2xx for an emergency report, and an accepted admin call → 403.

## Existing clients

The shipped app renders a 2xx reply and shows fixed copy for any failure, so it needs no change to show the new
replies. A customer who reports an emergency with an invalid schedule now sees the guidance instead of the schedule
error. Rows written by the new paths are ordinary chat and Case rows of the shape the previous closure already
writes for an emergency, so the old code reads them.

## Evidence that rolling back is safe

`red-green/rollback-full-suite-on-baseline-sources.txt`: the 13 production files were put back to `8a03e780`
and the **whole** API suite was run with the current tests. 3,412 tests: 3,336 passed, 6 pending, 70 failed, and the 70
are exactly the rows of the four pillars that pin the new behaviour (P411 3, P412 31, P413 8, P414 28). No other test
depends on the new code, and no test written before this task needs it. The working files were then restored
byte-identical.

Three expectations in P411 were changed on purpose. They are the rows that pinned the 400-with-guidance answer for an
emergency over an invalid schedule: a typed message on the turn route, a voice-evidence turn, and a new Case. They now
expect a 2xx reply. Each keeps what it asserted about the guidance and the model, and adds what the new behaviour
promises: the typed-message row asserts the route, the `114` guidance text, exactly the customer and Kael turns written,
no schedule stored and no model call; the voice-evidence row asserts the route, the `114` text and no model call (the
last two were added after the first red/green run, so they are stricter than the row they replace); the new-Case row
asserts one Case, the route, no schedule, no model call and that the only write outside the Case rows is the customer's own
transcript. The old "writes nothing" assertion no longer applies because an ordinary reply writes the two turns; "no Job,
quote, match, payment or consent" for these routes is asserted in P412 and P414.

## Rollback

There is no data rollback: no schema, row format or contract changed. To roll back, revert the commit that carries this
package. That is a new commit: history is not rewritten, and the new pillars and this folder go with it. For the owner,
after separate authorization (not run here):

```bash
git revert <commit-that-carries-this-package>
```

The file-level equivalent is `git restore --source=8a03e780` on the 13 production files, the one line in
`apps/api/scripts/kael-playbook-eval.mjs` and the changed tests and docs. Restoring only the sources while keeping the new
pillars makes those four pillars fail, which is the intended signal.

## Conflict with main (PR #403)

Not resolved: a merge or rebase was not authorized. Against main `111988b0` the branch conflicts only in
`.claude/MEMORY.md` and `docs/memory/2026-10.md`, which are session-memory files written at the owner's approval. There is
no pillar-id collision (this task uses P411–P415, which are unused on main). The only other file both sides touch is
`governance/protocols/test-pillars.md`, which is generated by `node scripts/harness/pillar-registry.mjs --write` and is
regenerated after the merge.
