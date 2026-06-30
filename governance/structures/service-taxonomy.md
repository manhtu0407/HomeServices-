# Structures Spoke - Service Taxonomy

> Extracted from `STRUCTURES.md` section 5 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for service taxonomy plus chips/baseline/matching rules. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 5. Service Taxonomy

Only electrical, plumbing, and home cleaning are active. Future-service cards or "coming soon" service entries must not appear in current product UI unless Tu explicitly approves that specific state.

### Electrical Taxonomy

```text
Electrical repair
-
|- power_outage_one_room
|  |- hints: one room has no power, breaker may trip
|  |- complexity: small/medium
|  |- required input: affected room, breaker status
|
|- power_outage_whole_unit
|  |- hints: entire apartment has no power
|  |- complexity: medium/large
|  |- required input: building-wide or unit-only
|
|- outlet_or_switch_broken
|  |- hints: loose outlet, burnt smell, switch not working
|  |- complexity: small/medium
|  |- required input: photo recommended
|
|- breaker_trip
|  |- hints: breaker repeatedly trips
|  |- complexity: medium/large
|  |- required input: what appliance triggers it
|
|- flickering_light
|  |- hints: flickering, unstable connection
|  |- complexity: small/medium
|  |- required input: one light or multiple lights
|
|- install_device
|  |- hints: light, fan, outlet, small fixture
|  |- complexity: small/medium
|  |- required input: device type and location
|
|- other_electrical
|  |- hints: must be clarified by Kael
|  |- complexity: unknown
```

### Plumbing Taxonomy

```text
Plumbing repair
-
|- pipe_leak
|  |- hints: visible leak, damp wall, water under sink
|  |- complexity: small/medium/large
|  |- required input: leak location and photo
|
|- clogged_drain_or_sink
|  |- hints: slow drain, blocked sink, floor drain issue
|  |- complexity: small/medium
|  |- required input: repeated issue or first time
|
|- toilet_flush_issue
|  |- hints: toilet does not flush, tank issue, leak
|  |- complexity: small/medium
|  |- required input: flush tank or bowl issue
|
|- faucet_broken
|  |- hints: dripping faucet, loose handle, no water
|  |- complexity: small/medium
|  |- required input: faucet type and photo
|
|- weak_water_pressure
|  |- hints: weak flow, one fixture or whole apartment
|  |- complexity: medium/large
|  |- required input: scope of weak pressure
|
|- install_or_replace_fixture
|  |- hints: replace faucet, shower head, filter, hose
|  |- complexity: small/medium
|  |- required input: fixture type
|
|- other_plumbing
|  |- hints: must be clarified by Kael
|  |- complexity: unknown
```

### Cleaning Taxonomy

```text
Home cleaning / housekeeping
-
|- routine_cleaning
|  |- hints: regular apartment cleaning, dusting, floor cleaning, surface wipe-down
|  |- complexity: small/medium
|  |- required input: rooms, bathrooms, approximate area, preferred time
|
|- deep_cleaning
|  |- hints: heavier dirt, long gap since last cleaning, detailed bathroom/kitchen work
|  |- complexity: medium/large
|  |- required input: approximate area, priority zones, photos recommended
|
|- move_in_move_out_cleaning
|  |- hints: empty or near-empty apartment before/after moving
|  |- complexity: medium/large
|  |- required input: apartment condition, area, elevator/building access
|
|- kitchen_grease_cleaning
|  |- hints: greasy stove, hood, counters, cabinets, food-prep surfaces
|  |- complexity: medium/large
|  |- required input: kitchen condition and photos recommended
|
|- bathroom_deep_cleaning
|  |- hints: stains, scale, mold-like buildup, toilet/shower/sink focus
|  |- complexity: small/medium
|  |- required input: number of bathrooms and condition
|
|- post_repair_cleanup
|  |- hints: dust and debris after electrical/plumbing repair or minor installation
|  |- complexity: small/medium
|  |- required input: repair type, affected rooms, debris level
|
|- other_cleaning
|  |- hints: must be clarified by Kael
|  |- complexity: unknown
```

Taxonomy rules:

```text
Rules
-
|- taxonomy drives UI chips
|- taxonomy drives Kael prompt context
|- taxonomy drives price baseline lookup
|- taxonomy drives worker skill matching
|- taxonomy must not include unsupported services
|- taxonomy changes require tests and admin visibility
```
