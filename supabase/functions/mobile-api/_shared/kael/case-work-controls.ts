import {
  kaelDiagnosisScopeArtifactSchema,
  type KaelDiagnosisScopeArtifact,
} from "./artifact-contract.ts";
import type {
  KaelCaseWorkServiceType,
  KaelPerformanceProfile,
} from "./performance-profiles.ts";

export function resolveProfileFactCoverage(
  profile: Readonly<KaelPerformanceProfile>,
  candidateFacts: Record<string, unknown>,
) {
  const facts: Record<string, string> = {};
  for (const driver of profile.quote_drivers) {
    const value = candidateFacts[driver];
    if (typeof value !== "string") continue;
    const normalized = value.trim().slice(0, 500);
    if (normalized) facts[driver] = normalized;
  }
  return {
    facts,
    missing: profile.quote_drivers.filter((driver) => !facts[driver]),
  };
}

export function buildProfileSafetyFlags(
  profile: Readonly<KaelPerformanceProfile>,
  candidateSignals: readonly string[],
  language: "vi" | "en" = "vi",
): KaelDiagnosisScopeArtifact["safety_flags"] {
  const signals = new Set(candidateSignals);
  return profile.safety_capability_gates.flatMap((gate) => {
    if (!gate.trigger_signals.some((signal) => signals.has(signal))) return [];
    const severity = gate.required_action === "customer_safety_step" ||
        gate.required_action === "specialist_handoff"
      ? "stop" as const
      : "review" as const;
    return [{
      code: gate.id,
      severity,
      customer_message: safetyGateCustomerMessage(gate.required_action, language),
    }];
  });
}

function safetyGateCustomerMessage(
  action: KaelPerformanceProfile["safety_capability_gates"][number]["required_action"],
  language: "vi" | "en",
) {
  if (action === "customer_safety_step") {
    return language === "en"
      ? "Stop using the area or device that may be unsafe and wait for a qualified professional to inspect it."
      : "Tạm dừng sử dụng khu vực hoặc thiết bị có dấu hiệu nguy hiểm và chờ người đủ chuyên môn kiểm tra.";
  }
  if (action === "on_site_assessment") {
    return language === "en"
      ? "This case needs an on-site assessment before Kael can finalize the scope or price."
      : "Ca này cần đánh giá trực tiếp trước khi Kael có thể chốt phạm vi hoặc giá.";
  }
  if (action === "specialist_handoff") {
    return language === "en"
      ? "The current signs require a suitably qualified specialist; Kael has not opened an automatic offer."
      : "Dấu hiệu hiện tại cần chuyển cho thợ chuyên môn phù hợp; Kael chưa mở báo giá tự động.";
  }
  return language === "en"
    ? "Kael will only look for a worker whose verified capabilities match these signs."
    : "Kael chỉ tìm thợ có năng lực đã xác minh phù hợp với dấu hiệu này.";
}

export type CaseWorkEvidenceRequest = {
  blocker: "handyman_visual_evidence" | "upholstery_condition_visual_evidence";
  evidenceKind: "photo";
  prompt: string;
};

const UPHOLSTERY_VISUAL_PROBLEM_SLUGS = new Set([
  "stain_treatment",
  "odor_or_mold",
]);

export function requiredCaseWorkEvidenceRequest(input: {
  serviceType: KaelCaseWorkServiceType;
  problemCategory: string;
  customerMessage: string;
  evidence: KaelDiagnosisScopeArtifact["evidence"];
  language?: "vi" | "en";
}): CaseWorkEvidenceRequest | null {
  if (hasModelEligibleVisualEvidence(input.evidence)) return null;

  if (input.serviceType === "handyman") {
    return {
      blocker: "handyman_visual_evidence",
      evidenceKind: "photo",
      prompt: input.language === "en"
        ? "Send one clear photo of the item and the installation area so Kael can check the surface, size, and tools needed."
        : "Bạn gửi một ảnh thấy rõ vật cần sửa/lắp và vị trí thi công để Kael kiểm tra bề mặt, kích thước và dụng cụ cần chuẩn bị.",
    };
  }

  if (
    input.serviceType === "upholstery" &&
    (
      UPHOLSTERY_VISUAL_PROBLEM_SLUGS.has(input.problemCategory) ||
      upholsteryConditionNeedsVisual(input.customerMessage)
    )
  ) {
    return {
      blocker: "upholstery_condition_visual_evidence",
      evidenceKind: "photo",
      prompt: input.language === "en"
        ? "Send one photo of the whole item and one close-up of the material or stain so Kael does not misstate the cleaning scope."
        : "Bạn gửi một ảnh toàn bộ món đồ và một ảnh cận chất liệu/vết cần xử lý để Kael không báo sai phạm vi vệ sinh.",
    };
  }

  return null;
}

export function buildPriceEvidenceUnavailableArtifact(
  artifact: KaelDiagnosisScopeArtifact,
  input: {
    customerDetail: string;
    scopeSummary?: string | null;
  },
): KaelDiagnosisScopeArtifact {
  const scopeSummary = input.scopeSummary?.trim() ||
    artifact.scope_summary ||
    input.customerDetail.trim() ||
    null;
  return kaelDiagnosisScopeArtifactSchema.parse({
    ...artifact,
    case_phase: "analysis",
    facts: {
      ...artifact.facts,
      ...(input.customerDetail.trim()
        ? { latest_customer_detail: input.customerDetail.trim() }
        : {}),
      price_readiness: "validated_price_evidence_unavailable",
    },
    missing_facts: [],
    scope_summary: scopeSummary,
    quote_ready: false,
    quote_blockers: ["validated_price_evidence"],
    confidence: Math.min(artifact.confidence, 0.5),
    next_action: {
      kind: "escalate",
      reason: "validated_price_evidence_unavailable",
    },
    updated_at: new Date().toISOString(),
  });
}

function hasModelEligibleVisualEvidence(
  evidence: KaelDiagnosisScopeArtifact["evidence"],
) {
  return evidence.some((item) =>
    item.model_eligible &&
    (item.kind === "photo" || item.kind === "video_frame")
  );
}

function upholsteryConditionNeedsVisual(value: string) {
  const normalized = normalizeVietnamese(value)
    .replace(
      /\b(?:khong|ko|chua)\s+(?:co\s+)?(?:vet ban|vet o|mui|moc|nam moc)\b/g,
      " ",
    );
  return /\b(?:vet ban|vet o|moc|nam moc|child accident|tre nho|em be|be lam ban|khong ro chat lieu|chua ro chat lieu|unknown material)\b/.test(
    normalized,
  );
}

function normalizeVietnamese(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
