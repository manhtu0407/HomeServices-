import type { ServiceType } from "../../../../_shared/domain.ts";
import type {
  KaelCaseWorkServiceType,
  KaelPerformanceProfile,
} from "../learning/performance-profiles.ts";
import type { KaelEstimate } from "../contracts/types.ts";

export const ELECTRICAL_INTAKE_POLICY_VERSION = "electrical-intake-2026-07-16.v1";

export type RequiredSlotPolicy = {
  readonly serviceType: "electrical";
  readonly problemSlug: string;
  readonly minimumSlots: readonly string[];
  readonly optionalSlots: readonly string[];
  readonly estimateWithoutPhoto: true;
};

export type HardRoutingPolicyDecision = {
  readonly scopeSignal: "out_of_scope" | "service_mismatch";
  readonly suggestedService: ServiceType | null;
  readonly reasonCode:
    | "building_common_area_power"
    | "unsupported_ev_charger"
    | "unsupported_industrial_three_phase"
    | "pure_mounting_handyman"
    | "unsupported_internal_appliance_fault"
    | "hvac_device_fault"
    | "water_only_heater_leak";
};

const ELECTRICAL_DRIVERS = [
  "affected_area_and_power_state",
  "device_or_circuit_type",
  "symptom_and_duration",
  "access_and_concealed_wiring",
  "parts_or_new_device_requirement",
  "urgency_and_repeat_fault",
] as const;

const REQUIRED_SLOT_POLICIES = Object.freeze({
  breaker_trip: requiredSlotPolicy("breaker_trip", [
    "affected_area_and_power_state",
    "device_or_circuit_type",
    "breaker_state",
  ]),
  power_outage_whole_unit: requiredSlotPolicy("power_outage_whole_unit", [
    "affected_area_and_power_state",
    "breaker_state",
  ]),
  power_outage_one_room: requiredSlotPolicy("power_outage_one_room", [
    "affected_area_and_power_state",
    "device_or_circuit_type",
    "breaker_state",
  ]),
  flickering_light: requiredSlotPolicy("flickering_light", [
    "affected_area_and_power_state",
    "device_or_circuit_type",
    "symptom_and_duration",
  ]),
  outlet_or_switch_broken: requiredSlotPolicy("outlet_or_switch_broken", [
    "affected_area_and_power_state",
    "device_or_circuit_type",
    "symptom_and_duration",
  ]),
  install_device: requiredSlotPolicy("install_device", [
    "device_or_circuit_type",
    "access_and_concealed_wiring",
    "parts_or_new_device_requirement",
  ]),
  "electrical-general": requiredSlotPolicy("electrical-general", [
    "affected_area_and_power_state",
    "symptom_and_duration",
  ]),
  other_electrical: requiredSlotPolicy("other_electrical", [
    "affected_area_and_power_state",
    "device_or_circuit_type",
    "symptom_and_duration",
  ]),
} satisfies Readonly<Record<string, RequiredSlotPolicy>>);

function requiredSlotPolicy(
  problemSlug: string,
  minimumSlots: readonly string[],
): RequiredSlotPolicy {
  const minimum = Object.freeze([...minimumSlots]);
  return Object.freeze({
    serviceType: "electrical",
    problemSlug,
    minimumSlots: minimum,
    optionalSlots: Object.freeze(ELECTRICAL_DRIVERS.filter((slot) =>
      !minimum.includes(slot)
    )),
    estimateWithoutPhoto: true,
  });
}

export function getRequiredSlotPolicy(
  serviceType: KaelCaseWorkServiceType,
  problemSlug: string,
): Readonly<RequiredSlotPolicy> | null {
  if (serviceType !== "electrical") return null;
  return REQUIRED_SLOT_POLICIES[problemSlug as keyof typeof REQUIRED_SLOT_POLICIES] ?? null;
}

export function resolveRequiredSlotCoverage(
  profile: Readonly<KaelPerformanceProfile>,
  problemSlug: string,
  candidateFacts: Record<string, unknown>,
) {
  const required = getRequiredSlotPolicy(profile.service_type, problemSlug)?.minimumSlots ??
    profile.quote_drivers;
  const allowedFacts = [...new Set([...profile.quote_drivers, ...required])];
  const facts: Record<string, string> = {};
  for (const driver of allowedFacts) {
    const value = candidateFacts[driver];
    if (typeof value !== "string") continue;
    const normalized = value.trim().slice(0, 500);
    if (normalized) facts[driver] = normalized;
  }
  return {
    facts,
    missing: required.filter((driver) => !facts[driver]),
  };
}

export function buildRequiredSlotPolicyPrompt(serviceType: string) {
  if (serviceType !== "electrical") return "";
  const rows = Object.values(REQUIRED_SLOT_POLICIES).map((policy) =>
    `- ${policy.problemSlug}: minimum=[${policy.minimumSlots.join(", ")}]; optional=[${policy.optionalSlots.join(", ")}]; photo_required=false`
  );
  return [
    "Electrical minimum-slot policy:",
    ...rows,
    "Only missing minimum slots may block an estimate. Record optional facts when grounded, but never ask solely for an optional slot or photo. A required branch-state question uses breaker_state. A branch-specific safety question may use only safety_water_proximity or safety_spark_marks.",
  ].join("\n");
}

export function applyHardRoutingPolicy(input: {
  readonly selectedService: ServiceType;
  readonly text: string;
}): HardRoutingPolicyDecision | null {
  if (input.selectedService !== "electrical") return null;
  const text = normalizePolicyText(input.text);
  const affirmative = withoutPolicyNegations(text);
  const relationClauses = punctuationClauses(affirmative);

  const hasBuildingOutage = policyClauses(affirmative).some((clause) => {
    const hasOutage = /\b(?:mat dien|cup dien|power_absent|power outage)\b/.test(clause);
    const isHistorical = /\b(?:hom qua|toi qua|truoc do|tuan truoc|thang truoc|yesterday|last night|previously|earlier)\b/.test(clause);
    const isOngoing = /\b(?:tu hom qua|ke tu|den gio|since|still|ongoing)\b/.test(clause) ||
      /\b(?:van|dang)\s*(?:mat dien|cup dien|power_absent)\b/.test(clause);
    return hasOutage &&
      /\b(?:ca tang|toan bo tang|ca toa|toan bo toa|toa nha|block|khu vuc chung|hanh lang|hang xom|nhieu can ho|cac can ho|whole floor|entire floor|whole building|entire building|multiple apartments|neighbors|common area)\b/.test(clause) &&
      (!isHistorical || isOngoing);
  });
  const hasExplicitUnitPower = /\b(?:can ho|can nha|nha toi|nha minh|nha em|nha chung toi|nha chung minh)\b[^.;,]{0,40}\b(?:van|dang)?\s*co dien\b|\b(?:my|our|the)\s+(?:apartment|unit|home)\b[^.;,]{0,40}\b(?:still\s+)?(?:has|have)\s+(?:power|electricity)\b|\b(?:power|electricity)\b[^.;,]{0,30}\b(?:my|our|the)\s+(?:apartment|unit|home)\b[^.;,]{0,15}\b(?:still\s+)?(?:on|available)\b/.test(affirmative);
  const hasSupportedInUnitWork = policyClauses(affirmative).some((clause) =>
    /\b(?:o cam|o dien|cong tac|cau dao|aptomat|atomat|cb|rcbo|elcb|day dien|day nguon|duong dien|mach dien|nguon cap|den|outlet|socket|switch|breaker|wiring|wire|power supply|electrical panel|light|lights)\b/.test(clause) &&
    /\b(?:long|vo|dut|chap chon|nhap nhay|hong|loi|nong|khet|chay|sua|kiem tra|lap|thay|broken|fault|loose|flicker|flickering|sparking|damaged|repair|repaired|inspect|replace|install)\b/.test(clause)
  );
  if (hasBuildingOutage && !(hasExplicitUnitPower && hasSupportedInUnitWork)) {
    return {
      scopeSignal: "out_of_scope",
      suggestedService: null,
      reasonCode: "building_common_area_power",
    };
  }

  const hasVehicleCharger = policyClauses(affirmative).some((clause) =>
    /\b(?:tram sac|he thong sac|charging station|ev charger|car charger)\b/.test(clause) &&
    /\b(?:o to|xe hoi|xe dien|ev|car|vehicle)\b/.test(clause) &&
    /\b(?:can|lap|sua|kiem tra|hong|loi|install|repair|inspect|broken|fault)\b/.test(clause)
  );
  if (hasVehicleCharger) {
    return {
      scopeSignal: "out_of_scope",
      suggestedService: null,
      reasonCode: "unsupported_ev_charger",
    };
  }

  const hasIndustrialThreePhase = policyClauses(affirmative).some((clause) =>
    /\b(?:(?:dien|nguon dien)?\s*(?:3|ba)\s*pha(?:\s*380v)?|three phase|3 phase)\b/.test(clause) &&
    /\b(?:xuong|nha may|cong nghiep|may cong nghiep|cong suat lon|workshop|factory|industrial|high power)\b/.test(clause) &&
    /\b(?:can|lap|sua|kiem tra|hong|loi|install|repair|inspect|broken|fault)\b/.test(clause)
  );
  if (hasIndustrialThreePhase) {
    return {
      scopeSignal: "out_of_scope",
      suggestedService: null,
      reasonCode: "unsupported_industrial_three_phase",
    };
  }

  const hasTelevisionMounting = relationClauses.some((clause) =>
    /\b(?:treo|gan gia|lap gia)\s+(?:cai\s+)?(?:tv|tivi|ti vi)\b|\b(?:mount|wall mount)\s+(?:the )?(?:tv|television)\b/.test(clause)
  );
  const hasElectricalWork = /\b(?:o cam|o dien|cong tac|cau dao|aptomat|atomat|cb|dau nguon|cap nguon|di day|day dien|mach dien|sua dien|outlet|socket|switch|breaker|wiring|power supply|electrical repair)\b/.test(affirmative);
  if (hasTelevisionMounting && !hasElectricalWork) {
    return {
      scopeSignal: "service_mismatch",
      suggestedService: "handyman",
      reasonCode: "pure_mounting_handyman",
    };
  }

  const hasInternalApplianceFault = policyClauses(affirmative).some((clause) => {
    const portableAppliance = /\b(?:tv|tivi|ti vi|television|may giat|tu lanh|lo vi song|may say|may rua bat|may rua chen|washing machine|refrigerator|fridge|microwave|dryer|dishwasher)\b/.test(clause);
    const appliance = portableAppliance || /\b(?:bep tu|induction cooktop|binh nong lanh|may nuoc nong|water heater)\b/.test(clause);
    const genericPortableFault = portableAppliance && /\b(?:hong|broken)\b/.test(clause);
    const explicitInternalFault = /\b(?:bao loi|ma loi|loi e[0-9]+|appliance_not_heating|appliance_no_picture|appliance_not_running|hvac_not_running|bo mach|mach dieu khien|control board|error code|error e[0-9]+|shows error|internal fault)\b/.test(clause);
    const internalPortableHazard = portableAppliance && (
      /\b(?:boc khoi|phat khoi|smoke|smoking)\b[^.;,]{0,35}\b(?:ben trong|long may|inside|internal)\b/.test(clause) ||
      /\b(?:toe lua|tia lua|spark|sparking)\b[^.;,]{0,35}\b(?:bo mach|ben trong|control board|inside|internal)\b/.test(clause)
    );
    const externalElectricalWork = /\b(?:o cam|o dien|cau dao|aptomat|atomat|cb|day dien|duong dien|mach dien|nguon cap|outlet|socket|breaker|wiring|power supply)\b/.test(clause) &&
      /\b(?:hong|loi|dut|chay|nong|sua|kiem tra|thay|lap|repair|inspect|replace|install|fault|damaged)\b/.test(clause);
    const explicitlyNormalElectricalWork = /\b(?:o cam|o dien|cau dao|aptomat|atomat|cb|day dien|duong dien|mach dien|nguon cap|outlet|socket|breaker|wiring|power supply)\b[^.;,]{0,35}\b(?:van|dang)?\s*(?:binh thuong|hoat dong tot|works normally|working normally|works fine|is fine)\b/.test(clause);
    return appliance && (genericPortableFault || explicitInternalFault || internalPortableHazard) &&
      (!externalElectricalWork || explicitlyNormalElectricalWork);
  });
  if (hasInternalApplianceFault && !hasElectricalInfrastructureContext(input.text)) {
    return {
      scopeSignal: "out_of_scope",
      suggestedService: null,
      reasonCode: "unsupported_internal_appliance_fault",
    };
  }

  const hvacRelationClauses = proximityClauses(affirmative);
  const hasHvacDeviceFault = hvacRelationClauses.some((clause, index) => {
    const hasDevice = /\b(?:may lanh|dieu hoa|air conditioner|air conditioning|hvac)\b/.test(clause);
    const hasFault = /\b(?:hvac_no_cooling|hvac_not_running|chay nuoc|ro nuoc|dong bang|keu to|co mui|hong may|bi hong|hong|water leak|leak|leaking|frozen|freezing|loud noise|strange noise|odor|smell|broken|faulty|device fault|internal fault)\b/.test(clause);
    const hasCompetingFaultEntity = /\b(?:bon rua|voi nuoc|ong nuoc|may giat|tu lanh|binh nong lanh|may nuoc nong|sink|faucet|pipe|washing machine|refrigerator|fridge|water heater)\b/.test(clause);
    const explicitlyNormal = /\b(?:may lanh|dieu hoa|air conditioner|air conditioning|hvac)\b[^,.;]{0,40}\b(?:binh thuong|hoat dong tot|works normally|working normally|works fine|is fine)\b/.test(clause);
    if (hasCompetingFaultEntity || explicitlyNormal || !hasFault) return false;
    if (hasDevice) return true;
    const previousClause = index > 0 ? hvacRelationClauses[index - 1] : "";
    return /\b(?:hvac_no_cooling|hvac_not_running)\b/.test(clause) &&
      /\b(?:may lanh|dieu hoa|air conditioner|air conditioning|hvac)\b/.test(previousClause);
  });
  const hasElectricalSupplyFault = hasElectricalInfrastructureContext(input.text);
  if (hasHvacDeviceFault && !hasElectricalSupplyFault) {
    return {
      scopeSignal: "service_mismatch",
      suggestedService: "hvac",
      reasonCode: "hvac_device_fault",
    };
  }

  const heaterRelationClauses = policyClauses(affirmative);
  const hasWaterHeaterLeak = heaterRelationClauses.some((clause, index) => {
    const hasLeak = /\b(?:ro|ri|chay)\s*nuoc\b|\bnuoc\s*(?:ro|ri|chay)\b|\b(?:water leak|leak|leaking|drip|dripping)\b/.test(clause);
    const hasCompetingLeakEntity = /\b(?:bon rua|voi nuoc|ong nuoc|may giat|tu lanh|may lanh|dieu hoa|sink|faucet|pipe|washing machine|refrigerator|fridge|air conditioner|air conditioning|hvac)\b/.test(clause);
    if (!hasLeak || hasCompetingLeakEntity) return false;
    if (/\b(?:binh nong lanh|may nuoc nong|water heater)\b/.test(clause)) return true;
    const previousClause = index > 0 ? heaterRelationClauses[index - 1] : "";
    return /\b(?:binh nong lanh|may nuoc nong|water heater)\b/.test(previousClause);
  });
  const electricalNormal = /\b(?:phan dien|dien|nguon)\b[^.;,]{0,30}\b(?:(?:van|dang)\s*binh thuong|(?:van|dang)?\s*(?:hoat dong|chay|nong)\s*(?:binh thuong|tot))\b/.test(affirmative) ||
    /\b(?:electrical side|electrical part|power)\b[^.;,]{0,35}\b(?:still|is|works|working)\b[^.;,]{0,15}\b(?:normal|normally|fine)\b/.test(affirmative) ||
    /\bchi\s*(?:bi\s*)?(?:ro|ri|chay)\s*nuoc\b|\bonly\s+(?:a\s+)?(?:water\s+)?(?:leak|drip)\b/.test(affirmative);
  const hasElectricalHeaterFault = /\b(?:giat|te te|ro dien|chap dien|mat nguon|khong len nguon|nong bat thuong|qua nong|power_absent|hvac_not_running|appliance_not_running|appliance_not_heating|electric shock|tingling|electrical fault|short circuit|overheat(?:ed|ing)?|abnormally hot|unusually hot)\b/.test(affirmative) ||
    /\b(?:phan dien|dien|nguon)\b[^.;,]{0,30}\b(?:khong|chua)\s*(?:hoat dong|chay|nong|binh thuong)\b/.test(text) ||
    /\b(?:electrical side|electrical part|power)\b[^.;,]{0,35}\b(?:(?:is|was|does|did|has|still)?\s*(?:not|isn t|wasn t|doesn t|didn t|hasn t)|never)\s*(?:work|working|run|running|heat|heating|normal|fine|turn on)\b/.test(text);
  if (
    hasWaterHeaterLeak && electricalNormal && !hasElectricalHeaterFault &&
    !hasElectricalSupplyFault
  ) {
    return {
      scopeSignal: "service_mismatch",
      suggestedService: "plumbing",
      reasonCode: "water_only_heater_leak",
    };
  }

  return null;
}

export function hasElectricalInfrastructureContext(input: string) {
  const text = withoutPolicyNegations(normalizePolicyText(input));
  return policyClauses(text).some((clause) => {
    const directFault = /\b(?:loi dong|lo day|te te|giat nhe)\b/.test(clause);
    const areaOutage = /\b(?:ca nha|toan can|mot phong|nhieu phong|ca tang|toan bo tang)\b[^.;,]{0,35}\b(?:mat dien|power_absent)\b|\b(?:mat dien|power_absent)\b[^.;,]{0,35}\b(?:ca nha|toan can|mot phong|nhieu phong|ca tang|toan bo tang)\b/.test(clause);
    const lightingFault = /\b(?:den|light|lights)\b[^.;,]{0,35}\b(?:sang toi|chap chon|nhap nhay|flicker|flickering|dim|dimming)\b|\b(?:sang toi|chap chon|nhap nhay|flicker|flickering|dim|dimming)\b[^.;,]{0,35}\b(?:den|light|lights)\b/.test(clause);
    const fixedApplianceSupplyFault = /\b(?:bep tu|binh nong lanh|may nuoc nong|induction cooktop|water heater)\b[^.;,]{0,45}\b(?:mat nguon|power_absent)\b|\b(?:mat nguon|power_absent)\b[^.;,]{0,45}\b(?:bep tu|binh nong lanh|may nuoc nong|induction cooktop|water heater)\b/.test(clause);
    const component = /\b(?:o cam|o dien|cong tac|cau dao|aptomat|atomat|cb|rcbo|elcb|day dien|day nguon|duong dien|mach dien|nguon cap|outlet|socket|switch|breaker|wiring|wire|power supply|electrical panel)\b/.test(clause);
    const faultOrWork = /\b(?:mat dien|power_absent|nhay|sap|trip|trips|tripping|long|vo|dut|chuot can|bi can|lo|ho|nong|khet|chay|sua|kiem tra|lap|keo|di day|dau|them|moi|rieng|broken|fault|sparking|damaged|repair|inspect|replace|install)\b/.test(clause);
    return directFault || areaOutage || lightingFault || fixedApplianceSupplyFault || component && faultOrWork;
  });
}

export function scanIntakeSafetySignals(
  selectedService: ServiceType,
  input: string,
): string[] {
  if (selectedService !== "electrical") return [];
  const text = normalizePolicyText(input);
  const affirmative = withoutNegatedSafetySignals(text);
  const signals: string[] = [];
  const smokeOrBurning = proximityClauses(affirmative).some((clause) => {
    const cookingContext = /\b(?:do an|mon an|thuc an|nau an|food|cooking)\b/.test(clause);
    const electricalComponentBurn = /\b(?:o cam|o dien|cong tac|day dien|outlet|socket|switch|wire)\b[^.;,]{0,30}\b(?:chay den|nong chay|xem den|bi chay|burnt|burned|scorched|melted)\b|\b(?:chay den|nong chay|xem den|burnt|burned|scorched|melted)\b[^.;,]{0,30}\b(?:o cam|o dien|cong tac|day dien|outlet|socket|switch|wire)\b/.test(clause);
    const electricalComponentSmoke = /\b(?:o cam|o dien|cong tac|day dien|tu dien|bang dien|hop dien|outlet|socket|switch|wire|electrical panel|breaker)\b[^.;,]{0,24}\b(?:co|thay|boc|phat|ra|is|are|was|were|has)?\s*(?:khoi|smoke|smoking)\b|\b(?:khoi|smoke)\b[^.;,]{0,24}\b(?:tu|ra tu|from)\s+(?:o cam|o dien|cong tac|day dien|tu dien|bang dien|hop dien|outlet|socket|switch|wire|electrical panel|breaker)\b/.test(clause);
    const genericSmokeOrBurn = /\b(?:boc khoi|phat khoi|khoi boc|mui khet|mui chay|chay den|nong chay|xem den|smoke|smoking|burning smell|burnt smell|smells? burnt|burned|burnt|scorched|melted)\b/.test(clause);
    return electricalComponentBurn || electricalComponentSmoke || genericSmokeOrBurn && !cookingContext;
  });

  if (smokeOrBurning) {
    signals.push("smoke_or_burning");
  }
  if (/\b(?:toe lua|tia lua|phat lua|danh lua|chap dien|spark|sparks|sparking|arcing|short circuit)\b/.test(affirmative)) {
    signals.push("sparking");
  }
  if (/\b(?:loi dong|lo day|day dien ho|day ho|ho dien|te te|giat nhe|exposed wire|bare wire|bare conductor|electric shock|tingling)\b|\b(?:day dien|loi dong|wire|conductor)\b[^.;,]{0,20}\b(?:ho|bare|exposed)\b/.test(affirmative)) {
    signals.push("exposed_live_parts");
  }
  const waterNearPower = proximityClauses(affirmative).some((clause) => {
    const hasWaterState = /\b(?:am uot|bi am|am|dot|mua tat|ro nuoc|ri nuoc|nuoc ro|nuoc ri|uot|ngap(?: nuoc)?|wet|damp|rain ingress|rainwater|leak|leaking|flooded)\b/.test(clause);
    const hasWater = /\b(?:nuoc|water)\b/.test(clause);
    const hasWaterHeater = /\b(?:binh nong lanh|may nuoc nong|water heater)\b/.test(clause);
    const hasWaterHeaterElectricalPart = /\b(?:phan dien|bo phan dien|hop dau dien|dau noi dien|day dien|nguon dien|electrical (?:part|parts|connection|connections|wiring)|wiring compartment)\b/.test(clause);
    const directWetElectrical = /\b(?:o cam|o dien|cong tac|tu dien|day dien|cau dao|aptomat|atomat|cb|den|outlet|socket|switch|electrical panel|breaker|wire|light|lights)\b\s*(?:bi|dang|is|are|was|were)?\s*(?:am uot|bi am|am|dot|mua tat|uot|ngap(?: nuoc)?|wet|damp|rain ingress|rainwater|flooded)\b|\b(?:am uot|bi am|am|dot|mua tat|uot|wet|damp|rain ingress|rainwater|flooded)\b[^.;,]{0,30}\b(?:gan|canh|sat|ngay|duoi|tren|dinh|len|vao|quanh|tat|near|beside|next to|under|above|onto|into|around)?\s*(?:o cam|o dien|cong tac|tu dien|day dien|cau dao|aptomat|atomat|cb|den|outlet|socket|switch|electrical panel|breaker|wire|light|lights)\b/.test(clause);
    const directionalElectricalRelation = /\b(?:gan|canh|sat|duoi|tren|dinh|len|vao|quanh|tat|ra tu|near|beside|next to|under|above|onto|into|around|entering|from)\s+(?:(?:ngay|the)\s+)?(?:phan dien|bo phan dien|hop dau dien|dau noi dien|nguon dien|o cam|o dien|cong tac|tu dien|day dien|cau dao|aptomat|atomat|cb|den|outlet|socket|switch|electrical panel|electrical part|electrical parts|electrical connection|electrical connections|breaker|wire|wiring compartment|light|lights)\b|\b(?:phan dien|bo phan dien|hop dau dien|dau noi dien|nguon dien|o cam|o dien|cong tac|tu dien|day dien|cau dao|aptomat|atomat|cb|den|outlet|socket|switch|electrical panel|electrical part|electrical parts|electrical connection|electrical connections|breaker|wire|wiring compartment|light|lights)\b[^.;,]{0,20}\b(?:gan|canh|sat|near|beside|next to)\s+(?:nuoc|water|cho am|damp area|wet area)\b/.test(clause);
    const explicitlyFar = /\b(?:xa|cach xa|across the room|far from|far away from|away from)\b/.test(clause);
    return !explicitlyFar && (
      hasWaterHeater && hasWaterState && hasWaterHeaterElectricalPart ||
      directWetElectrical ||
      (hasWaterState || hasWater) && directionalElectricalRelation
    );
  });
  if (waterNearPower) {
    signals.push("water_near_power");
  }
  const workClauses = policyClauses(withoutPolicyNegations(text));
  const capabilityClauses = workClauses.flatMap((clause) =>
    clause.split(/\band\b/g).map((part) => part.trim()).filter(Boolean)
  );
  if (workClauses.some((clause) =>
    /\b(?:aptomat|atomat|cau dao|cb|rcbo|elcb|breaker)\b/.test(clause) &&
    /\b(?:nhay|sap|trip|trips|tripping|hong|loi|nong|khet|chay|sua|kiem tra|lap|thay|reset|chong giat|fault|install|replace)\b/.test(clause)
  )) {
    signals.push("protective_device");
  }
  if (capabilityClauses.some((clause) =>
    /\b(?:tu dien|bang dien|hop dien|electrical panel|breaker panel|distribution board|electrical box)\b/.test(clause) &&
    /\b(?:re|keu|phat tieng|nhay|sap|hong|loi|nong|khet|khoi|chay|sua|kiem tra|lap|thay|buzz|buzzes|buzzing|hum|hums|humming|crackle|crackles|crackling|fault|faulty|hot|overheating|damaged|broken|repair|inspect|install|replace)\b/.test(clause)
  )) {
    signals.push("distribution_board");
  }
  if (capabilityClauses.some((clause) =>
    /\b(?:day am tuong|duong day am|he thong day dien|day dien trong tuong|concealed wiring|in wall wiring|wiring inside (?:the )?wall|fixed wiring)\b/.test(clause) &&
    /\b(?:can|chap chon|dut|hong|loi|chay|nong|sua|kiem tra|thay|di lai|lap|damaged|broken|fault|faulty|frayed|burned|burnt|shorting|intermittent|repair|inspect|replace|check|install)\b/.test(clause)
  )) {
    signals.push("fixed_wiring");
  }
  if (capabilityClauses.some((clause) =>
    /\b(?:mach dien moi|duong dien rieng|mach rieng|keo dien moi|new circuit|dedicated circuit|dedicated electrical line)\b/.test(clause) &&
    /\b(?:can|muon|lap|them|keo|di|dau|tao|need|needs|require|requires|want|wants|install|add|run|wire|create)\b/.test(clause)
  )) {
    signals.push("new_circuit");
  }
  return [...new Set(signals)];
}

export function deterministicSafetyGuidance(
  safetySignals: readonly string[],
  language: "vi" | "en",
) {
  const criticalCount = [
    "smoke_or_burning",
    "sparking",
    "exposed_live_parts",
    "water_near_power",
  ].filter((signal) => safetySignals.includes(signal)).length;
  if (criticalCount > 0) {
    return language === "en"
      ? "Switch off the main breaker only if the panel is dry and safely reachable. Do not do so if you must approach the hazard. Do not touch, unplug, clean, or approach the affected area. Keep people away until a qualified electrician inspects it. If smoke or flames persist, leave the area and call fire emergency 114."
      : "Anh/chị chỉ ngắt aptomat tổng nếu bảng điện khô ráo và dễ tiếp cận. Không làm vậy nếu phải lại gần chỗ nguy hiểm. Không chạm, rút phích, lau dọn hoặc lại gần khu vực bị ảnh hưởng. Giữ mọi người tránh xa cho đến khi thợ điện đủ chuyên môn kiểm tra. Nếu vẫn còn khói hoặc lửa, hãy rời khu vực và gọi cứu hỏa 114.";
  }
  return null;
}

export function prependDeterministicSafetyGuidance(
  text: string,
  safetySignals: readonly string[],
  language: "vi" | "en",
  options: { readonly trustedText?: boolean } = {},
) {
  const guidance = deterministicSafetyGuidance(safetySignals, language);
  if (!guidance) return text;
  if (options.trustedText === false) return guidance;
  return text.startsWith(guidance) ? text : `${guidance} ${text}`;
}

export function buildSafetyFirstElectricalEstimate(
  estimate: KaelEstimate,
  safetySignals: readonly string[],
  language: "vi" | "en",
): KaelEstimate {
  if (!deterministicSafetyGuidance(safetySignals, language)) return estimate;
  const problemSummary = language === "en"
    ? "Electrical hazard requiring an on-site inspection by a qualified electrician."
    : "Sự cố điện cần thợ điện đủ chuyên môn kiểm tra trực tiếp.";
  const advisory = language === "en"
    ? "Do not approach or touch the hazardous area. Keep people away until a qualified electrician inspects it."
    : "Không lại gần hoặc chạm vào khu vực nguy hiểm. Giữ mọi người tránh xa cho đến khi thợ điện đủ chuyên môn kiểm tra.";
  return {
    ...estimate,
    problem_summary: problemSummary,
    advisory,
    needs_inspection: true,
    needs_inspection_reason: problemSummary,
  };
}

function normalizePolicyText(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9,.;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutNegatedSafetySignals(input: string) {
  return input
    .replace(
      /\bno longer\s+(?:(?:see|have|notice|detect|show|showing|is|are|was|were)\s+)?(?:(?:any|a)\s+)?(?:burning smell|burnt smell|smells? burnt|smoke|smoking|burned|burnt|scorched|melted|spark|sparks|sparking|arcing|short circuit|exposed wire|bare wire|bare conductor|exposed|bare|electric shock|tingling|water|wet|damp|rain ingress|rainwater|leak|leaking|flooded)(?:\s+(?:or|and)\s+(?:(?:see|have|notice|detect|show|showing|is|are|was|were)\s+)?(?:(?:any|a)\s+)?(?:burning smell|burnt smell|smells? burnt|smoke|smoking|burned|burnt|scorched|melted|spark|sparks|sparking|arcing|short circuit|exposed wire|bare wire|bare conductor|exposed|bare|electric shock|tingling|water|wet|damp|rain ingress|rainwater|leak|leaking|flooded))*\b/g,
      " ",
    )
    .replace(
      /\b(?:khong|chua)\s+(?:(?:con|thay)\s+)?(?:(?:co|bi|phat|thay)\s+)?(?:chay den|nong chay|xem den|bi chay|boc khoi|phat khoi|khoi boc|khoi|mui khet|mui chay|toe lua|tia lua|phat lua|danh lua|chap dien|loi dong|lo day|day dien ho|day ho|ho dien|ho|te te|giat nhe|am uot|bi am|mua tat|dot|ro nuoc|ri nuoc|nuoc ro|nuoc ri|uot|ngap(?: nuoc)?|chay|nuoc|am)(?:\s+(?:hay|hoac|va)\s+(?:(?:con|thay)\s+)?(?:(?:co|bi|phat|thay)\s+)?(?:chay den|nong chay|xem den|bi chay|boc khoi|phat khoi|khoi boc|khoi|mui khet|mui chay|toe lua|tia lua|phat lua|danh lua|chap dien|loi dong|lo day|day dien ho|day ho|ho dien|ho|te te|giat nhe|am uot|bi am|mua tat|dot|ro nuoc|ri nuoc|nuoc ro|nuoc ri|uot|ngap(?: nuoc)?|chay|nuoc|am))*\b/g,
      " ",
    )
    .replace(
      /\b(?:no|not|without|never|does not|do not|did not|isn t|aren t|wasn t|weren t|hasn t|haven t|hadn t|doesn t|don t|didn t|can t|cannot)\s+(?:(?:see|have|show|signs of|been|being)\s+)?(?:burning smell|burnt smell|smells? burnt|smoke|smoking|burned|burnt|scorched|melted|spark|sparks|sparking|arcing|short circuit|exposed wire|bare wire|bare conductor|exposed|bare|electric shock|tingling|water|wet|damp|rain ingress|rainwater|leak|leaking|flooded)(?:\s+(?:or|and)\s+(?:(?:see|have|show|signs of|been|being)\s+)?(?:burning smell|burnt smell|smells? burnt|smoke|smoking|burned|burnt|scorched|melted|spark|sparks|sparking|arcing|short circuit|exposed wire|bare wire|bare conductor|exposed|bare|electric shock|tingling|water|wet|damp|rain ingress|rainwater|leak|leaking|flooded))*\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function withoutPolicyNegations(input: string) {
  return input
    .replace(/\bkhong nong\b/g, "appliance_not_heating")
    .replace(/\bkhong len hinh\b/g, "appliance_no_picture")
    .replace(/\bkhong (?:lanh|mat)\b/g, "hvac_no_cooling")
    .replace(/\bkhong chay\b/g, "hvac_not_running")
    .replace(/\bkhong (?:co dien|len nguon)\b/g, "power_absent")
    .replace(/\b(?:no power|has no power|without power)\b/g, "power_absent")
    .replace(/\b(?:(?:is |are |was |were )?not cooling|does not cool|isn t cooling|aren t cooling|wasn t cooling|weren t cooling|doesn t cool)\b/g, "hvac_no_cooling")
    .replace(/\b(?:(?:is |are |was |were )?not heating|does not heat|isn t heating|aren t heating|wasn t heating|weren t heating|doesn t heat)\b/g, "appliance_not_heating")
    .replace(/\b(?:no picture|does not show (?:a )?picture|doesn t show (?:a )?picture)\b/g, "appliance_no_picture")
    .replace(/\b(?:does not turn on|doesn t turn on|won t turn on|can t turn on|cannot turn on|has not turned on|hasn t turned on)\b/g, "appliance_not_running")
    .replace(/\b(?:(?:is |are |was |were )?not (?:running|working)|does not (?:run|work)|isn t (?:running|working)|aren t (?:running|working)|wasn t (?:running|working)|weren t (?:running|working)|doesn t (?:run|work))\b/g, "hvac_not_running")
    .replace(/\bkhong\b(?:(?!\b(?:nhung|ma|con|tuy nhien)\b)[^,.;])*/g, " ")
    .replace(/\bchua\b(?:(?!\b(?:nhung|ma|con|tuy nhien)\b)[^,.;])*/g, " ")
    .replace(/\b(?:no|not|without|isn t|aren t|wasn t|weren t|hasn t|haven t|hadn t|doesn t|don t|didn t|won t|can t|cannot)\b(?:(?!\b(?:but|however|while)\b)[^,.;])*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function policyClauses(input: string) {
  return input
    .split(/[,.;]|\b(?:nhung|ma|con|va|but|however|while)\b/g)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function punctuationClauses(input: string) {
  return input
    .split(/[,.;]/g)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function proximityClauses(input: string) {
  return input
    .split(/[,.;]|\b(?:nhung|ma|con|but|however|while)\b/g)
    .map((clause) => clause.trim())
    .filter(Boolean);
}
