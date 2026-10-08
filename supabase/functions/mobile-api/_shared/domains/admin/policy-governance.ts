import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery } from "../../platform/db.ts";

type Row = Record<string, unknown>;
type QuoteMode = "kael_auto_quote" | "rfq" | "inspection_only" | "blocked";
type LifecycleAction = "approve" | "publish" | "rollback";
type EvidenceRequirements = {
  minimum_source_count: number;
  minimum_high_trust_source_count: number;
  requires_active_baseline: boolean;
  allow_live_market_evidence?: boolean;
};

export type IntakePolicyDraftInput = {
  problem_id: string;
  expected_revision: number;
  quote_mode: QuoteMode;
  tier_a_fields: string[];
  tier_b_slots: Array<{ key: string; enabled: boolean; required_for_quote: boolean }>;
  question_overrides: Record<string, { vi: string; en: string }>;
  safety_requirements: string[];
  capability_requirements: string[];
  evidence_requirements: EvidenceRequirements;
  reason: string;
};

export type IntakePolicyPreviewInput = {
  problem_id: string;
  version?: number;
  provided_fields: string[];
  provided_slots: string[];
};

export type IntakePolicyPreview = {
  policy_id: unknown;
  service_type: unknown;
  problem_slug: unknown;
  version: unknown;
  revision: unknown;
  quote_mode: unknown;
  missing_tier_a: string[];
  missing_tier_b: string[];
  order_eligible: boolean;
  quote_eligible: boolean;
  safety_requirements: string[];
  capability_requirements: string[];
  evidence_requirements: EvidenceRequirements;
};

export type PriceBaselineDraftInput = {
  problem_id: string;
  district_code: string;
  complexity: "small" | "medium" | "large";
  expected_revision: number;
  price_min: number;
  price_max: number;
  source: string;
  price_evidence: Record<string, unknown>;
  reason: string;
};

export async function listAdminIntakePolicies(ctx: MobileApiContext): Promise<unknown> {
  requireOwner(ctx);
  const [policyResult, headResult] = await Promise.all([
    dbQuery<Row[]>(db(ctx).from("service_intake_policies")
      .select("id,service_problem_id,service_type,problem_slug,version,status,quote_mode,tier_a_fields,tier_b_slots,question_overrides,safety_requirements,capability_requirements,evidence_requirements,reason,created_by,created_at,approved_by,approved_at,published_by,published_at,updated_by,updated_at")
      .order("service_type", { ascending: true })
      .order("problem_slug", { ascending: true })
      .order("version", { ascending: false })),
    dbQuery<Row[]>(db(ctx).from("service_intake_policy_heads")
      .select("service_problem_id,revision,active_version")),
  ]);
  if (policyResult.error || headResult.error) databaseFailure("Không thể tải chính sách tiếp nhận", policyResult.error ?? headResult.error ?? {});
  const heads = new Map((headResult.data ?? []).map((head) => [head.service_problem_id, head]));
  return {
    capabilities: governanceCapabilities(),
    policies: (policyResult.data ?? []).map((policy) => ({
      ...policy,
      service_intake_policy_heads: heads.get(policy.service_problem_id) ?? { active_version: null, revision: 0 },
    })),
  };
}

export async function draftAdminIntakePolicy(
  ctx: MobileApiContext,
  input: IntakePolicyDraftInput,
): Promise<unknown> {
  requireOwner(ctx);
  validatePolicyDraft(input);
  return rpcOne(ctx, "admin_draft_service_intake_policy", {
    p_actor_id: ctx.user.id,
    p_problem_id: input.problem_id,
    p_expected_revision: input.expected_revision,
    p_quote_mode: input.quote_mode,
    p_tier_a_fields: input.tier_a_fields,
    p_tier_b_slots: input.tier_b_slots,
    p_question_overrides: input.question_overrides,
    p_safety_requirements: input.safety_requirements,
    p_capability_requirements: input.capability_requirements,
    p_evidence_requirements: input.evidence_requirements,
    p_reason: input.reason.trim(),
  });
}

export async function transitionAdminIntakePolicy(
  ctx: MobileApiContext,
  policyId: string,
  action: LifecycleAction,
  input: { expected_revision: number; reason: string },
): Promise<unknown> {
  requireOwner(ctx);
  requireUuid(policyId, "Mã chính sách không hợp lệ");
  validateTransition(input);
  return rpcOne(ctx, "admin_transition_service_intake_policy", {
    p_actor_id: ctx.user.id,
    p_policy_id: policyId,
    p_expected_revision: input.expected_revision,
    p_action: action,
    p_reason: input.reason.trim(),
  });
}

export async function previewAdminIntakePolicy(
  ctx: MobileApiContext,
  input: IntakePolicyPreviewInput,
): Promise<IntakePolicyPreview> {
  requireOwner(ctx);
  requireUuid(input.problem_id, "Mã vấn đề dịch vụ không hợp lệ");
  const policy = await rpcOne<Row>(ctx, "admin_preview_service_intake_policy_v2", {
    p_problem_id: input.problem_id,
    p_version: input.version ?? null,
  });
  const tierA = stringArray(policy.tier_a_fields);
  const slots = Array.isArray(policy.tier_b_slots) ? policy.tier_b_slots : [];
  const providedFields = new Set(input.provided_fields.filter(isNonEmptyString));
  const providedSlots = new Set(input.provided_slots.filter(isNonEmptyString));
  const missingTierA = tierA.filter((field) => !providedFields.has(field));
  const missingTierB = slots.flatMap((candidate) => {
    if (!isRecord(candidate) || candidate.enabled !== true || !isNonEmptyString(candidate.key)) return [];
    return providedSlots.has(candidate.key) ? [] : [candidate.key];
  });
  const requiredTierB = slots.flatMap((candidate) => {
    if (!isRecord(candidate) || candidate.enabled !== true || candidate.required_for_quote !== true || !isNonEmptyString(candidate.key)) return [];
    return providedSlots.has(candidate.key) ? [] : [candidate.key];
  });
  return {
    policy_id: policy.policy_id,
    service_type: policy.service_type,
    problem_slug: policy.problem_slug,
    version: policy.version,
    revision: policy.revision,
    quote_mode: policy.quote_mode,
    missing_tier_a: missingTierA,
    missing_tier_b: missingTierB,
    order_eligible: missingTierA.length === 0,
    quote_eligible: missingTierA.length === 0 && requiredTierB.length === 0 && policy.quote_mode === "kael_auto_quote",
    safety_requirements: stringArray(policy.safety_requirements),
    capability_requirements: stringArray(policy.capability_requirements),
    evidence_requirements: parseEvidenceRequirements(policy.evidence_requirements),
  };
}

export async function listAdminPriceBaselineVersions(ctx: MobileApiContext): Promise<unknown> {
  requireOwner(ctx);
  const [versionResult, headResult] = await Promise.all([
    dbQuery<Row[]>(db(ctx).from("price_baseline_versions")
      .select("id,service_problem_id,service_type,district_code,complexity,version,status,price_min,price_max,source,price_evidence,reason,created_by,created_at,approved_by,approved_at,published_by,published_at,updated_by,updated_at")
      .order("updated_at", { ascending: false })),
    dbQuery<Row[]>(db(ctx).from("price_baseline_governance_heads")
      .select("service_problem_id,district_code,complexity,revision,active_version")),
  ]);
  if (versionResult.error || headResult.error) databaseFailure("Không thể tải phiên bản nền tảng giá", versionResult.error ?? headResult.error ?? {});
  const heads = new Map((headResult.data ?? []).map((head) => [priceScopeKey(head), head]));
  return {
    baselines: (versionResult.data ?? []).map((version) => ({
      ...version,
      price_baseline_governance_heads: heads.get(priceScopeKey(version)) ?? { active_version: null, revision: 0 },
    })),
    capabilities: governanceCapabilities(),
    evidence_quorum: { minimum_distinct_domains: 2, schema_version: "baseline_price_evidence.v1" },
  };
}

export async function draftAdminPriceBaseline(
  ctx: MobileApiContext,
  input: PriceBaselineDraftInput,
): Promise<unknown> {
  requireOwner(ctx);
  requireUuid(input.problem_id, "Mã vấn đề dịch vụ không hợp lệ");
  if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0 ||
    !Number.isSafeInteger(input.price_min) || input.price_min <= 0 ||
    !Number.isSafeInteger(input.price_max) || input.price_max < input.price_min ||
    !["small", "medium", "large"].includes(input.complexity) ||
    !isNonEmptyString(input.district_code) || !isNonEmptyString(input.source) ||
    !isRecord(input.price_evidence) || input.reason.trim().length < 8) {
    apiFailure("VALIDATION", "Bản nháp nền tảng giá không hợp lệ", 400);
  }
  return rpcOne(ctx, "admin_draft_price_baseline", {
    p_actor_id: ctx.user.id,
    p_problem_id: input.problem_id,
    p_district_code: input.district_code.trim(),
    p_complexity: input.complexity,
    p_expected_revision: input.expected_revision,
    p_price_min: input.price_min,
    p_price_max: input.price_max,
    p_source: input.source.trim(),
    p_price_evidence: input.price_evidence,
    p_reason: input.reason.trim(),
  });
}

export async function transitionAdminPriceBaseline(
  ctx: MobileApiContext,
  baselineVersionId: string,
  action: LifecycleAction,
  input: { expected_revision: number; reason: string },
): Promise<unknown> {
  requireOwner(ctx);
  requireUuid(baselineVersionId, "Mã phiên bản nền tảng giá không hợp lệ");
  validateTransition(input);
  return rpcOne(ctx, "admin_transition_price_baseline", {
    p_actor_id: ctx.user.id,
    p_baseline_version_id: baselineVersionId,
    p_expected_revision: input.expected_revision,
    p_action: action,
    p_reason: input.reason.trim(),
  });
}

function validatePolicyDraft(input: IntakePolicyDraftInput): void {
  requireUuid(input.problem_id, "Mã vấn đề dịch vụ không hợp lệ");
  const modes: QuoteMode[] = ["kael_auto_quote", "rfq", "inspection_only", "blocked"];
  if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0 ||
    !modes.includes(input.quote_mode) || input.reason.trim().length < 8 ||
    !input.tier_a_fields.every(isNonEmptyString) || !input.safety_requirements.every(isNonEmptyString) ||
    !input.capability_requirements.every(isNonEmptyString) || !isRecord(input.question_overrides) ||
    !validEvidenceRequirements(input.quote_mode, input.evidence_requirements) ||
    !input.tier_b_slots.every((slot) => isNonEmptyString(slot.key) &&
      typeof slot.enabled === "boolean" && typeof slot.required_for_quote === "boolean" &&
      isRecord(input.question_overrides[slot.key]) &&
      isNonEmptyString(input.question_overrides[slot.key]?.vi) &&
      isNonEmptyString(input.question_overrides[slot.key]?.en))) {
    apiFailure("VALIDATION", "Bản nháp chính sách tiếp nhận không hợp lệ", 400);
  }
}

function validEvidenceRequirements(mode: QuoteMode, value: unknown): value is EvidenceRequirements {
  if (!isRecord(value)) return false;
  const minimumSourceCount = value.minimum_source_count;
  const minimumHighTrustSourceCount = value.minimum_high_trust_source_count;
  const requiresActiveBaseline = value.requires_active_baseline;
  const allowLiveMarketEvidence = value.allow_live_market_evidence;
  if (allowLiveMarketEvidence !== undefined && typeof allowLiveMarketEvidence !== "boolean") return false;
  return Number.isSafeInteger(minimumSourceCount) && Number(minimumSourceCount) >= 0 && Number(minimumSourceCount) <= 50 &&
    Number.isSafeInteger(minimumHighTrustSourceCount) && Number(minimumHighTrustSourceCount) >= 0 &&
    Number(minimumHighTrustSourceCount) <= Number(minimumSourceCount) &&
    typeof requiresActiveBaseline === "boolean" &&
    (mode !== "kael_auto_quote" || (requiresActiveBaseline &&
      Number(minimumSourceCount) >= 2 && Number(minimumHighTrustSourceCount) >= 1) ||
      (allowLiveMarketEvidence === true &&
        Number(minimumSourceCount) >= 2 && Number(minimumHighTrustSourceCount) >= 2));
}

function parseEvidenceRequirements(value: unknown): EvidenceRequirements {
  if (!isRecord(value)) apiFailure("POLICY_UNAVAILABLE", "Yêu cầu bằng chứng của chính sách không hợp lệ", 503);
  const parsed = {
    minimum_source_count: value.minimum_source_count,
    minimum_high_trust_source_count: value.minimum_high_trust_source_count,
    requires_active_baseline: value.requires_active_baseline,
    ...(value.allow_live_market_evidence === undefined
      ? {}
      : { allow_live_market_evidence: value.allow_live_market_evidence }),
  };
  if (typeof parsed.minimum_source_count !== "number" ||
    typeof parsed.minimum_high_trust_source_count !== "number" ||
    typeof parsed.requires_active_baseline !== "boolean" ||
    (value.allow_live_market_evidence !== undefined &&
      typeof value.allow_live_market_evidence !== "boolean")) {
    apiFailure("POLICY_UNAVAILABLE", "Yêu cầu bằng chứng của chính sách không hợp lệ", 503);
  }
  return parsed as EvidenceRequirements;
}

function validateTransition(input: { expected_revision: number; reason: string }): void {
  if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0 || input.reason.trim().length < 8) {
    apiFailure("VALIDATION", "Lý do và phiên bản kỳ vọng không hợp lệ", 400);
  }
}

async function rpcOne<T extends Row = Row>(
  ctx: MobileApiContext,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await dbQuery<T[]>(db(ctx).rpc(name, args));
  if (result.error) databaseFailure("Không thể cập nhật cấu hình quản trị", result.error);
  const row = result.data?.[0];
  if (!row) apiFailure("NOT_FOUND", "Không tìm thấy cấu hình quản trị", 404);
  return row;
}

function databaseFailure(message: string, error: { code?: string; message?: string }): never {
  if (error.message?.includes("STALE_")) apiFailure("CONFLICT", "Cấu hình đã thay đổi, vui lòng tải lại", 409);
  if (error.message?.includes("MAKER_CHECKER")) apiFailure("AUTH_FORBIDDEN", "Người tạo không thể tự phê duyệt hoặc kích hoạt", 403);
  if (error.message?.includes("FLOOR_VIOLATION")) apiFailure("VALIDATION", "Không thể hạ thấp yêu cầu an toàn hoặc năng lực bắt buộc", 400);
  if (error.message?.includes("QUORUM_REQUIRED")) apiFailure("VALIDATION", "Chưa đủ hai nguồn bằng chứng giá độc lập", 400);
  apiFailure("DB_ERROR", message, 500);
}

function governanceCapabilities() {
  return { read: true, draft: true, approve: true, publish: true } as const;
}

function priceScopeKey(row: Row): string {
  return `${String(row.service_problem_id)}:${String(row.district_code)}:${String(row.complexity)}`;
}

function requireOwner(ctx: MobileApiContext): void {
  if (ctx.role !== "admin") apiFailure("AUTH_FORBIDDEN", "Chỉ Owner Admin được quản trị chính sách", 403);
}

function requireUuid(value: string, message: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    apiFailure("VALIDATION", message, 400);
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
