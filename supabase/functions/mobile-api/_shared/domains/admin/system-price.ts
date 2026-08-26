import { apiFailure } from "../../platform/api-failure.ts";
import { asBoolean, nullableNumber, nullableServiceType, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { baselinePriceEvidenceCitationUrls, validateBaselinePriceEvidence } from "../../kael/evidence/baseline-price-evidence.ts";
import { sourceTrustHighValueThresholdVnd, validateCitations } from "../../kael/evidence/source-trust.ts";
import type { AdminSystemContracts } from "../contracts/admin-system.ts";
import { escapeLikePattern } from "./control-formatters.ts";
import { decodeAdminSystemCursor, encodeAdminSystemCursor } from "./system-pagination.ts";
import { asRecord, asRows, requiredInteger, requiredNumber, requiredString, serializeSystemReceipt, type SystemRow } from "./system-shared.ts";

type AdminSystemEvidencePackage = AdminSystemContracts["evidencePackage"];
type AdminSystemMutationInput = AdminSystemContracts["mutationInput"];
type AdminSystemPriceDetailResponse = AdminSystemContracts["priceDetailResponse"];
type AdminSystemPriceEvidence = AdminSystemPriceDetailResponse["record"]["evidence"][number];
type AdminSystemPriceListInput = AdminSystemContracts["priceListInput"];
type AdminSystemPriceListResponse = AdminSystemContracts["priceListResponse"];
type AdminSystemPriceMutationInput = AdminSystemContracts["priceMutationInput"];
type AdminSystemPriceSummary = AdminSystemPriceListResponse["records"][number];
type AdminSystemPriceValidationResponse = AdminSystemContracts["priceValidationResponse"];
type AdminSystemReceipt = AdminSystemContracts["receipt"];

type TaxonomyLabels = {
  serviceVi: string;
  serviceEn: string | null;
  problemSlug: string;
  problemVi: string;
  problemEn: string | null;
};

const PRICE_SELECT = "id,service_type,service_problem_id,complexity,district_code,price_min,price_max,source,price_evidence,version,lifecycle,effective_from,retired_at,supersedes_id,created_by,updated_at";

export async function listSystemPriceBaselines(ctx: MobileApiContext, input: AdminSystemPriceListInput): Promise<AdminSystemPriceListResponse> {
  const client = db(ctx);
  let query = client.from("price_baselines").select(PRICE_SELECT)
    .order("lifecycle", { ascending: true })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  if (input.service_type !== "all") query = query.eq("service_type", input.service_type);
  if (input.problem_id) query = query.eq("service_problem_id", input.problem_id);
  if (input.complexity !== "all") query = query.eq("complexity", input.complexity);
  if (input.district !== "all") query = query.eq("district_code", input.district);
  if (input.status !== "all") query = query.eq("lifecycle", input.status);
  if (input.from) query = query.gte("updated_at", input.from);
  if (input.to) query = query.lte("updated_at", input.to);
  if (input.evidence_source !== "all") query = query.contains("price_evidence", { sources: [{ domain: input.evidence_source }] });
  if (input.query) {
    query = query.or(await buildPriceSearchFilter(ctx, input.query));
  }
  const cursor = decodeAdminSystemCursor(input.cursor);
  if (cursor) {
    const [lifecycle, updatedAt, extra] = cursor.primary.split("|");
    if (!lifecycle || !updatedAt || extra !== undefined || !Number.isFinite(Date.parse(updatedAt))) apiFailure("VALIDATION", "Con trỏ giá tham chiếu không hợp lệ", 400);
    query = query.or(`lifecycle.gt.${lifecycle},and(lifecycle.eq.${lifecycle},updated_at.lt.${updatedAt}),and(lifecycle.eq.${lifecycle},updated_at.eq.${updatedAt},id.lt.${cursor.id})`);
  }
  const result = await dbQuery<SystemRow[]>(query.limit(input.limit + 1));
  if (result.error) apiFailure("DB_ERROR", "Không thể tải dữ liệu giá tham chiếu", 500);
  const page = result.data ?? [];
  const hasMore = page.length > input.limit;
  const rows = page.slice(0, input.limit);
  const labels = await loadTaxonomyLabels(ctx, rows.map((row) => nullableString(row.service_problem_id)).filter((value): value is string => Boolean(value)));
  const records = await Promise.all(rows.map((row) => serializePriceSummary(ctx, row, labels)));
  const summary = await summarizePrices(ctx);
  const last = rows[rows.length - 1];
  return {
    generated_at: new Date().toISOString(),
    data_quality: summary.active_count + summary.inactive_count === 0 ? "unavailable" : summary.attention_count > 0 ? "partial" : "available",
    summary,
    records,
    has_more: hasMore,
    next_cursor: hasMore && last ? encodeAdminSystemCursor({ primary: `${requiredString(last, "lifecycle")}|${requiredString(last, "updated_at")}`, id: requiredString(last, "id") }) : null,
    next_offset: null,
  };
}

export async function getSystemPriceBaseline(ctx: MobileApiContext, baselineId: string): Promise<AdminSystemPriceDetailResponse> {
  const result = await dbQuery<SystemRow>(db(ctx).from("price_baselines").select(PRICE_SELECT).eq("id", baselineId).maybeSingle());
  if (result.error) apiFailure("DB_ERROR", "Không thể tải chi tiết giá tham chiếu", 500);
  if (!result.data) apiFailure("NOT_FOUND", "Không tìm thấy giá tham chiếu", 404);
  const labels = await loadTaxonomyLabels(ctx, [requiredString(result.data, "service_problem_id")]);
  const summary = await serializePriceSummary(ctx, result.data, labels);
  const evidenceValidation = await validateEvidence(ctx, result.data);
  const [historyResult, nextResult, referenceResult] = await Promise.all([
    dbQuery<SystemRow[]>(db(ctx).from("price_baselines").select("id,version,lifecycle,updated_at,created_by,source,supersedes_id").eq("service_problem_id", summary.problem_id).eq("complexity", summary.complexity).eq("district_code", summary.district_code).order("version", { ascending: false })),
    dbQuery<SystemRow>(db(ctx).from("price_baselines").select("id").eq("supersedes_id", baselineId).maybeSingle()),
    dbQuery<SystemRow[]>(db(ctx).from("jobs").select("id").contains("kael_estimate", { baseline_id: baselineId }).limit(1000)),
  ]);
  if (historyResult.error || nextResult.error || referenceResult.error) apiFailure("DB_ERROR", "Không thể tải lịch sử giá tham chiếu", 500);
  const record = {
    ...summary,
    source: requiredString(result.data, "source"),
    retired_at: nullableString(result.data.retired_at),
    supersedes_id: nullableString(result.data.supersedes_id),
    superseded_by_id: nextResult.data ? requiredString(nextResult.data, "id") : null,
    evidence: evidenceMetadata(result.data.price_evidence, evidenceValidation),
    quorum_required: evidenceValidation.success ? evidenceValidation.receipt.required_quorum : null,
    downstream_reference_count: (referenceResult.data ?? []).length,
  };
  return {
    generated_at: new Date().toISOString(),
    data_quality: evidenceValidation.success ? "available" : "partial",
    record,
    version: summary.version,
    history: (historyResult.data ?? []).map((row) => ({
      id: requiredString(row, "id"),
      version: requiredInteger(row, "version"),
      lifecycle: requiredString(row, "lifecycle"),
      source: requiredString(row, "source"),
      actor_id: nullableString(row.created_by),
      recorded_at: requiredString(row, "updated_at"),
    })),
    available_actions: summary.lifecycle === "active" ? ["publish_version", "retire"] : [],
    permission: "manage",
  };
}

export async function listSystemEvidencePackages(ctx: MobileApiContext, input: AdminSystemPriceListInput) {
  let query = db(ctx).from("admin_price_evidence_packages")
    .select("id,schema_version,service_type,service_problem_id,complexity,district_code,aggregate_min,aggregate_max,unit,evidence_document,verified_at")
    .order("verified_at", { ascending: false })
    .limit(input.limit);
  if (input.service_type !== "all") query = query.eq("service_type", input.service_type);
  if (input.problem_id) query = query.eq("service_problem_id", input.problem_id);
  const result = await dbQuery<SystemRow[]>(query);
  if (result.error) apiFailure("DB_ERROR", "Không thể tải gói bằng chứng giá", 500);
  return { generated_at: new Date().toISOString(), records: (result.data ?? []).map(serializeEvidencePackage) };
}

export async function validateSystemPriceBaseline(ctx: MobileApiContext, input: AdminSystemPriceMutationInput): Promise<AdminSystemPriceValidationResponse> {
  const packageResult = await dbQuery<SystemRow>(db(ctx).from("admin_price_evidence_packages").select("*").eq("id", input.evidence_package_id).maybeSingle());
  if (packageResult.error) apiFailure("DB_ERROR", "Không thể tải gói bằng chứng giá", 500);
  if (!packageResult.data) apiFailure("NOT_FOUND", "Không tìm thấy gói bằng chứng giá", 404);
  const validation = await validateEvidence(ctx, {
    price_min: packageResult.data.aggregate_min,
    price_max: packageResult.data.aggregate_max,
    price_evidence: packageResult.data.evidence_document,
  });
  let current: AdminSystemPriceSummary | null = null;
  if (input.baseline_id) {
    const detail = await getSystemPriceBaseline(ctx, input.baseline_id);
    current = detail.record;
    if (detail.version !== input.expected_version) apiFailure("CONFLICT", "Giá tham chiếu đã thay đổi; hãy rà soát lại", 409);
  }
  return {
    generated_at: new Date().toISOString(),
    valid: validation.success,
    current,
    proposed: serializeEvidencePackage(packageResult.data),
    evidence: evidenceMetadata(packageResult.data.evidence_document, validation),
    rejected_reasons: validation.success ? [] : [validation.error],
  };
}

export async function publishSystemPriceBaseline(ctx: MobileApiContext, input: AdminSystemPriceMutationInput): Promise<AdminSystemReceipt> {
  const preview = await validateSystemPriceBaseline(ctx, input);
  if (!preview.valid) apiFailure("VALIDATION", "Gói bằng chứng chưa đạt điều kiện xuất bản", 400);
  const result = await dbQuery<unknown>(db(ctx).rpc("admin_publish_price_baseline_version", {
    p_actor_id: ctx.user.id,
    p_baseline_id: input.baseline_id ?? null,
    p_evidence_package_id: input.evidence_package_id,
    p_effective_from: input.effective_from ?? null,
    p_expected_version: input.expected_version,
    p_client_request_id: input.client_request_id,
    p_reason: input.reason,
  }));
  if (result.error) apiFailure(result.error.code === "40001" ? "CONFLICT" : "DB_ERROR", result.error.code === "40001" ? "Giá tham chiếu đã thay đổi; hãy rà soát lại" : "Không thể xuất bản phiên bản giá", result.error.code === "40001" ? 409 : 500);
  return serializeSystemReceipt(result.data);
}

export async function retireSystemPriceBaseline(ctx: MobileApiContext, baselineId: string, input: AdminSystemMutationInput): Promise<AdminSystemReceipt> {
  const result = await dbQuery<unknown>(db(ctx).rpc("admin_retire_price_baseline", {
    p_actor_id: ctx.user.id,
    p_baseline_id: baselineId,
    p_expected_version: input.expected_version,
    p_client_request_id: input.client_request_id,
    p_reason: input.reason,
  }));
  if (result.error) apiFailure(result.error.code === "40001" ? "CONFLICT" : "DB_ERROR", result.error.code === "40001" ? "Giá tham chiếu đã thay đổi; hãy rà soát lại" : "Không thể ngừng giá tham chiếu", result.error.code === "40001" ? 409 : 500);
  return serializeSystemReceipt(result.data);
}

async function serializePriceSummary(ctx: MobileApiContext, row: SystemRow, labels: Map<string, TaxonomyLabels>): Promise<AdminSystemPriceSummary> {
  const serviceType = nullableServiceType(row.service_type);
  const problemId = requiredString(row, "service_problem_id");
  const taxonomy = labels.get(problemId);
  const validation = await validateEvidence(ctx, row);
  if (!serviceType || !taxonomy) apiFailure("DB_ERROR", "Giá tham chiếu thiếu taxonomy", 500);
  const lifecycle = requiredString(row, "lifecycle");
  if (!(["active", "superseded", "retired"] as const).includes(lifecycle as never)) apiFailure("DB_ERROR", "Vòng đời giá tham chiếu không hợp lệ", 500);
  const complexity = requiredString(row, "complexity");
  if (!(["small", "medium", "large"] as const).includes(complexity as never)) apiFailure("DB_ERROR", "Độ phức tạp giá không hợp lệ", 500);
  return {
    id: requiredString(row, "id"), service_type: serviceType,
    service_label_vi: taxonomy.serviceVi, service_label_en: taxonomy.serviceEn,
    problem_id: problemId, problem_slug: taxonomy.problemSlug, problem_label_vi: taxonomy.problemVi, problem_label_en: taxonomy.problemEn,
    complexity: complexity as AdminSystemPriceSummary["complexity"], district_code: requiredString(row, "district_code"),
    price_min: requiredNumber(row, "price_min"), price_max: requiredNumber(row, "price_max"),
    unit: validation.success ? validation.receipt.unit : evidenceUnit(row.price_evidence),
    lifecycle: lifecycle as AdminSystemPriceSummary["lifecycle"], version: requiredInteger(row, "version"),
    accepted_evidence_count: validation.success ? validation.receipt.accepted_source_count : 0,
    evidence_quorum_met: validation.success ? true : null,
    effective_from: nullableString(row.effective_from), updated_at: requiredString(row, "updated_at"),
  };
}

async function summarizePrices(ctx: MobileApiContext) {
  const result = await dbQuery<SystemRow[]>(db(ctx).from("price_baselines").select("id,lifecycle,price_min,price_max,price_evidence"));
  if (result.error) apiFailure("DB_ERROR", "Không thể tổng hợp dữ liệu giá", 500);
  const rows = result.data ?? [];
  const validations = await Promise.all(rows.map((row) => validateEvidence(ctx, row)));
  return {
    active_count: rows.filter((row) => row.lifecycle === "active").length,
    quorum_count: validations.filter((value) => value.success).length,
    inactive_count: rows.filter((row) => row.lifecycle === "superseded" || row.lifecycle === "retired").length,
    attention_count: validations.filter((value) => !value.success).length,
  };
}

async function validateEvidence(ctx: MobileApiContext, row: SystemRow) {
  const priceMin = nullableNumber(row.price_min);
  const priceMax = nullableNumber(row.price_max);
  const threshold = sourceTrustHighValueThresholdVnd();
  if (priceMin === null || priceMax === null || threshold === null) return { success: false, error: "evidence validation config unavailable" } as const;
  const citations = baselinePriceEvidenceCitationUrls(row.price_evidence);
  const registry = await validateCitations(citations, ctx.supabase, 2, { marketAmountVnd: priceMax, highValueThresholdVnd: threshold, maxAutoTier: 2, quorumAutoTierMax: 2 });
  return validateBaselinePriceEvidence({ baselinePriceMin: priceMin, baselinePriceMax: priceMax, document: row.price_evidence, highValueThresholdVnd: threshold, registryCitations: registry.accepted });
}

async function loadTaxonomyLabels(ctx: MobileApiContext, problemIds: string[]) {
  const unique = [...new Set(problemIds)];
  if (unique.length === 0) return new Map<string, TaxonomyLabels>();
  const problems = await dbQuery<SystemRow[]>(db(ctx).from("service_problems").select("id,slug,label_vi,label_en,service_category_id").in("id", unique));
  if (problems.error) apiFailure("DB_ERROR", "Không thể tải nhãn vấn đề giá", 500);
  const categoryIds = (problems.data ?? []).map((row) => nullableString(row.service_category_id)).filter((value): value is string => Boolean(value));
  const categories = await dbQuery<SystemRow[]>(db(ctx).from("service_categories").select("id,label_vi,label_en").in("id", categoryIds));
  if (categories.error) apiFailure("DB_ERROR", "Không thể tải nhãn dịch vụ giá", 500);
  const categoryMap = new Map((categories.data ?? []).map((row) => [requiredString(row, "id"), row]));
  return new Map((problems.data ?? []).map((row) => {
    const category = categoryMap.get(requiredString(row, "service_category_id"));
    if (!category) apiFailure("DB_ERROR", "Giá tham chiếu thiếu dịch vụ", 500);
    return [requiredString(row, "id"), {
      serviceVi: requiredString(category, "label_vi"), serviceEn: nullableString(category.label_en),
      problemSlug: requiredString(row, "slug"), problemVi: requiredString(row, "label_vi"), problemEn: nullableString(row.label_en),
    }];
  }));
}

function serializeEvidencePackage(row: SystemRow): AdminSystemEvidencePackage {
  const serviceType = nullableServiceType(row.service_type);
  const complexity = requiredString(row, "complexity");
  if (!serviceType || !(["small", "medium", "large"] as const).includes(complexity as never)) apiFailure("DB_ERROR", "Gói bằng chứng giá không hợp lệ", 500);
  return {
    id: requiredString(row, "id"), schema_version: "baseline_price_evidence.v1",
    service_type: serviceType, problem_id: requiredString(row, "service_problem_id"), complexity: complexity as AdminSystemEvidencePackage["complexity"],
    district_code: requiredString(row, "district_code"), aggregate_min: requiredNumber(row, "aggregate_min"), aggregate_max: requiredNumber(row, "aggregate_max"),
    unit: requiredString(row, "unit"), accepted_source_count: baselinePriceEvidenceCitationUrls(row.evidence_document).length, verified_at: requiredString(row, "verified_at"),
  };
}

async function buildPriceSearchFilter(ctx: MobileApiContext, value: string) {
  const term = escapeLikePattern(value);
  const [problemResult, categoryResult] = await Promise.all([
    dbQuery<SystemRow[]>(db(ctx).from("service_problems").select("id").or(`slug.ilike.%${term}%,label_vi.ilike.%${term}%,label_en.ilike.%${term}%`).limit(100)),
    dbQuery<SystemRow[]>(db(ctx).from("service_categories").select("service_type").or(`slug.ilike.%${term}%,label_vi.ilike.%${term}%,label_en.ilike.%${term}%`).limit(20)),
  ]);
  if (problemResult.error || categoryResult.error) apiFailure("DB_ERROR", "Không thể tìm kiếm taxonomy giá", 500);
  const problemIds = (problemResult.data ?? []).map((row) => requiredString(row, "id"));
  const serviceTypes = (categoryResult.data ?? []).map((row) => requiredString(row, "service_type"));
  const filters = [`service_type.ilike.%${term}%`, `district_code.ilike.%${term}%`, `source.ilike.%${term}%`];
  if (/^[0-9a-f-]{36}$/i.test(term)) filters.push(`id.eq.${term}`);
  if (problemIds.length > 0) filters.push(`service_problem_id.in.(${problemIds.join(",")})`);
  if (serviceTypes.length > 0) filters.push(`service_type.in.(${serviceTypes.join(",")})`);
  return filters.join(",");
}

function evidenceMetadata(value: unknown, validation: Awaited<ReturnType<typeof validateEvidence>>): AdminSystemPriceEvidence[] {
  const document = asRecord(value);
  const sources = asRows(document?.sources);
  const accepted = validation.success ? new Map(validation.receipt.sources.map((source) => [source.domain, source])) : new Map();
  return sources.map((row) => {
    const verification = asRecord(row.verification);
    const domain = requiredString(row, "domain");
    const receipt = accepted.get(domain);
    return {
      domain, url: requiredString(row, "url"), observed_at: nullableString(row.observed_at), published_at: nullableString(verification?.source_published_at), verified_at: nullableString(verification?.verified_at),
      price_min: requiredNumber(row, "price_min"), price_max: requiredNumber(row, "price_max"), unit: requiredString(row, "unit"),
      normalized: asRecord(row.normalization) !== null, effective_tier: receipt?.effective_tier ?? null, accepted: Boolean(receipt), exclusion_reason: receipt ? null : validation.success ? "outlier" : validation.error,
    };
  });
}

function evidenceUnit(value: unknown) {
  const source = asRows(asRecord(value)?.sources)[0];
  return source ? requiredString(source, "unit") : "unavailable";
}
