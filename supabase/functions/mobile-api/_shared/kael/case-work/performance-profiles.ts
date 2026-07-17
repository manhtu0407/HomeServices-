export const KAEL_CASE_WORK_SERVICE_TYPES = [
  "electrical",
  "plumbing",
  "cleaning",
  "hvac",
  "upholstery",
  "handyman",
] as const;

export type KaelCaseWorkServiceType = (typeof KAEL_CASE_WORK_SERVICE_TYPES)[number];

export const KAEL_PERFORMANCE_PROFILE_IDS = [
  "electric_diagnose",
  "water_diagnose",
  "clean_scope",
  "air_scope",
  "fabric_scope",
  "task_scope",
] as const;

export type KaelPerformanceProfileId = (typeof KAEL_PERFORMANCE_PROFILE_IDS)[number];

export type KaelWorkMode =
  | "cleaning"
  | "diagnosis"
  | "installation"
  | "repair"
  | "scope_planning";

export type KaelSafetyCapabilityGate = {
  id: string;
  kind: "safety" | "capability";
  trigger_signals: readonly string[];
  required_action:
    | "customer_safety_step"
    | "on_site_assessment"
    | "qualified_worker"
    | "specialist_handoff";
};

export type KaelEvidenceSuggestion = {
  kind: "photo" | "text" | "video_frames" | "voice_transcript";
  focus: string;
  optional: true;
};

export type KaelPerformanceProfile = {
  id: KaelPerformanceProfileId;
  service_type: KaelCaseWorkServiceType;
  supported_work_modes: readonly KaelWorkMode[];
  quote_drivers: readonly string[];
  safety_capability_gates: readonly KaelSafetyCapabilityGate[];
  evidence_suggestions: readonly KaelEvidenceSuggestion[];
  completion_checklist: readonly string[];
  scope_change_triggers: readonly string[];
  worker_capabilities: readonly string[];
};

function profile(input: KaelPerformanceProfile): Readonly<KaelPerformanceProfile> {
  return Object.freeze({
    ...input,
    supported_work_modes: Object.freeze([...input.supported_work_modes]),
    quote_drivers: Object.freeze([...input.quote_drivers]),
    safety_capability_gates: Object.freeze(input.safety_capability_gates.map((gate) =>
      Object.freeze({
        ...gate,
        trigger_signals: Object.freeze([...gate.trigger_signals]),
      })
    )),
    evidence_suggestions: Object.freeze(input.evidence_suggestions.map((suggestion) =>
      Object.freeze({ ...suggestion })
    )),
    completion_checklist: Object.freeze([...input.completion_checklist]),
    scope_change_triggers: Object.freeze([...input.scope_change_triggers]),
    worker_capabilities: Object.freeze([...input.worker_capabilities]),
  });
}

export const KAEL_PERFORMANCE_PROFILES = Object.freeze({
  electrical: profile({
    id: "electric_diagnose",
    service_type: "electrical",
    supported_work_modes: ["diagnosis", "repair", "installation"],
    quote_drivers: [
      "affected_area_and_power_state",
      "device_or_circuit_type",
      "symptom_and_duration",
      "access_and_concealed_wiring",
      "parts_or_new_device_requirement",
      "urgency_and_repeat_fault",
    ],
    safety_capability_gates: [
      {
        id: "electrical_immediate_hazard",
        kind: "safety",
        trigger_signals: ["smoke_or_burning", "sparking", "exposed_live_parts", "water_near_power"],
        required_action: "customer_safety_step",
      },
      {
        id: "electrical_panel_or_fixed_wiring",
        kind: "capability",
        trigger_signals: ["distribution_board", "fixed_wiring", "protective_device", "new_circuit"],
        required_action: "qualified_worker",
      },
    ],
    evidence_suggestions: [
      { kind: "photo", focus: "affected device and surrounding area", optional: true },
      { kind: "photo", focus: "breaker state without opening the panel", optional: true },
      { kind: "voice_transcript", focus: "symptom sequence and recent changes", optional: true },
    ],
    completion_checklist: [
      "affected_power_path_operates_stably",
      "protective_devices_remain_operational",
      "no_heat_sparking_or_exposed_parts",
      "work_area_is_restored_and_customer_can_review",
    ],
    scope_change_triggers: [
      "hidden_wiring_damage",
      "panel_or_protective_device_damage",
      "additional_circuit_required",
      "unexpected_wall_or_ceiling_access",
      "different_parts_or_device_required",
    ],
    worker_capabilities: [
      "electrical_fault_isolation",
      "fixed_wiring_and_panel_safety",
      "device_repair_or_replacement",
      "electrical_installation",
    ],
  }),
  plumbing: profile({
    id: "water_diagnose",
    service_type: "plumbing",
    supported_work_modes: ["diagnosis", "repair", "installation"],
    quote_drivers: [
      "fixture_pipe_or_drain_type",
      "leak_or_blockage_severity",
      "water_isolation_availability",
      "access_and_concealed_pipework",
      "pipe_or_fixture_material",
      "water_damage_and_urgency",
    ],
    safety_capability_gates: [
      {
        id: "plumbing_active_damage_or_contamination",
        kind: "safety",
        trigger_signals: ["uncontrolled_flow", "flooding", "sewage", "hot_water_hazard"],
        required_action: "customer_safety_step",
      },
      {
        id: "plumbing_concealed_or_building_system",
        kind: "capability",
        trigger_signals: ["concealed_pipe", "shared_stack", "main_supply", "waterproofing_boundary"],
        required_action: "on_site_assessment",
      },
    ],
    evidence_suggestions: [
      { kind: "photo", focus: "source and spread of the leak or blockage", optional: true },
      { kind: "video_frames", focus: "water flow or recurring symptom", optional: true },
      { kind: "voice_transcript", focus: "onset, frequency, and isolation attempts", optional: true },
    ],
    completion_checklist: [
      "water_flow_and_drainage_are_tested",
      "no_active_leak_at_repaired_connections",
      "fixture_or_pipe_is_secure",
      "affected_area_is_clean_and_customer_can_review",
    ],
    scope_change_triggers: [
      "concealed_pipe_damage",
      "shared_building_line_involved",
      "additional_fixture_or_connection_failure",
      "wall_floor_or_cabinet_access_required",
      "different_parts_or_pipe_material_required",
    ],
    worker_capabilities: [
      "leak_and_flow_diagnosis",
      "pipe_and_fixture_repair",
      "drain_clearing",
      "fixture_installation",
    ],
  }),
  cleaning: profile({
    id: "clean_scope",
    service_type: "cleaning",
    supported_work_modes: ["cleaning", "scope_planning"],
    quote_drivers: [
      "area_and_room_count",
      "current_condition_and_cleaning_depth",
      "surface_and_material_mix",
      "occupancy_and_access",
      "equipment_and_supply_requirements",
      "waste_volume_and_time_window",
    ],
    safety_capability_gates: [
      {
        id: "cleaning_hazardous_material",
        kind: "safety",
        trigger_signals: ["biohazard", "unknown_chemical", "sharp_waste", "heavy_mold"],
        required_action: "specialist_handoff",
      },
      {
        id: "cleaning_high_access_or_special_surface",
        kind: "capability",
        trigger_signals: ["unsafe_height", "fragile_surface", "specialist_floor", "heavy_machinery"],
        required_action: "qualified_worker",
      },
    ],
    evidence_suggestions: [
      { kind: "photo", focus: "representative room condition and surfaces", optional: true },
      { kind: "video_frames", focus: "overall route through the affected areas", optional: true },
      { kind: "voice_transcript", focus: "priorities and areas to avoid", optional: true },
    ],
    completion_checklist: [
      "agreed_areas_and_priorities_are_completed",
      "surfaces_are_handled_with_compatible_methods",
      "waste_and_equipment_are_removed",
      "customer_can_review_the_agreed_scope",
    ],
    scope_change_triggers: [
      "condition_materially_heavier_than_described",
      "additional_rooms_or_surfaces_requested",
      "biohazard_mold_or_pest_evidence",
      "post_construction_or_specialist_equipment_needed",
      "access_or_occupancy_changes",
    ],
    worker_capabilities: [
      "home_cleaning",
      "deep_cleaning",
      "surface_safe_cleaning",
      "cleaning_equipment_operation",
    ],
  }),
  hvac: profile({
    id: "air_scope",
    service_type: "hvac",
    supported_work_modes: ["cleaning", "diagnosis", "repair"],
    quote_drivers: [
      "requested_work_mode",
      "unit_type_count_and_capacity",
      "symptom_and_operating_condition",
      "maintenance_history",
      "indoor_outdoor_unit_access",
      "drain_electrical_or_refrigerant_signs",
      "parts_and_consumables_requirement",
    ],
    safety_capability_gates: [
      {
        id: "hvac_electrical_refrigerant_or_burning_hazard",
        kind: "safety",
        trigger_signals: ["burning_smell", "sparking", "refrigerant_suspected", "unsafe_unit_access"],
        required_action: "customer_safety_step",
      },
      {
        id: "hvac_repair_or_refrigerant_work",
        kind: "capability",
        trigger_signals: ["repair", "sealed_system", "refrigerant", "control_board", "height_access"],
        required_action: "qualified_worker",
      },
    ],
    evidence_suggestions: [
      { kind: "photo", focus: "indoor unit, model label, and visible condition", optional: true },
      { kind: "video_frames", focus: "airflow, sound, leakage, or operating symptom", optional: true },
      { kind: "voice_transcript", focus: "requested outcome and symptom timeline", optional: true },
    ],
    completion_checklist: [
      "agreed_cleaning_diagnosis_or_repair_scope_is_completed",
      "airflow_temperature_drainage_and_noise_are_checked_as_relevant",
      "no_visible_leak_or_electrical_hazard_remains",
      "unit_and_work_area_are_restored_for_customer_review",
    ],
    scope_change_triggers: [
      "cleaning_reveals_component_failure",
      "sealed_system_or_refrigerant_work_required",
      "additional_unit_or_component_involved",
      "unsafe_or_unexpected_access",
      "different_parts_or_control_component_required",
    ],
    worker_capabilities: [
      "hvac_cleaning",
      "hvac_fault_diagnosis",
      "hvac_electrical_and_control_repair",
      "refrigerant_system_service",
      "safe_height_access",
    ],
  }),
  upholstery: profile({
    id: "fabric_scope",
    service_type: "upholstery",
    supported_work_modes: ["cleaning", "scope_planning"],
    quote_drivers: [
      "item_type_count_and_dimensions",
      "material_and_care_label",
      "stain_odor_and_soiling_condition",
      "colorfastness_and_prior_treatment",
      "access_and_movement_requirement",
      "drying_environment_and_time_window",
    ],
    safety_capability_gates: [
      {
        id: "fabric_contamination_or_chemical_risk",
        kind: "safety",
        trigger_signals: ["bio_contamination", "unknown_chemical", "pest_evidence", "sensitive_occupant"],
        required_action: "on_site_assessment",
      },
      {
        id: "fabric_unknown_or_delicate_material",
        kind: "capability",
        trigger_signals: ["missing_care_label", "delicate_fabric", "color_transfer_risk", "high_value_item"],
        required_action: "qualified_worker",
      },
    ],
    evidence_suggestions: [
      { kind: "photo", focus: "full item, material texture, care label, and affected area", optional: true },
      { kind: "video_frames", focus: "extent and distribution of stains or damage", optional: true },
      { kind: "voice_transcript", focus: "stain source, age, and prior treatment", optional: true },
    ],
    completion_checklist: [
      "agreed_items_and_areas_are_treated",
      "material_compatibility_and_color_stability_are_rechecked",
      "residual_moisture_and_drying_guidance_are_communicated",
      "work_area_is_restored_and_customer_can_review",
    ],
    scope_change_triggers: [
      "material_differs_from_intake",
      "hidden_stain_damage_or_color_risk",
      "additional_items_or_surfaces_requested",
      "specialist_treatment_or_equipment_required",
      "drying_or_access_conditions_change",
    ],
    worker_capabilities: [
      "upholstery_material_identification",
      "colorfastness_and_patch_testing",
      "fabric_safe_extraction_cleaning",
      "stain_and_odor_treatment",
    ],
  }),
  handyman: profile({
    id: "task_scope",
    service_type: "handyman",
    supported_work_modes: ["diagnosis", "installation", "repair", "scope_planning"],
    quote_drivers: [
      "task_types_and_total_count",
      "item_dimensions_weight_and_quantity",
      "wall_surface_or_substrate",
      "mounting_location_access_and_height",
      "parts_hardware_and_tools_available",
      "concealed_services_and_load_requirement",
    ],
    safety_capability_gates: [
      {
        id: "handyman_structural_or_concealed_service_risk",
        kind: "safety",
        trigger_signals: ["load_bearing_change", "concealed_electrical", "concealed_plumbing", "unsafe_height"],
        required_action: "on_site_assessment",
      },
      {
        id: "handyman_specialist_boundary",
        kind: "capability",
        trigger_signals: ["regulated_electrical", "regulated_plumbing", "structural_work", "specialist_appliance"],
        required_action: "specialist_handoff",
      },
    ],
    evidence_suggestions: [
      { kind: "photo", focus: "item, installation point, surface, and available hardware", optional: true },
      { kind: "video_frames", focus: "access route and multi-task overview", optional: true },
      { kind: "voice_transcript", focus: "task priority and intended finished state", optional: true },
    ],
    completion_checklist: [
      "each_agreed_task_is_completed_or_explicitly_excluded",
      "mounted_or_repaired_items_are_stable_and_functional",
      "no_exposed_fixing_or_service_hazard_remains",
      "work_area_is_restored_and_customer_can_review",
    ],
    scope_change_triggers: [
      "surface_or_concealed_services_differ_from_intake",
      "additional_tasks_or_items_requested",
      "missing_or_incompatible_hardware",
      "structural_or_specialist_work_discovered",
      "unexpected_access_or_height_requirement",
    ],
    worker_capabilities: [
      "minor_home_repairs",
      "safe_drilling_and_mounting",
      "small_fixture_and_furniture_installation",
      "multi_task_scope_management",
    ],
  }),
} satisfies Readonly<Record<KaelCaseWorkServiceType, Readonly<KaelPerformanceProfile>>>);

const PERFORMANCE_PROFILE_LIST = Object.freeze(
  KAEL_CASE_WORK_SERVICE_TYPES.map((serviceType) => KAEL_PERFORMANCE_PROFILES[serviceType]),
);

const PERFORMANCE_PROFILE_BY_SERVICE = new Map(
  PERFORMANCE_PROFILE_LIST.map((item) => [item.service_type, item] as const),
);

export function listKaelPerformanceProfiles(): readonly Readonly<KaelPerformanceProfile>[] {
  return PERFORMANCE_PROFILE_LIST;
}

export function getKaelPerformanceProfile(
  serviceType: string,
): Readonly<KaelPerformanceProfile> | null {
  return PERFORMANCE_PROFILE_BY_SERVICE.get(serviceType as KaelCaseWorkServiceType) ?? null;
}
