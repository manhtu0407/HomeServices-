import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type {
  AdminAiCostListResponse,
  AdminDisputeListResponse,
  AdminGovernanceListInput,
  AdminLearningRuleListResponse,
  AdminPriceBaselineListResponse,
} from "../contracts/admin-control.ts";
import {
  asBoolean,
  nullableNumber,
  nullableRecord,
  nullableServiceType,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { displayCodeFor } from "./control-formatters.ts";

type Row = Record<string, unknown>;

export async function listAdminDisputes(
  ctx: MobileApiContext,
  input: AdminGovernanceListInput,
): Promise<AdminDisputeListResponse> {
  requireOwnerAdmin(ctx);
  const result = await dbQuery<Row[]>(
    db(ctx)
      .from("disputes")
      .select("id,job_id,dispute_type,initiated_by,status,created_at,updated_at,admin_decision_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(input.offset, input.offset + input.limit),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải danh sách tranh chấp", 500);
  const page = result.data ?? [];
  const hasMore = page.length > input.limit;
  const disputes = page.slice(0, input.limit).flatMap((row) => {
    const id = nullableString(row.id);
    const jobId = nullableString(row.job_id);
    const disputeType = nullableString(row.dispute_type);
    const initiatedBy = nullableString(row.initiated_by);
    const status = nullableString(row.status);
    const createdAt = nullableString(row.created_at);
    const updatedAt = nullableString(row.updated_at);
    if (!id || !jobId || !disputeType || !initiatedBy || !status || !createdAt || !updatedAt) return [];
    return [{
      id,
      job_id: jobId,
      display_code: displayCodeFor(jobId),
      dispute_type: disputeType,
      initiated_by: initiatedBy,
      status,
      created_at: createdAt,
      updated_at: updatedAt,
      decided_at: nullableString(row.admin_decision_at),
    }];
  });
  return {
    disputes,
    has_more: hasMore,
    next_offset: hasMore ? input.offset + disputes.length : null,
    total_count: requiredExactCount(result.count, "tranh chấp"),
  };
}

export async function listAdminPriceBaselines(
  ctx: MobileApiContext,
  input: AdminGovernanceListInput,
): Promise<AdminPriceBaselineListResponse> {
  requireOwnerAdmin(ctx);
  const result = await dbQuery<Row[]>(
    db(ctx)
      .from("price_baselines")
      .select("id,service_type,complexity,district_code,price_min,price_max,source,version,updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(input.offset, input.offset + input.limit),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải nền tảng giá", 500);
  const page = result.data ?? [];
  const hasMore = page.length > input.limit;
  const priceBaselines = page.slice(0, input.limit).flatMap((row) => {
    const id = nullableString(row.id);
    const serviceType = nullableServiceType(row.service_type);
    const complexity = nullableString(row.complexity);
    const districtCode = nullableString(row.district_code);
    const priceMin = nullableNumber(row.price_min);
    const priceMax = nullableNumber(row.price_max);
    const source = nullableString(row.source);
    const version = nonNegativeInteger(row.version);
    const updatedAt = nullableString(row.updated_at);
    if (!id || !serviceType || !complexity || !districtCode || priceMin === null || priceMax === null || !source || version === null || !updatedAt) return [];
    return [{
      id,
      service_type: serviceType,
      complexity,
      district_code: districtCode,
      price_min: priceMin,
      price_max: priceMax,
      source,
      version,
      updated_at: updatedAt,
    }];
  });
  return {
    price_baselines: priceBaselines,
    has_more: hasMore,
    next_offset: hasMore ? input.offset + priceBaselines.length : null,
    total_count: requiredExactCount(result.count, "nền tảng giá"),
  };
}

export async function listAdminAiCosts(
  ctx: MobileApiContext,
  input: AdminGovernanceListInput,
): Promise<AdminAiCostListResponse> {
  requireOwnerAdmin(ctx);
  const result = await dbQuery<Row[]>(
    db(ctx)
      .from("kael_cost_daily_summary")
      .select("day,purpose,provider,call_count,success_count,failure_count,fallback_count,total_cost_usd,avg_latency_ms,p95_latency_ms,failure_rate", { count: "exact" })
      .order("day", { ascending: false })
      .order("purpose", { ascending: true })
      .range(input.offset, input.offset + input.limit),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải chi phí Kael", 500);
  const page = result.data ?? [];
  const hasMore = page.length > input.limit;
  const costs = page.slice(0, input.limit).flatMap((row) => {
    const day = nullableString(row.day);
    const purpose = nullableString(row.purpose);
    const provider = nullableString(row.provider);
    const callCount = nonNegativeInteger(row.call_count);
    const successCount = nonNegativeInteger(row.success_count);
    const failureCount = nonNegativeInteger(row.failure_count);
    const fallbackCount = nonNegativeInteger(row.fallback_count);
    const totalCost = nullableNumber(row.total_cost_usd);
    if (!day || !purpose || !provider || callCount === null || successCount === null || failureCount === null || fallbackCount === null || totalCost === null) return [];
    return [{
      day,
      purpose,
      provider,
      call_count: callCount,
      success_count: successCount,
      failure_count: failureCount,
      fallback_count: fallbackCount,
      total_cost_usd: totalCost,
      avg_latency_ms: nullableNumber(row.avg_latency_ms),
      p95_latency_ms: nullableNumber(row.p95_latency_ms),
      failure_rate: nullableNumber(row.failure_rate),
    }];
  });
  return {
    costs,
    has_more: hasMore,
    next_offset: hasMore ? input.offset + costs.length : null,
    total_count: requiredExactCount(result.count, "chi phí Kael"),
  };
}

export async function listAdminLearningRules(
  ctx: MobileApiContext,
  input: AdminGovernanceListInput,
): Promise<AdminLearningRuleListResponse> {
  requireOwnerAdmin(ctx);
  const result = await dbQuery<Row[]>(
    db(ctx)
      .from("learning_rules")
      .select("id,rule_type,affected_service,affected_problem,affected_district,confidence,evidence_count,status,active_version,rollback_available,updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(input.offset, input.offset + input.limit),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải quy tắc học Kael", 500);
  const page = result.data ?? [];
  const hasMore = page.length > input.limit;
  const rules = page.slice(0, input.limit).flatMap((row) => {
    const id = nullableString(row.id);
    const ruleType = nullableString(row.rule_type);
    const confidence = nullableNumber(row.confidence);
    const evidenceCount = nonNegativeInteger(row.evidence_count);
    const status = nullableString(row.status);
    const activeVersion = nonNegativeInteger(row.active_version);
    const updatedAt = nullableString(row.updated_at);
    if (!id || !ruleType || confidence === null || evidenceCount === null || !status || activeVersion === null || !updatedAt) return [];
    return [{
      id,
      rule_type: ruleType,
      affected_service: nullableServiceType(row.affected_service),
      affected_problem: nullableString(row.affected_problem),
      affected_district: nullableString(row.affected_district),
      confidence,
      evidence_count: evidenceCount,
      status,
      active_version: activeVersion,
      rollback_available: asBoolean(row.rollback_available),
      updated_at: updatedAt,
    }];
  });
  return {
    rules,
    has_more: hasMore,
    next_offset: hasMore ? input.offset + rules.length : null,
    total_count: requiredExactCount(result.count, "quy tắc học Kael"),
  };
}

function requireOwnerAdmin(ctx: MobileApiContext): void {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ quản trị viên chính có thể xem giám sát hệ thống", 403);
  }
}

function nonNegativeInteger(value: unknown): number | null {
  const number = nullableNumber(value);
  return number !== null && Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function requiredExactCount(value: unknown, subject: string): number {
  const count = nonNegativeInteger(value);
  if (count === null) apiFailure("DB_ERROR", `Không thể xác định tổng số ${subject}`, 500);
  return count;
}
