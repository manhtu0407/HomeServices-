import type {
  ScopeChangeComputeInput,
  ScopeChangeEstimateBody,
} from "../contracts/types.ts";

const NORMAL_ACCESS_FACT =
  "Điều kiện tiếp cận bình thường đã được khách xác nhận trong phạm vi gốc.";
const STANDARD_HINGE_FACT =
  "Phụ kiện thay thế là loại bản lề âm kiểu chén tương đương loại hiện có.";

export function groundScopeChangeEstimate(
  input: ScopeChangeComputeInput,
  estimate: ScopeChangeEstimateBody,
): ScopeChangeEstimateBody {
  const groundedFacts: string[] = [];
  let unknowns = estimate.unknowns;
  let pricingFactors = estimate.pricing_factors;

  if (
    estimate.pricing_factors.access_condition === "unknown" &&
    hasConfirmedNormalAccess(input.originalDescription) &&
    !hasRestrictedAccessSignal(
      `${input.workerReportedDescription}\n${input.workerReason}`,
    )
  ) {
    if (!estimate.confirmed_facts.some(mentionsAccessCondition)) {
      groundedFacts.push(NORMAL_ACCESS_FACT);
    }
    unknowns = unknowns.filter((unknown) =>
      !mentionsAccessCondition(unknown)
    );
    pricingFactors = { ...pricingFactors, access_condition: "normal" };
  }

  const workerScope = `${input.workerReportedDescription}\n${input.workerReason}`;
  if (
    estimate.problem_slug === "replace_cabinet_hinges" &&
    pricingFactors.material_tier === "unknown" &&
    hasStandardEquivalentHinge(input.workerReportedDescription) &&
    !hasSpecialtyHingeSignal(workerScope)
  ) {
    if (!estimate.confirmed_facts.some(mentionsHingeMaterial)) {
      groundedFacts.push(STANDARD_HINGE_FACT);
    }
    unknowns = unknowns.filter((unknown) => !mentionsHingeMaterial(unknown));
    pricingFactors = { ...pricingFactors, material_tier: "standard" };
  }

  if (pricingFactors === estimate.pricing_factors) return estimate;
  const retainedFactCount = Math.max(
    0,
    10 - groundedFacts.length,
  );
  return {
    ...estimate,
    confirmed_facts: [
      ...estimate.confirmed_facts.slice(0, retainedFactCount),
      ...groundedFacts,
    ],
    unknowns,
    pricing_factors: pricingFactors,
  };
}

function hasConfirmedNormalAccess(value: string) {
  const normalized = normalizeEvidence(value);
  if (hasRestrictedAccessSignal(normalized)) return false;
  return /(?:tiep can|loi vao|khong gian thao tac)[^.;\n]{0,60}(?:binh thuong|de dang|du cho|thuan loi)/u
      .test(normalized) ||
    /(?:binh thuong|de dang|du cho|thuan loi)[^.;\n]{0,60}(?:tiep can|thao tac|loi vao)/u
      .test(normalized);
}

function hasStandardEquivalentHinge(value: string) {
  const normalized = normalizeEvidence(value);
  return /\bthay\b/u.test(normalized) &&
    /ban le/u.test(normalized) &&
    /(?:tuong duong|tieu chuan)/u.test(normalized) &&
    /(?:ban le am|kieu chen|am kieu chen|35\s*mm)/u.test(normalized) &&
    !/(?:khong|chua)[^.;\n]{0,24}thay[^.;\n]{0,24}ban le/u.test(normalized);
}

function hasSpecialtyHingeSignal(value: string) {
  return /(?:dat rieng|chuyen dung|dac biet|nhap khau|khong tuong thich|khong ro (?:model|kich thuoc))/u
    .test(normalizeEvidence(value));
}

function hasRestrictedAccessSignal(value: string) {
  const normalized = normalizeEvidence(value);
  return /(?:tiep can|loi vao|khong gian thao tac)[^.;\n]{0,60}(?:kho|han che|chat|hep|bi che|tren cao|can thang)/u
      .test(normalized) ||
    /(?:kho|han che|chat|hep|bi che|tren cao|can thang)[^.;\n]{0,60}(?:tiep can|thao tac|loi vao)/u
      .test(normalized);
}

function mentionsAccessCondition(value: string) {
  return /(?:tiep can|loi vao|khong gian thao tac|access)/u.test(
    normalizeEvidence(value),
  );
}

function mentionsHingeMaterial(value: string) {
  return /(?:vat tu|phu kien|ban le thay the|hinge|hardware|material)/u.test(
    normalizeEvidence(value),
  );
}

function normalizeEvidence(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("vi-VN")
    .replace(/đ/g, "d");
}
