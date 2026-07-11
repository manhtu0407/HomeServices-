# Structures Spoke - Service Taxonomy

> Extracted from `STRUCTURES.md` section 5 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for service taxonomy plus chips/baseline/matching rules. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 5. Service Taxonomy

Exactly six services are active: electrical, plumbing, home cleaning, HVAC/indoor air, upholstery care, and minor repair/installation. A service route collects Basic Intake only; taxonomy chips are optional hints, not a required static questionnaire. Kael owns the deeper one-question-at-a-time Case Work after handoff.

### Case Work Performance Profiles

```text
Service -> profile
-
|- electrical -> electric_diagnose
|- plumbing -> water_diagnose
|- cleaning -> clean_scope
|- hvac -> air_scope
|- upholstery -> fabric_scope
|- handyman -> task_scope
```

All profiles use the same phase-gated server workflow. A profile supplies service-specific quote drivers, evidence guidance, safety/capability checks, completion checks, and scope-change triggers. Those details must not be expanded into a long client-side form.

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

### HVAC And Indoor Air Taxonomy

`hvac` is a broad service, not a cleaning-only maintenance category. Kael may scope cleaning, diagnosis, or repair from evidence. Dispatch still requires a worker whose verified capabilities cover the diagnosed work, and universal safety gates may pause or reroute hazardous cases.

```text
Air conditioning and indoor air service
-
|- cleaning_or_maintenance
|  |- hints: routine unit cleaning, filter or airflow maintenance
|  |- quote drivers: unit count/type, access, last service, observed condition
|
|- weak_or_no_cooling
|  |- hints: runs but cools poorly or not at all
|  |- quote drivers: unit type, symptoms, duration, error indicators
|
|- water_or_condensate_issue
|  |- hints: dripping, leaking, blocked drainage, indoor moisture
|  |- quote drivers: leak location, active damage, unit/access type
|
|- noise_or_vibration
|  |- hints: unusual sound, vibration, intermittent operation
|  |- quote drivers: sound pattern, operating state, unit/access type
|
|- power_or_start_issue
|  |- hints: does not start, trips power, shuts down unexpectedly
|  |- quote drivers: power symptoms, error indicators, unit type
|
|- odor_or_air_quality
|  |- hints: persistent odor, dusty airflow, indoor air concern
|  |- quote drivers: odor timing, affected units/rooms, visible condition
|
|- other_hvac
|  |- hints: must be clarified by Kael without silently limiting the case to cleaning
|  |- complexity: unknown
```

### Upholstery Care Taxonomy

```text
Sofa, mattress, curtain, and carpet care
-
|- sofa_or_chair_care
|  |- quote drivers: item count/size, material, stain/odor condition, access
|
|- mattress_care
|  |- quote drivers: size/count, material, stain/odor condition, drying constraints
|
|- curtain_care
|  |- quote drivers: panel count/size, material, removal/access, drying constraints
|
|- carpet_or_rug_care
|  |- quote drivers: dimensions/count, material, stain/odor condition, on-site access
|
|- mixed_fabric_care
|  |- quote drivers: item inventory, material mix, condition, priority, drying constraints
|
|- other_upholstery
|  |- hints: must be clarified by Kael
|  |- complexity: unknown
```

### Minor Repair And Installation Taxonomy

```text
Minor repair and installation
-
|- drill_or_mount_small_item
|  |- quote drivers: item/count, wall or mounting surface, fixings, access
|
|- install_shelf_or_curtain_rod
|  |- quote drivers: item/count, dimensions, surface, supplied materials
|
|- adjust_hinge_handle_or_hardware
|  |- quote drivers: item/count, current damage, replacement parts
|
|- assemble_or_install_small_furnishing
|  |- quote drivers: item/count, assembly state, instructions/parts, access
|
|- mixed_minor_tasks
|  |- quote drivers: task list, count, surfaces, tools/materials, access
|
|- other_handyman
|  |- hints: must be clarified by Kael
|  |- complexity: unknown
```

If a handyman request crosses into electrical, plumbing, HVAC, structural, gas, fire-safety, or other capability-controlled work, Kael must reroute or stop it through the applicable service/safety gate. It must not disguise specialist work as a minor task.

Taxonomy rules:

```text
Rules
-
|- route UI collects only service, location, desired time, short description, and optional chips/media
|- chips help Basic Intake but are never a complete or mandatory diagnosis form
|- taxonomy selects the server-side Case Work performance profile
|- profile context drives Kael's one focused question per turn
|- taxonomy and structured scope drive price baseline lookup only when real baseline data exists
|- taxonomy plus verified capabilities drive worker matching
|- missing baseline, worker, ETA, or payment data produces an honest not-ready/empty state; it is never invented
|- only the six supported services may be activated
|- taxonomy changes require tests and admin visibility
```
