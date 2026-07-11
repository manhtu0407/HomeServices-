# Kael Core v9 Production Design Contract

Screen: Kael identity on customer and worker docks, auth, customer guidance, matching, and payment explanation surfaces.

Workflow mapping: Kael remains an identity and explanation surface only. It never communicates a workflow state, price, worker availability, or decision outcome through visual variants.

Accepted direction: user-supplied `Kael-Core-v9-Codex-Rebuild.html` plus `Kael-Motion-Clip-v11-Codex-Rebuild.html`.

User emotion: calm, capable, respectful assistance without theatrical AI behavior.

Primary action: open Kael from the dock or read an explicit product decision. The Kael visual itself must not imply confirmation, success, progress, or authority.

Component anatomy:

- Obsidian Pearl orb with perimeter-only highlights.
- Two white vertical pill eyes.
- One European silver monocle with a clear lens, clasp, chain, and anchor that simplify below the full-detail size.
- No hand, mouth, status dot/ring, emotion pose, image rig, or extra accessory.

Color and decoration: Kael is graphite, pearl, white, and silver. Surrounding product surfaces keep the neutral base plus one mint accent rule; no mint treatment is applied inside the Kael orb.

Motion: only `customer-v21-home-hero` opts into the Motion v11 Observe → Invite → Nod clip once at 3800 ms, then stays static. Direct dock interaction retains the 1220 ms `bow()`. Reduced Motion disables the Home clip and preserves the 480 ms reduced bow. There is no ground shadow beneath Kael.

Accessibility and touch: the dock wrapper provides the accessible Kael action; its focus and press trigger the bow. Other Kael renderings are labelled images. Reduce Transparency affects surrounding glass, not Kael legibility.

Forbidden regressions: raster Kael assets, status/emotion taxonomies, Lottie mascot animation, visual fake status, a looping mascot clip, ground shadows, or a second Kael identity source.

Verification plan: component contract test, source/asset wiring test, mobile type-check and Jest suite, React Doctor changed scan, and native device validation in light/dark plus Reduce Motion/Transparency when a device is available.
