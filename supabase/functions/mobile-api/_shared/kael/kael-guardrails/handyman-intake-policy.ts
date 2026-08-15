import { resolveProfileFactCoverage } from "./case-work-controls.ts";
import type { KaelPerformanceProfile } from "../learning/performance-profiles.ts";

const CABINET_HINGE_REQUIRED_PROFILE_SLOTS = [
  "task_types_and_total_count",
  "item_dimensions_weight_and_quantity",
  "wall_surface_or_substrate",
  "mounting_location_access_and_height",
  "parts_hardware_and_tools_available",
  "concealed_services_and_load_requirement",
] as const;

const CABINET_HINGE_SCOPE_SLOT = "requested_scope_and_exclusions";

export function resolveHandymanIntakeFactCoverage(input: {
  profile: Readonly<KaelPerformanceProfile>;
  problemSlug: string;
  candidateFacts: Record<string, unknown>;
  customerDescription: string;
}) {
  const coverage = resolveProfileFactCoverage(input.profile, input.candidateFacts);
  if (input.problemSlug !== "repair_hinge_or_handle") return coverage;

  const grounded = groundedCabinetHingeFacts(input.customerDescription);
  const facts = { ...coverage.facts };
  const missing: string[] = CABINET_HINGE_REQUIRED_PROFILE_SLOTS.filter((slot) => {
    const customerFact = grounded.get(slot);
    if (customerFact) {
      facts[slot] = customerFact;
      return false;
    }
    delete facts[slot];
    return true;
  });
  if (!hasGroundedCabinetHingeScope(input.customerDescription)) missing.push(CABINET_HINGE_SCOPE_SLOT);
  return { facts, missing };
}

function groundedCabinetHingeFacts(value: string) {
  const text = normalize(value);
  const facts = new Map<string, string>();
  const clauses = value.split(/[.!?;\r\n]+/u).map((clause) => clause.trim()).filter(Boolean);
  const clauseMatching = (pattern: RegExp) =>
    clauses.find((clause) => pattern.test(normalize(clause)))?.slice(0, 500);
  const hasDoorCount = /\b(?:1|mot|one)\s+(?:canh(?:\s+tu)?|hang\s+muc|cong\s+viec|cabinet\s+door|door|task)\b/.test(text);
  const hasHingeCount = /\b(?:2|hai|two)\s+(?:ban\s+le|hinges?)\b/.test(text);
  const countFact = clauseMatching(/\b(?:1|mot|one)\s+(?:canh(?:\s+tu)?|hang\s+muc|cong\s+viec|cabinet\s+door|door|task)\b/);
  if (hasDoorCount && countFact) facts.set("task_types_and_total_count", countFact);
  if (hasDoorCount && hasHingeCount && countFact) facts.set("item_dimensions_weight_and_quantity", countFact);

  const hasSubstrate = /\b(?:go|mdf|van\s+ep|plywood|particle\s+board|nhua|plastic|kim\s+loai|metal)\b/.test(text);
  const hasSubstrateCondition = /\b(?:con\s+nguyen|nguyen\s+ven|khong\s+(?:nut|muc|cong|vo|hong|toet)|intact|no\s+(?:crack|rot|warp|damage|stripped))\b/.test(text);
  const substrateFact = clauseMatching(/\b(?:go|mdf|van\s+ep|plywood|particle\s+board|nhua|plastic|kim\s+loai|metal)\b/);
  if (hasSubstrate && hasSubstrateCondition && substrateFact) {
    facts.set("wall_surface_or_substrate", substrateFact);
  }

  const accessFact = clauseMatching(/\b(?:tiep\s+can|thao\s+tac|ngang\s+hong|binh\s+thuong|tren\s+cao|bac\s+thang|accessible|access|waist\s+height|room\s+to\s+work|ladder)\b/);
  if (accessFact) {
    facts.set("mounting_location_access_and_height", accessFact);
  }

  const hasHardware = /\b(?:ban\s+le|oc|vit|hinge|screw|hardware)\b/.test(text);
  const hasHardwareState = /\b(?:con\s+nguyen|co\s+san|khong\s+(?:nut|hong|can\s+thay)|thay\s+the|intact|available|replacement|no\s+replacement)\b/.test(text);
  const hardwareFact = clauseMatching(/\b(?:ban\s+le|oc|vit|hinge|screw|hardware)\b[\s\S]{0,180}\b(?:con\s+nguyen|co\s+san|khong\s+(?:nut|hong|can\s+thay)|thay\s+the|intact|available|replacement|no\s+replacement)\b/);
  if (hasHardware && hasHardwareState && hardwareFact) {
    facts.set("parts_hardware_and_tools_available", hardwareFact);
  }

  if (/\b(?:lo\s+vit|khung|canh|screw\s+hole|frame|door)\b/.test(text) &&
    /\b(?:khong\s+(?:toet|nut|muc|cong|hong)|con\s+nguyen|intact|no\s+(?:stripped|crack|rot|warp|damage))\b/.test(text)) {
    const conditionFact = clauseMatching(/\b(?:lo\s+vit|khung|canh|screw\s+hole|frame|door)\b/);
    if (conditionFact) facts.set("concealed_services_and_load_requirement", conditionFact);
  }
  return facts;
}

function hasGroundedCabinetHingeScope(value: string) {
  const text = normalize(value);
  const hasIncludedScope = /\b(?:chi|pham\s+vi|only|include)\b[\s\S]{0,240}\b(?:kiem\s+tra|siet|can\s+chinh|adjust|tighten|inspect)\b/.test(text);
  const hasExcludedScope = /\b(?:loai\s+tru|exclude|khong\s+(?:thay|va|khoan|sua)|no\s+(?:replacement|patching|drilling|repair))\b/.test(text);
  return hasIncludedScope && hasExcludedScope;
}

function normalize(value: string) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
