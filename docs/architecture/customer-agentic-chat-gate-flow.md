# Customer Agentic Chat Gate Flow

Status: active execution spec for the customer Kael Chat conversion.

This file keeps the current Kael Chat conversion focused. It does not replace
`STRUCTURES.md`; it maps the approved customer screens into chat-native gates so
future work does not show every phase at once or block a screen before its card
replacement exists.

## Core Rule

Kael Chat is the orchestration surface. A legacy stage may be blocked only after
that stage has a compact chat-card equivalent with the same real-data contract.

Do not redirect a legacy route into Kael Chat just because it belongs to the same
workflow. Redirect only when the old screen has already been compressed into a
sequenced Case Work card.

## Gate Behavior

- Cards appear one at a time unless the previous card is informational only.
- Confirmation cards keep their actions inside the card footer.
- Confirmation cards must include `Xác nhận` and `Từ chối` or a specific
  equivalent action pair.
- When `Từ chối` is pressed, Kael asks for the reason inside that same card
  before moving to normal case conversation.
- Cards that do not require confirmation can enter after the previous card has
  completed its process-line animation.
- Process lines must run slowly enough to feel like Kael is preparing the next
  step, not dumping UI.
- Old stage titles do not render inside chat cards. The card title describes the
  task Kael is doing now.

## Current Compression Matrix

| Stage | Legacy route | Chat-card replacement | Route policy |
|---|---|---|---|
| 2.5 Case Work chat | `/kael-chat?screen=2.5-chat-case` | Case Work tab | Allowed as entry/fallback |
| 2.6 Case overview | `/history?screen=2.6-case-overview` | Case overview summary in Case Work | Redirect when a real job exists |
| 2.7 Matching | `/history?screen=2.7-matching` | Matching status card | Redirect when a real job exists |
| 2.8 Options | `/history?screen=2.8-options` | Options gate card | Redirect when a real job exists |
| 2.9 Quotes | `/history?screen=2.9-quotes` | Quote decision card | Redirect when a real job exists |
| 2.10 Location/ETA | `/history?screen=2.10-location-eta` | ETA tracking card | Redirect when a real job exists |
| 2.11 Live alert | `/history?screen=2.11-live-alert` | Live arrival alert card | Redirect when a real job exists |
| 2.12 Job accepted | `/history?screen=2.12-job-accepted` | Accepted-worker workboard card | Redirect when a real job exists |
| 2.13 Job progress | `/history?screen=2.13-job-progress` | Job progress/evidence card | Redirect when a real job exists |
| 3.1 Payment review | `/history?screen=3.1-payment-review` | Payment protection card in Case Work | Redirect with `focus=payment` when a real payment exists; keep inactive direct state when payment is missing |
| 3.2 Payment method | `/history?screen=3.2-payment-method` | Payment protection card in Case Work | Redirect with `focus=payment` when a real payment exists; keep inactive direct state when payment is missing |
| 3.3 Payment protected | `/history?screen=3.3-payment-protected` | Payment protection card in Case Work | Redirect with `focus=payment` when a real payment exists; keep inactive direct state when payment is missing |
| 5.2 Command center | `/profile?screen=5.2-command-center` | Command center, not Kael Orb chat | Keep direct profile utility route |
| 5.3 Approval queue | `/profile?screen=5.3-approval-queue` | Pending approval card in Case Work | Redirect with `focus=approval` when a real pending decision exists; keep inactive profile utility state when no decision exists |

## Required Sequence For 2.6-2.9

1. Case summary appears.
2. If the job has no attached current media, Kael shows the evidence gate.
3. The evidence gate accepts image, video, or voice.
4. The user confirms evidence or gives a short reason to continue without it.
5. Kael runs process lines and hydrates the real job again.
6. Matching/options/quote cards may appear only after the evidence gate finishes.
7. Quote approval remains a confirmation card; rejection asks for a reason in
   the card before opening Case Work conversation.

## Backend Boundary

The mobile UI must not write workflow-sensitive state directly to Supabase.

Allowed mobile actions:

- `uploadJobMediaDrafts(jobId, drafts, 'before')` for evidence upload.
- `workflow.actions.hydrateRemoteJobById(jobId)` after a gate completes.
- Existing workflow provider actions, such as `confirmRemoteSearch`, only as
  compatibility wrappers around the mobile-api boundary.

Not allowed:

- Direct Supabase workflow writes from UI cards.
- Fake estimates, fake workers, fake queues, fake prices, or fake payment state.
- Blocking legacy routes for stages that do not yet have a card replacement.

## Backend/UI Audit Notes

Current audit boundary:

- `KaelChatSurface` and `CustomerHistorySurface` use workflow/provider actions
  for workflow-sensitive transitions: `hydrateRemoteJobById`,
  `confirmRemoteSearch`, and `decideScopeChange`.
- Case evidence upload uses `uploadJobMediaDrafts(jobId, drafts, 'before')`.
  This is a Supabase Storage upload helper, not a direct workflow state write.
  The UI must hydrate through the workflow provider after the upload before
  showing the next card.
- Normal Kael Chat intake and evidence use `kaelChatService` /
  `kaelAssistantService`, which are mobile service boundaries. They must remain
  separate from Case Work cards until a real `job_id` exists.
- Payment card data is read from `deal.payment`, hydrated through the workflow
  provider from mobile-api job detail/list data. The payment card must not
  fabricate provider, QR, status, amount, fee, or payout values.
- `5.2` Command Center remains a profile utility and overview/control surface.
  It is not the Kael Orb chat entry and must not hide `/kael-chat`.

## Decision-Complete Evidence

This conversion is decision-complete only for the stages below. Do not infer that
later customer surfaces are compressed just because they belong to the same
workflow.

Locked by tests:

- Kael Orb / dock entry opens `/kael-chat`, not `/profile?screen=5.2-command-center`.
  Evidence: `customer-home-surface-test` checks `customer-v21-kael-accessory`.
- Legacy activity routes for `2.6` through `2.13` redirect to Case Work when a
  real job exists, and inactive/no-data states stay honest when no real job
  exists. Evidence: `customer-history-surface-test`.
- Evidence collection blocks matching/options/quote cards until the user either
  confirms media or gives a reason to continue without media. Evidence:
  `customer-kael-chat-surface-test`.
- Quote approval is a Case Work confirmation card. Reject keeps the reason flow
  inside the card before normal case conversation. Evidence:
  `customer-kael-chat-surface-test`.
- Payment `3.1` through `3.3` are compressed into a focused Case Work payment
  card only when real payment data exists. The payment focus must not show
  matching, options, quote, ETA, live alert, accepted-worker, progress, approval,
  or recommendation cards at the same time. Evidence:
  `customer-history-surface-test` and `customer-kael-chat-surface-test`.
- Approval `5.3` redirects to Case Work with `focus=approval` only when a real
  pending scope decision exists; otherwise the profile utility remains inactive.
  Evidence: `agentic-center-surface-test`.

Still not decision-complete:

- Any customer stage not named in the matrix above.
- Any new profile utility, payment-setting, address-setting, or post-completion
  surface unless its chat-card equivalent and route policy are added here first.
- Any backend schema or Supabase workflow write that bypasses `mobile-api`.

## Next Compression Order

1. Continue later customer surfaces only after their chat-card equivalent and route policy are explicit.

Each item must add tests for:

- old route still allowed until the card exists,
- old route blocked after the card exists,
- no bulk card dump,
- confirmation stays inside the active card,
- hydrate/real API boundary is used after the gate.
