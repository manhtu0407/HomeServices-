import { resolveProfileFactCoverage } from "./case-work-controls.ts";
import {
  applyHardRoutingPolicy,
  getRequiredSlotPolicy,
  resolveRequiredSlotCoverage,
  scanIntakeSafetySignals,
} from "./electrical-intake-policy.ts";
import { getKaelPerformanceProfile } from "./performance-profiles.ts";
import {
  ELECTRICAL_PLAYBOOK_VERSION,
  isElectricalPlaybookEnabled,
} from "./playbooks/electrical.ts";
import { kaelIntakeDiagnosisPromptVersion } from "./prompts.ts";
import type { IntakeEvalObservation } from "./types.ts";
import {
  intakeEvalObservationSchema,
  KAEL_ELECTRICAL_BRANCH_CLARIFICATION_SLOTS,
} from "./types.ts";

export function isIntakeEvalObservationExposureEnabled() {
  const deno = (globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno;
  const value = deno?.env?.get?.("KAEL_INTAKE_EVAL_OBSERVATION_ENABLED");
  return typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function resolveElectricalIntakeRuntime(input: {
  intakeDiagnosisEnabled: boolean;
  serviceType: string;
  problemChips: readonly string[];
  description: string;
  priorSafetySignals?: readonly string[];
}) {
  const enabled = input.serviceType === "electrical" &&
    isElectricalPlaybookEnabled();
  const text = [...input.problemChips, input.description]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(". ");
  return {
    enabled,
    safetySignals: enabled
      ? mergeIntakeSafetySignals({
        serviceType: "electrical",
        deterministic: [
          ...(input.priorSafetySignals ?? []),
          ...scanIntakeSafetySignals("electrical", text),
        ],
        reported: [],
      })
      : [],
    hardRoute: enabled
      ? applyHardRoutingPolicy({
        selectedService: "electrical",
        text,
      })
      : null,
  };
}

export function mergeIntakeSafetySignals(input: {
  serviceType: string;
  deterministic: readonly string[];
  reported: readonly string[];
}) {
  const profile = getKaelPerformanceProfile(input.serviceType);
  const allowed = new Set(
    profile?.safety_capability_gates.flatMap((gate) => [...gate.trigger_signals]) ?? [],
  );
  return [...new Set([...input.deterministic, ...input.reported])]
    .filter((signal) => allowed.has(signal));
}

export function resolveIntakeFactCoverage(input: {
  serviceType: string;
  problemSlug: string;
  profileFacts: Record<string, unknown>;
  providerMissingSlots: readonly string[];
  providerNeedsClarification: boolean;
  electricalPlaybookEnabled: boolean;
}) {
  const profile = getKaelPerformanceProfile(input.serviceType);
  const requiredPolicy = input.electricalPlaybookEnabled
    ? getRequiredSlotPolicy("electrical", input.problemSlug)
    : null;
  const coverage = profile
    ? requiredPolicy
      ? resolveRequiredSlotCoverage(profile, input.problemSlug, input.profileFacts)
      : resolveProfileFactCoverage(profile, input.profileFacts)
    : { facts: {} as Record<string, string>, missing: [] as readonly string[] };
  const providerMissing = requiredPolicy
    ? input.providerMissingSlots.filter((slot) =>
      requiredPolicy.minimumSlots.includes(slot) && !coverage.facts[slot]
    )
    : input.providerMissingSlots;
  const safetyClarificationMissing = input.providerNeedsClarification
    ? input.providerMissingSlots.filter((slot) =>
      KAEL_ELECTRICAL_BRANCH_CLARIFICATION_SLOTS.includes(
        slot as (typeof KAEL_ELECTRICAL_BRANCH_CLARIFICATION_SLOTS)[number],
      ) && slot.startsWith("safety_")
    )
    : [];
  const missing = [...new Set([
    ...coverage.missing,
    ...providerMissing,
    ...safetyClarificationMissing,
  ])];
  return {
    facts: coverage.facts,
    missing,
    needsClarification: requiredPolicy
      ? missing.length > 0
      : input.providerNeedsClarification || coverage.missing.length > 0,
  };
}

export function buildIntakeObservation(input: {
  scopeSignal: IntakeEvalObservation["scopeSignal"];
  suggestedService: IntakeEvalObservation["suggestedService"];
  problemSlug: string | null;
  needsClarification: boolean;
  safetySignals: readonly string[];
  modelId: string;
  serviceType: string;
  electricalPlaybookEnabled: boolean;
}): IntakeEvalObservation | undefined {
  if (
    input.serviceType !== "electrical" ||
    (!input.electricalPlaybookEnabled && !isIntakeEvalObservationExposureEnabled())
  ) {
    return undefined;
  }
  const parsed = intakeEvalObservationSchema.safeParse({
    scopeSignal: input.scopeSignal,
    suggestedService: input.suggestedService,
    problemSlug: input.problemSlug,
    needsClarification: input.needsClarification,
    safetySignals: [...new Set(input.safetySignals)].slice(0, 8),
    modelId: input.modelId,
    promptVersion: kaelIntakeDiagnosisPromptVersion(input.serviceType),
    playbookVersion: input.serviceType === "electrical" &&
        input.electricalPlaybookEnabled
      ? ELECTRICAL_PLAYBOOK_VERSION
      : null,
  });
  return parsed.success ? parsed.data : undefined;
}

export function buildFocusedClarificationQuestion(
  missingSlot: string,
  language: "vi" | "en",
) {
  const slot = missingSlot.toLowerCase();
  const compositeQuestions: Record<string, Record<"vi" | "en", string>> = {
    breaker_state: {
      vi: "Aptomat hiện đang bật/tắt/đã nhảy, hay đã nhảy lại sau lần bật lại trước đó?",
      en: "Is the breaker currently on/off/tripped, or did it re-trip after a reset already attempted?",
    },
    safety_water_proximity: {
      vi: "Khu vực công tắc có đang ẩm ướt hoặc gần nguồn nước không?",
      en: "Is the switch area wet or near a water source?",
    },
    safety_spark_marks: {
      vi: "Ổ cắm có vết cháy hoặc tia lửa lặp lại không?",
      en: "Are there scorch marks or repeated sparks at the outlet?",
    },
    affected_area_and_power_state: {
      vi: "Tình trạng cấp điện hiện tại tại khu vực bị ảnh hưởng là gì?",
      en: "What is the current power state in the affected area?",
    },
    symptom_and_duration: {
      vi: "Bạn đang thấy dấu hiệu gì, bắt đầu từ khi nào?",
      en: "What symptom appeared, starting when?",
    },
    access_and_concealed_wiring: {
      vi: "Đường dây cần xử lý đang đi nổi hay âm tường, có dễ tiếp cận không?",
      en: "How accessible is the exposed or concealed wiring route?",
    },
    parts_or_new_device_requirement: {
      vi: "Thiết bị hoặc vật tư cần lắp đã có sẵn chưa?",
      en: "Is the required device or part already available?",
    },
  };
  const compositeQuestion = compositeQuestions[slot]?.[language];
  if (compositeQuestion) return compositeQuestion;
  if (/(?:time|window|schedule|urgency|duration|history)/.test(slot)) {
    return language === "en"
      ? "When do you need this work completed?"
      : "Bạn muốn công việc được thực hiện vào thời điểm nào?";
  }
  if (/(?:area|room|location|access|concealed|occupancy|height)/.test(slot)) {
    return language === "en"
      ? "Where exactly is the affected area in the apartment?"
      : "Khu vực cần xử lý nằm chính xác ở đâu trong căn hộ?";
  }
  if (/(?:count|quantity|volume|task)/.test(slot)) {
    return language === "en"
      ? "How many items need to be handled?"
      : "Có bao nhiêu hạng mục cần được xử lý?";
  }
  if (/(?:material|surface|fabric|pipe|fixture|device|circuit|unit_type|capacity)/.test(slot)) {
    return language === "en"
      ? "What type of material or device needs service?"
      : "Loại vật liệu hoặc thiết bị cần xử lý là gì?";
  }
  if (/(?:part|supply|equipment|consumable|hardware|new_device)/.test(slot)) {
    return language === "en"
      ? "Do you already have the required part?"
      : "Bạn đã có sẵn vật tư cần dùng chưa?";
  }
  if (/(?:symptom|condition|severity|damage|fault|sign|stain|odor|mold)/.test(slot)) {
    return language === "en"
      ? "What is the clearest symptom you can observe?"
      : "Dấu hiệu rõ nhất bạn đang quan sát được là gì?";
  }
  return language === "en"
    ? "Which specific task do you want Kael to handle?"
    : "Bạn muốn Kael xử lý hạng mục cụ thể nào?";
}
