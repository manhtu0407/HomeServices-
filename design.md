# Home Services Design Operating System

This file is the mandatory design execution contract for AI coding agents working on Home Services UI.

It exists because generic AI-generated frontend design tends to collapse into SaaS dashboards, bento grids, decorative gradients, card spam, or landing-page composition. Home Services must not inherit that default. The app must feel like a polished Vietnamese mobile service product with its own taste, identity, motion, and mascot system.

This file is locked after creation. AI agents MUST NOT edit `design.md` unless Tu explicitly requests that edit in the current conversation.

## 0. Authority Order

Agents MUST read files in this order for UI, frontend, prototype, visual, motion, mascot, layout, or design-system tasks:

```text
critical.md
design.md
RULES.md
STRUCTURES.md
CLAUDE.md when ambiguity exists
Relevant code/tests/docs
```

`critical.md` remains the highest execution authority.

For design direction, `design.md` overrides older UI/design direction in README, MEMORY, historical prototype docs, deleted prototype notes, and old session logs. Those documents remain historical context only.

If `design.md` conflicts with `critical.md`, `RULES.md`, `STRUCTURES.md`, or Tu's current request, stop and report:

- the conflicting instructions,
- the UI/product risk,
- 2-3 options,
- the recommended option.

Do not proceed until Tu approves the direction.

## 1. Design Identity

Home Services design direction:

```text
XanhSM-inspired Professional Mint Service UX
```

Meaning:

- professional service-app polish, not SaaS dashboard polish,
- mint / mint-green / soft cyan as the leading exploration space,
- cream / warm white as a possible warmth layer,
- premium but approachable,
- light but memorable,
- friendly without becoming childish,
- operational enough for real repair jobs,
- mascot-driven enough to create brand recall,
- mobile-first for React Native store-bound apps.

The design should feel closer to XanhSM than to bTaskee, Grab, or generic AI SaaS UI. bTaskee remains useful for mascot/tab references. Grab remains useful for operational clarity. XanhSM is the primary reference for polish, color harmony, typography rhythm, skeleton, and motion.

Do not copy XanhSM brand, assets, exact colors, vehicle visuals, promotion strategy, or transport-specific hierarchy. Learn the system, not the skin.

## 2. Design Goal

The design goal is not "modern UI".

The design goal is:

```text
Make Home Services feel like a real, polished, trustworthy Vietnamese mobile service app where color, typography, layout, decoration, and motion belong to the same product.
```

Every major screen must satisfy five linked qualities:

- color harmony,
- typography fit,
- layout polish,
- decoration restraint,
- motion fit.

These qualities must be designed together. Never choose palette alone. Never choose layout alone. Never add motion after the fact. Never use decoration to hide weak structure.

## 3. Reference App Method

Use reference apps as design evidence, not as copy targets.

### Primary Reference: XanhSM

Learn from XanhSM:

- soft white / mint / cyan environment,
- premium but friendly typography rhythm,
- app-shell skeleton that feels native and service-oriented,
- glassy bottom navigation with a central/emphasized action zone,
- rounded service cards with useful imagery,
- small decorative gradients that support hierarchy,
- content cards with light shadows and low visual noise,
- skeleton loading before content appears,
- scrim + modal / bottom sheet choreography,
- subtle active-tab glow / morph,
- state transitions that make the app feel finished,
- profile/account pages that stay clean even when content is dense,
- spacing that lets dense service content remain breathable.

Do not copy from XanhSM:

- exact brand green,
- vehicle assets,
- transport-first map hierarchy when it does not serve Home Services,
- exact promotion layouts,
- exact icons,
- exact copy,
- exact card art,
- exact tab labels,
- exact animation timings unless validated for Home Services.

### Secondary Reference: bTaskee

Learn from bTaskee:

- mascot as product recall,
- central tab mascot treatment,
- warm service-app friendliness,
- service grid familiarity for Vietnamese users,
- customer community / support patterns when useful.

Do not copy:

- orange-led brand system,
- overly playful mascot tone,
- broad service catalog complexity,
- crowded promo-heavy home layout.

### Secondary Reference: Grab

Learn from Grab:

- service workflow clarity,
- quick action orientation,
- operational state handling,
- trip/job status clarity,
- speed and action-first structure.

Do not copy:

- generic super-app sprawl,
- map-first assumptions,
- aggressive green dominance if it harms Home Services taste.

## 4. Product Surfaces

This design system applies to both:

- customer app,
- worker app.

The worker app must use the same brand language and Kael mascot system as the customer app. It can be more operational, but it must not feel like a separate product.

Customer design emphasis:

- trust,
- price check,
- booking confidence,
- apartment address context,
- friendly guidance,
- visible confirmation for money-impacting decisions.

Worker design emphasis:

- job clarity,
- accept/decline decisions,
- countdowns,
- earnings,
- task status,
- Kael brief support,
- professional operational rhythm.

## 5. Mandatory Design Preflight

Before any UI implementation, prototype, design lab, or visual refactor, agents MUST produce this short preflight:

```text
Design task:
Target surface:
Workflow step:
Primary user emotion:
Primary action:
Reference extraction:
Skill adaptation:
Design lab requirement:
Motion requirement:
Forbidden defaults:
Acceptance gate:
```

Do not edit UI files before this status.

If the UI task lacks style details, do not invent a generic "beautiful modern UI". Use this file, then ask Tu 1-3 focused questions if the design still cannot be determined.

## 6. Skill Adaptation Protocol

AI design skills are broad and biased by their training. Agents MUST adapt them before use.

Before UI work, list:

```text
Base skill:
What it is good for:
What must be adapted for Home Services:
What must be ignored:
Screen-specific variant:
```

Examples:

```text
Base skill: ckm:design-system
Good for: tokens, component specs, states, variants.
Adapt for: React Native mint/cream service-app tokens.
Ignore: generic web token defaults that push SaaS dashboards.
Variant: HomeServices mobile service token system.
```

```text
Base skill: ckm:ui-styling
Good for: layout, accessibility, component polish.
Adapt for: React Native screens and native mobile constraints.
Ignore: shadcn/Tailwind/web dashboard assumptions.
Variant: Mobile-first RN screen composition.
```

```text
Base skill: ckm:design
Good for: brand identity, mascot, icon, visual language.
Adapt for: Kael butler mascot and home repair service identity.
Ignore: banner/social/CIP/landing-page bias unless Tu asks.
Variant: Home Services mascot-led mobile product identity.
```

Agents MUST NOT apply a generic skill literally. Convert basic skills into screen-specific variants.

## 7. Design Lab Rule

Design lab is mandatory before major screens and major visual systems.

Major screens include:

- Customer Home,
- Customer Booking / Kael Price Check,
- Kael Chat,
- Customer Activity / History,
- Customer Profile,
- Worker Home,
- Worker Job Request,
- Worker Active Job,
- Worker Earnings,
- core bottom navigation,
- mascot system,
- global visual tokens.

Design lab output is required before production build.

Temporary runtime experiments live in:

```text
.tmp/design-lab/
```

Durable decisions live in:

```text
docs/design/
```

Production app files MUST NOT import from `.tmp/design-lab/`, `docs/design/`, prototype routes, or throwaway mockups.

### Design Lab Options

For major screens, create at least three options:

```text
Option A: Safe
Option B: Balanced
Option C: Bold
```

Each option must define:

- layout skeleton,
- palette treatment,
- typography direction,
- decoration treatment,
- motion treatment,
- component anatomy,
- what was learned from XanhSM,
- what is original to Home Services,
- risks.

Do not build production UI until Tu accepts a direction.

### Design Lab Evidence Package

Each major design lab must include evidence, not only taste descriptions.

Required evidence:

```text
Reference frames:
What was extracted:
What was rejected:
Home Services adaptation:
Palette treatment:
Typography treatment:
Motion treatment:
React Native feasibility:
```

When using a video reference, include timestamps or frame names when available. When using screenshots, identify the exact screen region being studied, such as bottom tab, skeleton, service card, profile list, modal, or transition state.

Agents must separate observation from interpretation:

```text
Observation: XanhSM uses a mint/cyan glow behind the service shell.
Interpretation: Home Services can use a restrained mint material layer behind Kael Price Check.
Adaptation: Use a smaller, softer mint layer tied to address/search and Kael CTA, not a transport map glow.
```

Do not claim a reference was audited if no frame, screenshot, recording, or concrete source was inspected.

### Design Option Output Template

Each option must be presented in this format:

```text
Option name:
Best for:
Layout skeleton:
Color system:
Typography:
Decoration:
Motion:
Kael mascot use:
Customer impact:
Worker impact:
Production feasibility:
Risks:
Scores:
Recommendation:
```

Avoid vague labels like "modern", "clean", or "beautiful" unless they are backed by component, color, spacing, and motion decisions.

### After Acceptance

After Tu accepts a design direction:

1. Write a short production design contract in `docs/design/`.
2. Update `design.md` only if the decision becomes a durable global rule.
3. Build production UI.
4. Delete or ignore temporary lab artifacts.
5. Add static guards when needed to prevent prototype/lab imports.

Prototype code is not design memory. Durable contracts are design memory.

### Production Design Contract Template

Before production implementation of a major accepted screen, write a short contract in `docs/design/` using this template:

```text
Screen:
Workflow mapping:
Accepted option:
User emotion:
Primary action:
Layout anatomy:
Component list:
Color rules:
Typography rules:
Decoration rules:
Motion rules:
Loading/empty/error/success states:
Accessibility/touch rules:
Backend/state dependency:
Forbidden regressions:
Verification plan:
```

The production design contract is the handoff from taste exploration to implementation. Production code should follow the contract, not the temporary design lab artifact.

## 8. Design Scoring Rubric

Every major option must be scored before presentation.

```text
Color harmony: /10
Typography fit: /10
Layout polish: /10
Decoration restraint: /10
Motion fit: /10
Home Services identity: /10
XanhSM learning without copying: /10
React Native feasibility: /10
Workflow correctness: /10
```

Minimum gates:

- Color harmony must be 8/10 or higher.
- Typography fit must be 8/10 or higher.
- Layout polish must be 8/10 or higher.
- Motion fit must be 8/10 or higher when motion is part of the task.
- Workflow correctness must be 10/10 for money-impacting screens.

If an option fails these gates, revise it before showing it as a serious candidate.

### Quality Failure Modes

An option fails the quality audit if:

- the palette looks attractive alone but weak inside the real screen,
- the typography feels copied from a web SaaS template,
- the layout is made from repeated cards without a clear hierarchy,
- decoration is present but does not explain service, state, trust, or action,
- motion is added everywhere instead of at key transitions,
- XanhSM is copied visually instead of translated structurally,
- Kael appears as a toy instead of a family assistant,
- worker screens feel like a generic admin dashboard,
- customer screens feel like a marketing landing page,
- the design cannot be built cleanly in React Native,
- loading, empty, error, success, retry, and confirmation states are missing,
- money-impacting screens do not make the explicit confirmation obvious.

When a failure mode is found, revise the option before production implementation.

## 9. Palette Lab

Do not lock final colors too early. Palette must be proven in screen context.

Required initial palette families:

```text
Palette A: Mint primary + white surface + cream warmth
Palette B: Cream base + mint action + soft cyan depth
Palette C: Premium mint gradient + neutral white/gray structure
```

Rules:

- Mint is the leading brand exploration.
- Cream is allowed as warmth, not as a beige app theme.
- Cyan is allowed for depth and premium glow.
- Accent colors must be sparse.
- Warning, price uncertainty, and urgent states may use restrained warm accents.
- Do not make the app one-note mint.
- Do not use purple/blue AI SaaS gradients.
- Do not use orange as primary unless Tu explicitly redirects.
- Do not use decorative glow unless it supports hierarchy.

Color must match:

- typography weight,
- service imagery,
- mascot treatment,
- motion,
- card material,
- app state.

If color looks good alone but not inside the screen, reject it.

## 10. Typography Lab

Do not lock one font direction yet. Major screens must test 2-3 typography directions before final lock.

Required typography directions:

```text
Option A: Rounded modern
Option B: Neutral premium
Option C: Geometric clean
```

Rounded modern is a strong candidate and should remain an important reference.

Typography rules:

- Vietnamese readability is mandatory.
- Do not use typography that feels rigid enterprise.
- Do not use typography that feels childish.
- Do not use typography that feels generic SaaS.
- Do not overuse heavy bold weights.
- Use strong headings sparingly.
- Compact operational screens need clear hierarchy, not oversized type.
- Labels, prices, service names, and status text must fit on small mobile screens.

Typography acceptance:

- feels premium but approachable,
- supports Vietnamese diacritics cleanly,
- remains legible at mobile sizes,
- works with mint/cream palette,
- does not overpower mascot or service cards.

## 11. Decoration System

Decoration must be useful, restrained, and product-specific.

Allowed decoration families:

- Home repair service illustrations,
- apartment / building / home context,
- electrical, plumbing, and cleaning pictograms,
- abstract mint / cream / cyan material layers,
- Kael mascot,
- service icons,
- subtle brand glows,
- small material highlights tied to hierarchy.

Forbidden decoration:

- random gradient orbs,
- bokeh blobs,
- decorative SVG scenes that do not explain the product,
- SaaS bento cards as default,
- busy marketing hero compositions,
- stock-like imagery that does not reveal service context,
- excessive banners,
- decoration that competes with the primary action.

Decoration must answer one of these:

- What service is this?
- What state is this?
- What action is important?
- What should feel trusted?
- What should feel friendly?
- What should feel premium?

If decoration answers none of these, remove it.

## 12. Kael Mascot System

Kael is the family assistant.

Mascot direction:

```text
Hybrid mascot with a butler-like identity.
```

Kael should feel:

- helpful,
- calm,
- smart,
- premium,
- approachable,
- slightly charming,
- not childish,
- not robotic in a cold way,
- not a generic AI orb.

Recommended visual direction:

- recognizable head / face as the primary icon,
- small vest or butler cue,
- simple shape language for animation,
- expressive enough for chat and empty states,
- clean enough for bottom tab at small size.

Kael appears in:

- center bottom tab / main action,
- Kael Chat,
- price-check guidance,
- loading / thinking states,
- empty states,
- worker brief support,
- critical explanation moments.

Kael must not:

- replace explicit user confirmation,
- feel like a toy,
- dominate every screen,
- auto-loop loudly,
- become a generic chatbot avatar.

## 13. Motion Grammar

Motion is required only at key product moments. Less motion, higher quality.

Required motion areas:

- splash / loading,
- skeleton loading,
- bottom tab / Kael mascot,
- primary CTA,
- modal / bottom sheet,
- screen transitions for major flows,
- selected service / selected chip,
- job state transition when useful.

Forbidden motion:

- noisy auto-loop on normal screens,
- decorative motion that does not communicate state,
- hover-only web motion,
- heavy parallax,
- slow transitions that block workflow,
- unrelated effects per component.

Recommended timing ranges:

```text
Screen enter: 180-260ms, opacity 0 -> 1, translateY 8 -> 0
Tab switch: 160-240ms, active glow/lift/scale only
Press feedback: scale 0.97-0.99, return within 120-180ms
Bottom sheet: 220-320ms, slide up + scrim 0 -> 0.40/0.45
Modal: 180-260ms, scale 0.97 -> 1 + opacity
Skeleton shimmer: 1200-1600ms loop, low contrast
Mascot reaction: 180-300ms, small lift/breathe, no noisy loop
CTA success: 180-260ms, soft fill or check transition
```

Motion acceptance:

- feels subtle but expensive,
- reinforces hierarchy,
- matches palette and material,
- gives feedback after user action,
- never hides latency dishonestly,
- works on low-end devices.

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
XanhSM-like address/search skeleton + Home Services Kael Price Check CTA.
```

Anatomy:

- safe-area app header,
- apartment/address context,
- search or Kael input affordance,
- Kael Price Check primary CTA,
- service entries for electrical, plumbing, and cleaning,
- active draft / active booking summary when present,
- useful trust or estimate note,
- promotional content only when it supports service conversion,
- bottom tab with Kael center action.

Rules:

- do not make Home a marketing landing page,
- do not overcrowd service catalog,
- only electrical, plumbing, and cleaning are active,
- disabled future services must not act as real services,
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
- Kael scope limited to electrical/plumbing/cleaning Home Services intake, price check, worker brief, and approved support roles,
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

Home Services adaptation:

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

## 25. Icon System

Icons must support service recognition.

Preferred icon style:

- rounded,
- clear,
- lightly dimensional when useful,
- consistent stroke/fill logic,
- recognizable at mobile sizes,
- works with mint/cream palette.

Electrical and plumbing icons must be distinct and instantly recognizable.

Avoid:

- generic outline icons without product character,
- filled blobs,
- random mixed icon packs,
- icons that become unclear at 24-32px.

## 26. React Native Implementation Rules

Production UI is React Native / Expo first.

Rules:

- no production dependence on web-only design systems,
- no shadcn/Tailwind assumptions in mobile code,
- no hover-only interaction,
- touch targets must be accessible,
- keyboard behavior must be considered,
- safe areas must be handled,
- slow network states must be designed,
- permissions must be designed when media/camera is involved,
- animation must be feasible with RN primitives or approved libraries.

If a design cannot be implemented cleanly in RN, revise the design before production build.

## 27. Forbidden AI Defaults

These are forbidden unless Tu explicitly approves a narrow exception:

- generic SaaS landing page,
- bento grid as default layout,
- decorative gradient orbs,
- purple/blue AI gradients,
- glassmorphism as decoration instead of material,
- dark slate dashboard by default,
- oversized hero headline,
- English marketing copy in app UI,
- card spam,
- nested cards,
- web dashboard layout for mobile app,
- fake stats,
- fake workers,
- fake prices,
- prototype routes in production,
- public mockup artifacts in store-bound mobile app,
- motion added everywhere,
- mascot treated as a toy.

## 28. Review Checklist

Before presenting or finalizing UI work, agents must answer:

```text
Did the UI follow design.md after critical.md?
Did the screen map to STRUCTURES.md workflow?
Did the design avoid generic SaaS/web defaults?
Did the design learn from XanhSM without copying?
Did color, typography, layout, decoration, and motion work together?
Was a design lab created for major screens?
Were skill adaptations stated before build?
Were all required states covered?
Were money-impacting actions explicitly confirmed?
Does it work as React Native mobile UI?
Is Kael used consistently and not excessively?
Were prototype/lab artifacts kept out of production?
```

If any answer is no, the work is not ready.

## 29. Final Design Principle

Home Services design must be beautiful first, but beauty here means system fit:

```text
Color fits typography.
Typography fits layout.
Layout fits workflow.
Decoration fits product identity.
Motion fits state.
Mascot fits trust.
Everything fits the first real transaction.
```

If a screen is visually attractive but does not support trust, price clarity, booking confirmation, worker clarity, or Kael's role, it is the wrong design.
