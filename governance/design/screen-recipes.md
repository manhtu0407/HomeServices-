# Design Reference — Screen Recipes (App Shell → Empty States)

> Extracted from `design.md` for progressive disclosure (2026-05-29). `design.md` core keeps the authority order, identity, goal, preflight, skill-adaptation, scoring rubric, RN rules, forbidden defaults, and review checklist. Load this file only when the task needs it (see design.md → Design Reference Files). `critical.md` remains highest execution authority.

Load when building a specific surface: app shell, Customer Home, Booking/Price Check, Worker Home, Worker Job Request, Kael Chat, Profile, Activity/History, Modal/Bottom Sheet, Skeleton, Empty State.

## 14. App Shell Recipe

The app shell should learn from XanhSM's polished service-app skeleton.

Required shell qualities:

- native mobile first,
- bottom navigation always clear,
- center Kael action prominent,
- active tab visually distinct,
- light glass/material effect allowed when performance permits,
- no web-style sidebar/dashboard shell,
- safe-area aware,
- keyboard aware,
- accessible touch targets.

Customer bottom tab candidate:

```text
Home
Activity / History
Kael / Price Check
Chat / Support or Jobs depending phase
Profile
```

Worker bottom tab candidate:

```text
Home
Jobs
Kael / Brief
Earnings
Profile
```

Final labels must follow `STRUCTURES.md` and Vietnamese user-facing copy rules.

## 15. Customer Home Recipe

Customer Home should combine address/search structure with Kael as the primary product action.

Preferred direction:

```text
XanhSM-like address/search skeleton + NestScout Kael Price Check CTA.
```

Anatomy:

- safe-area app header,
- apartment/address context,
- search or Kael input affordance,
- Kael Price Check primary CTA,
- service entries for the six approved services,
- active draft / active booking summary when present,
- useful trust or estimate note,
- promotional content only when it supports service conversion,
- bottom tab with Kael center action.

Rules:

- do not make Home a marketing landing page,
- do not overcrowd service catalog,
- only the six approved services are active (`governance/RULES.md` #6),
- future-service entries must stay hidden unless Tu explicitly approves a specific non-functional state,
- address context must be visible but not dominate,
- Kael should feel like the guide into price check.

## 16. Booking / Price Check Recipe

The booking flow is the core transaction path.

Required workflow mapping:

- A2 service/problem selection,
- A3 description/media,
- A4 clarification,
- A5 price estimate,
- A6 time selection,
- A7 booking search confirmation.

Design qualities:

- clear step progression,
- low anxiety,
- high trust,
- visible price disclaimer,
- no exact price guarantee,
- no hidden confirmation,
- no autonomous money-impacting action.

Visual recipe:

- soft mint/cream surface,
- focused cards,
- strong but not oversized CTA,
- clear selected state,
- Kael guidance visible but not verbose,
- estimate card visually distinct,
- confirmation hard-stop before broadcast.

## 17. Worker Home Recipe

Worker Home shares the brand system but is more operational.

Anatomy:

- availability state,
- today's jobs,
- earnings summary,
- incoming job card,
- Kael brief entry,
- status timeline,
- job tabs/list,
- profile/verification state.

Rules:

- worker actions must be quick and obvious,
- countdown states must be visually strong,
- full customer address must not show before accept,
- Kael mascot may appear in brief/support contexts,
- do not make worker app feel like an admin dashboard.

## 18. Worker Job Request Recipe

The worker job request is a high-speed decision screen.

Required content:

- service type,
- general district/area,
- problem summary,
- Kael pre-brief,
- estimated earning,
- countdown,
- accept,
- decline/skip.

Forbidden before accept:

- full address,
- unit number,
- customer phone,
- exact customer identity details.

Motion:

- countdown should be calm but visible,
- accept press should give strong feedback,
- expiry should transition clearly to expired/next state.

## 19. Kael Chat Recipe

Kael Chat must feel like a product surface, not a generic chatbot.

Anatomy:

- Kael header with mascot,
- customer message bubbles,
- Kael system/guidance bubbles,
- media attach affordance when applicable,
- clear input area,
- safe keyboard behavior,
- loading/thinking state,
- structured estimate rendering when relevant.

Rules:

- no raw AI output to users,
- Vietnamese user-facing text,
- Kael scope limited to electrical/plumbing/cleaning NestScout intake, price check, worker brief, and approved support roles,
- no autonomous booking/payment/cancel action,
- critical actions must route to explicit confirmation screens.

Motion:

- message appear can fade/translate lightly,
- Kael thinking can use mascot micro-motion,
- no distracting looping assistant animation while user reads.

## 20. Profile / Account Recipe

Profile should feel clean and premium even with dense lists.

Learn from XanhSM:

- top identity card,
- mint/green status card,
- quick action tiles,
- grouped list sections,
- light dividers,
- small line icons,
- restrained banners,
- low-noise scroll.

NestScout adaptation:

- apartment profile,
- saved addresses,
- payment placeholder later,
- support,
- worker verification if worker app,
- settings,
- Kael preferences only if approved.

Avoid:

- web dashboard panels,
- heavy nested cards,
- too many promo blocks,
- decorative clutter.

## 21. Activity / History Recipe

Activity and History should prioritize operational clarity.

Anatomy:

- segmented filter tabs,
- active/pending/completed/failed states,
- job cards,
- service icon,
- date/time,
- price range/final price when allowed,
- status,
- retry/rebook action when relevant.

Rules:

- empty state must be designed, not blank,
- empty state may use Kael or service illustration,
- cancelled/failed states must be explicit,
- no fake successful booking/payment states.

## 22. Modal / Bottom Sheet Recipe

Bottom sheets and modals are core to the XanhSM-like motion grammar.

Use for:

- rating prompt,
- confirmation,
- scope change,
- saved address,
- payment method,
- media permission,
- worker accept details when appropriate.

Rules:

- scrim behind sheet,
- rounded top corners,
- clear title,
- clear primary and secondary actions,
- no hidden destructive action,
- explicit confirmation for money-impacting actions,
- accessible dismiss behavior unless it is a hard-stop confirmation.

Motion:

- sheet slides from bottom,
- scrim fades in,
- content settles without bounce excess,
- dismiss reverses cleanly.

## 23. Skeleton / Loading Recipe

Skeletons are mandatory for content that loads asynchronously.

Learn from XanhSM:

- skeleton blocks match final layout,
- shimmer is low contrast,
- loading feels like real structure is arriving,
- skeleton does not replace error handling.

Rules:

- no fake content,
- no silent failure,
- no spinner-only for major content,
- show retry/error when loading fails.

## 24. Empty State Recipe

Empty states must be useful and visually polished.

Anatomy:

- illustration or Kael mascot,
- short Vietnamese explanation,
- primary action,
- optional secondary action,
- no blame language.

Examples:

- no booking yet,
- no worker job yet,
- no history,
- no saved address,
- no payment method,
- no available worker.

Empty state must not look like a generic placeholder from a web template.

