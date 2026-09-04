import { SERVICE_TYPES, type ServiceType } from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { asBoolean, nullableServiceType, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { AdminSystemContracts } from "../contracts/admin-system.ts";
import { asRecord, asRows, requiredInteger, requiredString, serializeSystemReceipt, type SystemRow } from "./system-shared.ts";

type AdminSystemReceipt = AdminSystemContracts["receipt"];
type AdminSystemTaxonomyDetailResponse = AdminSystemContracts["taxonomyDetailResponse"];
type AdminSystemTaxonomyListInput = AdminSystemContracts["taxonomyListInput"];
type AdminSystemTaxonomyListResponse = AdminSystemContracts["taxonomyListResponse"];
type AdminSystemTaxonomyMutationInput = AdminSystemContracts["taxonomyMutationInput"];
type AdminSystemTaxonomyService = AdminSystemTaxonomyListResponse["records"][number];
type AdminSystemTaxonomyProblem = NonNullable<AdminSystemTaxonomyService["problems"]>[number];
type AdminSystemTaxonomyValidationResponse = AdminSystemContracts["taxonomyValidationResponse"];

const CATEGORY_SELECT = "id,service_type,slug,label_vi,label_en,is_active,sort_order,revision,updated_at";
const PROBLEM_SELECT = "id,service_category_id,service_type,slug,label_vi,label_en,default_complexity,is_active,sort_order,updated_at";

export async function listSystemTaxonomy(ctx: MobileApiContext, input: AdminSystemTaxonomyListInput): Promise<AdminSystemTaxonomyListResponse> {
  const services = await loadTaxonomy(ctx, true);
  const normalized = input.query.trim().toLocaleLowerCase();
  const records = services.filter((service) => {
    if (normalized && !`${service.service_type} ${service.slug} ${service.label_vi} ${service.label_en ?? ""} ${(service.problems ?? []).map((problem) => `${problem.slug} ${problem.label_vi} ${problem.label_en ?? ""}`).join(" ")}`.toLocaleLowerCase().includes(normalized)) return false;
    if (input.status !== "all" && !service.problems?.some((problem) => problem.is_active === (input.status === "active"))) return false;
    if (input.complexity !== "all" && !service.problems?.some((problem) => problem.default_complexity === input.complexity)) return false;
    if (input.baseline !== "all" && !service.problems?.some((problem) => problem.quote_ready === (input.baseline === "available"))) return false;
    return true;
  }).slice(0, input.limit).map(({ problems: _problems, ...service }) => service);
  const active = services.reduce((total, service) => total + service.active_problem_count, 0);
  const inactive = services.reduce((total, service) => total + service.inactive_problem_count, 0);
  const quoteReady = services.reduce((total, service) => total + service.quote_ready_problem_count, 0);
  return {
    generated_at: new Date().toISOString(),
    data_quality: services.length === SERVICE_TYPES.length ? services.some((service) => service.data_quality === "partial") ? "partial" : "available" : services.length > 0 ? "partial" : "unavailable",
    summary: { canonical_service_count: services.length, active_problem_count: active, inactive_problem_count: inactive, missing_baseline_count: Math.max(0, active - quoteReady) },
    records,
    has_more: false,
    next_cursor: null,
    next_offset: null,
  };
}

export async function getSystemTaxonomy(ctx: MobileApiContext, rawServiceType: string): Promise<AdminSystemTaxonomyDetailResponse> {
  const serviceType = parseServiceType(rawServiceType);
  const service = (await loadTaxonomy(ctx, true)).find((item) => item.service_type === serviceType);
  if (!service) apiFailure("NOT_FOUND", "Không tìm thấy cấu trúc dịch vụ", 404);
  const history = await dbQuery<SystemRow[]>(db(ctx).from("service_taxonomy_revisions").select("id,revision,actor_id,reason,created_at,before_snapshot,after_snapshot").eq("service_type", serviceType).order("revision", { ascending: false }).limit(50));
  if (history.error) apiFailure("DB_ERROR", "Không thể tải lịch sử cấu trúc dịch vụ", 500);
  return {
    generated_at: new Date().toISOString(),
    data_quality: service.data_quality,
    record: service,
    version: service.revision,
    history: (history.data ?? []).map((row) => ({
      id: requiredString(row, "id"), revision: requiredInteger(row, "revision"), actor_id: requiredString(row, "actor_id"), reason: requiredString(row, "reason"), recorded_at: requiredString(row, "created_at"),
    })),
    available_actions: ["edit_labels", "create_problem", "update_problem", "reorder_problem", "activate_problem", "deactivate_problem"],
    permission: "manage",
  };
}

export async function validateSystemTaxonomy(ctx: MobileApiContext, rawServiceType: string, input: AdminSystemTaxonomyMutationInput): Promise<AdminSystemTaxonomyValidationResponse> {
  const before = (await getSystemTaxonomy(ctx, rawServiceType)).record;
  if (before.revision !== input.expected_revision) apiFailure("CONFLICT", "Cấu trúc dịch vụ đã thay đổi; hãy rà soát lại", 409);
  const after = structuredClone(before);
  if (input.service_patch?.label_vi) after.label_vi = input.service_patch.label_vi;
  if (input.service_patch?.label_en) after.label_en = input.service_patch.label_en;
  const problems = after.problems ?? [];
  const issues: string[] = [];
  let activated = 0;
  let deactivated = 0;
  for (const change of input.problem_changes) {
    if (change.action === "create") {
      if (problems.some((problem) => problem.slug === change.value.slug)) issues.push("problem_slug_duplicate");
      problems.push({ id: `new:${change.value.slug}`, ...change.value, is_active: false, quote_ready: false, reference_count: 0, updated_at: new Date().toISOString() });
      continue;
    }
    const problem = problems.find((item) => item.id === change.id);
    if (!problem) { issues.push("problem_not_found"); continue; }
    if (change.action === "update") Object.assign(problem, change.patch);
    if (change.action === "reorder") problem.sort_order = change.sort_order;
    if (change.action === "activate") {
      if (!problem.quote_ready) issues.push(`baseline_missing:${problem.id}`);
      else if (!problem.is_active) { problem.is_active = true; activated += 1; }
    }
    if (change.action === "deactivate" && problem.is_active) { problem.is_active = false; deactivated += 1; }
  }
  after.problems = problems.sort((a, b) => a.sort_order - b.sort_order);
  after.active_problem_count = problems.filter((problem) => problem.is_active).length;
  after.inactive_problem_count = problems.length - after.active_problem_count;
  after.quote_ready_problem_count = problems.filter((problem) => problem.quote_ready).length;
  return {
    generated_at: new Date().toISOString(), valid: issues.length === 0, before, after,
    impact: { activated_problem_count: activated, deactivated_problem_count: deactivated, affected_reference_count: problems.filter((problem) => !problem.is_active).reduce((total, problem) => total + problem.reference_count, 0) },
    issues,
  };
}

export async function updateSystemTaxonomy(ctx: MobileApiContext, rawServiceType: string, input: AdminSystemTaxonomyMutationInput): Promise<AdminSystemReceipt> {
  const serviceType = parseServiceType(rawServiceType);
  const preview = await validateSystemTaxonomy(ctx, serviceType, input);
  if (!preview.valid) apiFailure("VALIDATION", "Thay đổi cấu trúc dịch vụ chưa hợp lệ", 400);
  const result = await dbQuery<unknown>(db(ctx).rpc("admin_apply_service_taxonomy_revision", {
    p_actor_id: ctx.user.id,
    p_service_type: serviceType,
    p_expected_revision: input.expected_revision,
    p_client_request_id: input.client_request_id,
    p_reason: input.reason,
    p_service_patch: input.service_patch ?? {},
    p_problem_changes: input.problem_changes,
  }));
  if (result.error) apiFailure(result.error.code === "40001" ? "CONFLICT" : "DB_ERROR", result.error.code === "40001" ? "Cấu trúc dịch vụ đã thay đổi; hãy rà soát lại" : "Không thể lưu cấu trúc dịch vụ", result.error.code === "40001" ? 409 : 500);
  return serializeSystemReceipt(result.data);
}

async function loadTaxonomy(ctx: MobileApiContext, includeProblems: boolean): Promise<AdminSystemTaxonomyService[]> {
  const client = db(ctx);
  const [categories, problems, baselines, references] = await Promise.all([
    dbQuery<SystemRow[]>(client.from("service_categories").select(CATEGORY_SELECT).order("sort_order", { ascending: true })),
    dbQuery<SystemRow[]>(client.from("service_problems").select(PROBLEM_SELECT).order("sort_order", { ascending: true })),
    dbQuery<SystemRow[]>(client.from("price_baselines").select("service_problem_id").eq("lifecycle", "active")),
    dbQuery<SystemRow[]>(client.from("jobs").select("service_problem_id")),
  ]);
  if (categories.error || problems.error || baselines.error || references.error) apiFailure("DB_ERROR", "Không thể tải cấu trúc dịch vụ", 500);
  const quoteReadyIds = new Set((baselines.data ?? []).map((row) => nullableString(row.service_problem_id)).filter(Boolean));
  const referenceCounts = new Map<string, number>();
  for (const row of references.data ?? []) {
    const problemId = nullableString(row.service_problem_id);
    if (problemId) referenceCounts.set(problemId, (referenceCounts.get(problemId) ?? 0) + 1);
  }
  const problemsByCategory = new Map<string, AdminSystemTaxonomyProblem[]>();
  for (const row of problems.data ?? []) {
    const categoryId = requiredString(row, "service_category_id");
    const id = requiredString(row, "id");
    const complexity = parseComplexity(requiredString(row, "default_complexity"));
    const problem: AdminSystemTaxonomyProblem = {
      id, slug: requiredString(row, "slug"), label_vi: requiredString(row, "label_vi"), label_en: nullableString(row.label_en),
      default_complexity: complexity, is_active: asBoolean(row.is_active), sort_order: requiredInteger(row, "sort_order"),
      quote_ready: quoteReadyIds.has(id), reference_count: referenceCounts.get(id) ?? 0, updated_at: requiredString(row, "updated_at"),
    };
    problemsByCategory.set(categoryId, [...(problemsByCategory.get(categoryId) ?? []), problem]);
  }
  return (categories.data ?? []).map((row) => {
    const serviceType = nullableServiceType(row.service_type);
    if (!serviceType) apiFailure("DB_ERROR", "Loại dịch vụ hệ thống không hợp lệ", 500);
    const serviceProblems = problemsByCategory.get(requiredString(row, "id")) ?? [];
    const labelEn = nullableString(row.label_en);
    const dataQuality = labelEn && serviceProblems.every((problem) => problem.label_en) ? "available" : "partial";
    return {
      id: requiredString(row, "id"), service_type: serviceType, slug: requiredString(row, "slug"), label_vi: requiredString(row, "label_vi"), label_en: labelEn,
      revision: requiredInteger(row, "revision"), active_problem_count: serviceProblems.filter((problem) => problem.is_active).length,
      inactive_problem_count: serviceProblems.filter((problem) => !problem.is_active).length, quote_ready_problem_count: serviceProblems.filter((problem) => problem.quote_ready).length,
      data_quality: dataQuality, updated_at: requiredString(row, "updated_at"), ...(includeProblems ? { problems: serviceProblems } : {}),
    };
  });
}

function parseServiceType(value: string): ServiceType {
  if (!SERVICE_TYPES.includes(value as ServiceType)) apiFailure("VALIDATION", "Loại dịch vụ không hợp lệ", 400);
  return value as ServiceType;
}

function parseComplexity(value: string): AdminSystemTaxonomyProblem["default_complexity"] {
  if (value !== "small" && value !== "medium" && value !== "large") apiFailure("DB_ERROR", "Độ phức tạp taxonomy không hợp lệ", 500);
  return value;
}
