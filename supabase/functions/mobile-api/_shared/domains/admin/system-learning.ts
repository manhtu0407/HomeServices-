import { apiFailure } from "../../platform/api-failure.ts";
import { asBoolean, nullableNumber, nullableServiceType, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { AdminSystemContracts } from "../contracts/admin-system.ts";
import { decodeAdminSystemCursor, encodeAdminSystemCursor } from "./system-pagination.ts";
import { asRecord, requiredInteger, requiredNumber, requiredString, serializeSystemReceipt, type SystemRow } from "./system-shared.ts";

type AdminSystemLearningActionInput = AdminSystemContracts["learningActionInput"];
type AdminSystemLearningDetailResponse = AdminSystemContracts["learningDetailResponse"];
type AdminSystemLearningListInput = AdminSystemContracts["learningListInput"];
type AdminSystemLearningListResponse = AdminSystemContracts["learningListResponse"];
type AdminSystemLearningPreviewResponse = AdminSystemContracts["learningPreviewResponse"];
type AdminSystemLearningRuleSummary = AdminSystemLearningListResponse["records"][number];
type AdminSystemReceipt = AdminSystemContracts["receipt"];

const RULE_SELECT = "id,rule_type,affected_service,affected_problem,affected_district,rule_payload,confidence,evidence_count,status,active_version,rollback_available,created_at,updated_at";

export async function listSystemLearningRules(ctx: MobileApiContext, input: AdminSystemLearningListInput): Promise<AdminSystemLearningListResponse> {
  let query = db(ctx).from("learning_rules").select(RULE_SELECT).order("updated_at", { ascending: false }).limit(1000);
  if (input.status !== "all") query = query.eq("status", input.status);
  if (input.rule_type !== "all") query = query.eq("rule_type", input.rule_type);
  if (input.service_type !== "all") query = query.eq("affected_service", input.service_type);
  if (input.problem !== "all") query = query.eq("affected_problem", input.problem);
  if (input.district !== "all") query = query.eq("affected_district", input.district);
  if (input.confidence_min !== undefined) query = query.gte("confidence", input.confidence_min);
  if (input.confidence_max !== undefined) query = query.lte("confidence", input.confidence_max);
  if (input.rollback !== "all") query = query.eq("rollback_available", input.rollback === "available");
  if (input.from) query = query.gte("updated_at", input.from);
  if (input.to) query = query.lte("updated_at", input.to);
  if (input.query) query = query.or(`rule_type.ilike.%${escapeFilter(input.query)}%,affected_problem.ilike.%${escapeFilter(input.query)}%,affected_district.ilike.%${escapeFilter(input.query)}%`);
  const [rulesResult, dependenciesResult] = await Promise.all([
    dbQuery<SystemRow[]>(query),
    dbQuery<SystemRow[]>(db(ctx).from("learning_rule_dependencies").select("rule_id,status")),
  ]);
  if (rulesResult.error || dependenciesResult.error) apiFailure("DB_ERROR", "Không thể tải quy tắc học Kael", 500);
  const dependencyCounts = countDependencies(dependenciesResult.data ?? []);
  const all = (rulesResult.data ?? []).map((row) => serializeRule(row, dependencyCounts.get(requiredString(row, "id")) ?? 0));
  all.sort(compareRules);
  const cursor = decodeAdminSystemCursor(input.cursor);
  const after = cursor ? all.filter((record) => isAfterRuleCursor(record, cursor.primary, cursor.id)) : all;
  const page = after.slice(0, input.limit + 1);
  const hasMore = page.length > input.limit;
  const records = page.slice(0, input.limit);
  const last = records[records.length - 1];
  return {
    generated_at: new Date().toISOString(),
    data_quality: all.length === 0 ? "unavailable" : "available",
    summary: {
      active_count: all.filter((rule) => rule.status === "active").length,
      monitoring_count: all.filter((rule) => rule.status === "monitoring").length,
      rollback_count: all.filter((rule) => rule.rollback_available).length,
      inactive_count: all.filter((rule) => ["disabled", "rolled_back", "degraded"].includes(rule.status)).length,
    },
    records,
    has_more: hasMore,
    next_cursor: hasMore && last ? encodeAdminSystemCursor({ primary: ruleCursorPrimary(last), id: last.id }) : null,
    next_offset: null,
  };
}

export async function getSystemLearningRule(ctx: MobileApiContext, ruleId: string): Promise<AdminSystemLearningDetailResponse> {
  const [ruleResult, versionsResult, dependenciesResult, revocationsResult] = await Promise.all([
    dbQuery<SystemRow>(db(ctx).from("learning_rules").select(RULE_SELECT).eq("id", ruleId).maybeSingle()),
    dbQuery<SystemRow[]>(db(ctx).from("learning_rule_versions").select("id,version,rule_payload,change_reason,status,created_at").eq("rule_id", ruleId).order("version", { ascending: false })),
    dbQuery<SystemRow[]>(db(ctx).from("learning_rule_dependencies").select("dependency_id,candidate_id,rule_version,release_id,status,created_at,revoked_at").eq("rule_id", ruleId).order("created_at", { ascending: false })),
    dbQuery<SystemRow[]>(db(ctx).from("learning_rule_revocations").select("revocation_id,rule_version,revoked_by,reason,release_id,cascaded_dependency_count,revoked_at").eq("rule_id", ruleId).order("revoked_at", { ascending: false })),
  ]);
  if (ruleResult.error || versionsResult.error || dependenciesResult.error || revocationsResult.error) apiFailure("DB_ERROR", "Không thể tải chi tiết quy tắc học", 500);
  if (!ruleResult.data) apiFailure("NOT_FOUND", "Không tìm thấy quy tắc học", 404);
  const dependencies = (dependenciesResult.data ?? []).map((row) => ({ id: requiredString(row, "dependency_id"), type: "candidate", status: requiredString(row, "status") }));
  const summary = serializeRule(ruleResult.data, dependencies.length);
  const firstDependency = dependenciesResult.data?.[0];
  const record = {
    ...summary,
    provenance_id: firstDependency ? nullableString(firstDependency.candidate_id) : null,
    release_id: firstDependency ? nullableString(firstDependency.release_id) : null,
    scope_actor: null,
    scope_workflow: null,
    safe_payload: scrubRulePayload(ruleResult.data.rule_payload),
    dependencies,
  };
  const versionHistory = (versionsResult.data ?? []).map((row) => ({
    id: requiredString(row, "id"), version: requiredInteger(row, "version"), status: requiredString(row, "status"),
    change_reason: requiredString(row, "change_reason"), safe_payload: scrubRulePayload(row.rule_payload), recorded_at: requiredString(row, "created_at"),
  }));
  const governanceHistory = (revocationsResult.data ?? []).map((row) => ({
    id: requiredString(row, "revocation_id"), action: "revoke", version: requiredInteger(row, "rule_version"), actor_id: requiredString(row, "revoked_by"),
    reason: requiredString(row, "reason"), release_id: requiredString(row, "release_id"), cascaded_dependency_count: requiredInteger(row, "cascaded_dependency_count"), recorded_at: requiredString(row, "revoked_at"),
  }));
  return {
    generated_at: new Date().toISOString(), data_quality: "available", record, version: summary.active_version,
    history: [...versionHistory, ...governanceHistory],
    available_actions: [summary.rollback_available ? "rollback" : null, summary.status === "active" ? "revoke" : null].filter((value): value is string => Boolean(value)),
    permission: "manage",
  };
}

export async function previewSystemLearningAction(ctx: MobileApiContext, ruleId: string, action: "rollback" | "revoke", input: AdminSystemLearningActionInput): Promise<AdminSystemLearningPreviewResponse> {
  const detail = await getSystemLearningRule(ctx, ruleId);
  if (detail.version !== input.expected_version) apiFailure("CONFLICT", "Quy tắc đã thay đổi; hãy rà soát lại", 409);
  if (action === "rollback" && (!input.target_version || input.target_version >= detail.version)) apiFailure("VALIDATION", "Phiên bản hoàn tác không hợp lệ", 400);
  if (action === "rollback" && !detail.history.some((entry) => asRecord(entry)?.version === input.target_version)) apiFailure("VALIDATION", "Không tìm thấy phiên bản hoàn tác", 400);
  return {
    generated_at: new Date().toISOString(), action, rule_id: ruleId, current_version: detail.version,
    target_version: action === "rollback" ? input.target_version ?? null : null,
    dependency_count: detail.record.dependencies.filter((dependency) => dependency.status === "active").length,
    dependencies: detail.record.dependencies,
  };
}

export async function applySystemLearningAction(ctx: MobileApiContext, ruleId: string, action: "rollback" | "revoke", input: AdminSystemLearningActionInput): Promise<AdminSystemReceipt> {
  await previewSystemLearningAction(ctx, ruleId, action, input);
  const functionName = action === "rollback" ? "admin_rollback_learning_rule_atomic" : "admin_revoke_learning_rule_atomic";
  const result = await dbQuery<unknown>(db(ctx).rpc(functionName, {
    p_actor_id: ctx.user.id,
    p_rule_id: ruleId,
    p_target_version: input.target_version ?? null,
    p_expected_version: input.expected_version,
    p_client_request_id: input.client_request_id,
    p_reason: input.reason,
  }));
  if (result.error) apiFailure(result.error.code === "40001" ? "CONFLICT" : "DB_ERROR", result.error.code === "40001" ? "Quy tắc đã thay đổi; hãy rà soát lại" : `Không thể ${action === "rollback" ? "hoàn tác" : "thu hồi"} quy tắc`, result.error.code === "40001" ? 409 : 500);
  return serializeSystemReceipt(result.data);
}

function serializeRule(row: SystemRow, dependencyCount: number): AdminSystemLearningRuleSummary {
  const serviceType = nullableServiceType(row.affected_service);
  return {
    id: requiredString(row, "id"), rule_type: requiredString(row, "rule_type"), affected_service: serviceType,
    affected_problem: nullableString(row.affected_problem), affected_district: nullableString(row.affected_district),
    confidence: requiredNumber(row, "confidence"), evidence_count: requiredInteger(row, "evidence_count"), status: requiredString(row, "status"),
    active_version: requiredInteger(row, "active_version"), rollback_available: asBoolean(row.rollback_available), dependency_count: dependencyCount,
    updated_at: requiredString(row, "updated_at"),
  };
}

function countDependencies(rows: SystemRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) if (row.status === "active") {
    const ruleId = nullableString(row.rule_id);
    if (ruleId) counts.set(ruleId, (counts.get(ruleId) ?? 0) + 1);
  }
  return counts;
}

function ruleRank(rule: AdminSystemLearningRuleSummary) {
  if (rule.status === "active" && (rule.dependency_count > 0 || rule.rollback_available)) return 0;
  if (rule.status === "monitoring") return 1;
  if (["disabled", "rolled_back", "degraded"].includes(rule.status)) return 3;
  return 2;
}

function compareRules(left: AdminSystemLearningRuleSummary, right: AdminSystemLearningRuleSummary) {
  return ruleRank(left) - ruleRank(right) || right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id);
}

function ruleCursorPrimary(rule: AdminSystemLearningRuleSummary) {
  return `${ruleRank(rule)}|${rule.updated_at}`;
}

function isAfterRuleCursor(rule: AdminSystemLearningRuleSummary, primary: string, id: string) {
  const [rankRaw, updatedAt, extra] = primary.split("|");
  const rank = Number(rankRaw);
  if (extra !== undefined || !Number.isInteger(rank) || !updatedAt) apiFailure("VALIDATION", "Con trỏ quy tắc học không hợp lệ", 400);
  const candidateRank = ruleRank(rule);
  return candidateRank > rank || (candidateRank === rank && (rule.updated_at < updatedAt || (rule.updated_at === updatedAt && rule.id < id)));
}

function scrubRulePayload(value: unknown): Record<string, unknown> {
  const row = asRecord(value);
  if (!row) return {};
  const forbidden = /(prompt|response|message|phone|email|address|bank|token|secret|document|cccd)/i;
  return Object.fromEntries(Object.entries(row).flatMap(([key, item]) => forbidden.test(key) ? [] : [[key, sanitizeValue(item)]]));
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitizeValue);
  const row = asRecord(value);
  return row ? scrubRulePayload(row) : typeof value === "string" && value.length > 500 ? `${value.slice(0, 500)}…` : value;
}

function escapeFilter(value: string) {
  return value.replace(/[,%()]/g, " ").trim();
}
