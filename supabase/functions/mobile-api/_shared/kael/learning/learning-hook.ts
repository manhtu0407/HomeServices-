// Deterministic Kael learning loop for the production Edge runtime.
//
// Ports the apps/api reference (`apps/api/src/lib/learning/*`) onto the Edge
// boundary so post-A14 reviews feed `record_learning_observation_atomic`
// directly. The RPC reads jobs/reviews server-side, so evidence counts and
// confidence can never come from model output (STRUCTURES.md §10C).
// Gate-passed candidates are queued for explicit administrator review. Runtime
// learning never activates canonical rules directly; provenance and revocation
// stay behind the service-role database boundary (RULES.md #7).

import {
  COMPLEXITY_LEVELS,
  normalizeServiceAreaDistrict,
  REVIEW_TAGS,
  SERVICE_TYPES,
  type ComplexityLevel,
  type ServiceType,
} from "../../../../_shared/domain.ts";
import { withDbTimeout } from "../pipeline/utils.ts";
import { resolveLearningRuntimeConfig } from "./skills/registry.ts";
import { assertHarnessCapabilityEnabled } from "../../../../_shared/harness/promotion.ts";

export {
  CONTRADICTION_MAX_RATIO,
  CONTRADICTION_MIN_SAMPLE,
  CONTRADICTION_WINDOW_DAYS,
  EDGE_CONFIDENCE_THRESHOLD,
  EDGE_MIN_EVIDENCE,
  ROLLING_WINDOW_DAYS,
} from "./learning-constants.ts";
import {
  CONTRADICTION_MAX_RATIO,
  CONTRADICTION_MIN_SAMPLE,
  CONTRADICTION_WINDOW_DAYS,
  EDGE_CONFIDENCE_THRESHOLD,
  EDGE_MIN_EVIDENCE,
} from "./learning-constants.ts";

type DbError = { code?: string; message?: string };
type DbResult<T = unknown> = { data: T | null; error: DbError | null; count?: number | null };
type QueryLike<T = unknown> = PromiseLike<DbResult<T>>;

type QueryBuilder<T = unknown> = {
  select(columns?: string, options?: Record<string, unknown>): QueryBuilder<T>;
  update(value: unknown): QueryBuilder<T>;
  insert(value: unknown): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  neq(column: string, value: unknown): QueryBuilder<T>;
  gte(column: string, value: unknown): QueryBuilder<T>;
  order(column: string, options?: Record<string, unknown>): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  maybeSingle(): QueryBuilder<T>;
  then: QueryLike<T>["then"];
};

export type LearningHookDbClient = {
  from(table: string): QueryBuilder;
  rpc(name: string, args?: Record<string, unknown>): QueryLike;
};

export type EdgeLearningHookInput = {
  jobId: string;
  serviceType: ServiceType;
  problemSlug: string;
  districtCode: string;
  complexityHint: ComplexityLevel;
  baselineMin: number;
  baselineMax: number;
  // Admin-owned band from price_baselines, absent on jobs quoted before it was stored.
  referenceMin: number | null;
  referenceMax: number | null;
  finalPrice: number | null;
  rating: number;
  reviewTags: string[];
  scopeChangeRequested: boolean;
  reviewedAt: string;
};

export type EdgeLearningCandidateRow = {
  id: string;
  candidate_type: string;
  affected_service: string | null;
  affected_problem: string | null;
  affected_district: string | null;
  suggested_payload: unknown;
  confidence: number;
  evidence_count: number;
  status: string;
};

export type EdgeLearningGateDecision =
  | { promote: true; reason: "gate_passed" }
  | {
    promote: false;
    reason:
      | "insufficient_evidence"
      | "low_confidence"
      | "contradicted_by_recent"
      | "forbidden_autonomy"
      | "invalid_payload";
  };

export type EdgeLearningHookSummary = {
  ok: boolean;
  marketCandidateId?: string;
  marketEvidence?: number;
  marketQueuedForReview?: boolean;
  caseCandidateId?: string;
  caseEvidence?: number;
  caseQueuedForReview?: boolean;
  skippedReason?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isServiceType(value: unknown): value is ServiceType {
  return typeof value === "string" &&
    (SERVICE_TYPES as readonly string[]).includes(value);
}

function isComplexityLevel(value: unknown): value is ComplexityLevel {
  return typeof value === "string" &&
    (COMPLEXITY_LEVELS as readonly string[]).includes(value);
}

function isLearningScope(value: unknown, includeComplexity: boolean): boolean {
  if (!isRecord(value)) return false;
  return isServiceType(value.service_type) &&
    isNonEmptyString(value.problem_slug) &&
    isNonEmptyString(value.district_code) &&
    (!includeComplexity || isComplexityLevel(value.complexity));
}

export function isPricePriorPayload(value: unknown): value is {
  candidate_type: "price_prior_update";
  scope: { service_type: ServiceType; problem_slug: string; district_code: string };
  suggested: {
    new_min: number;
    new_max: number;
    direction: "underestimate" | "overestimate" | "noisy";
  };
} {
  if (!isRecord(value) || !isLearningScope(value.scope, true)) return false;
  const observed = value.observed;
  const suggested = value.suggested;
  const window = value.window;
  if (!isRecord(observed) || !isRecord(suggested) || !isRecord(window)) return false;
  return value.candidate_type === "price_prior_update" &&
    Number.isInteger(observed.sample_size) &&
    (observed.sample_size as number) > 0 &&
    isFiniteNumber(suggested.new_min) &&
    isFiniteNumber(suggested.new_max) &&
    ["underestimate", "overestimate", "noisy"].includes(String(suggested.direction)) &&
    isNonEmptyString(window.from_ts) &&
    isNonEmptyString(window.to_ts);
}

export function isAnalysisRulePayload(value: unknown): value is {
  candidate_type: "analysis_rule";
  scope: { service_type: ServiceType; problem_slug: string; district_code: string };
  suggested: { kind: string };
} {
  if (!isRecord(value) || !isLearningScope(value.scope, false)) return false;
  const observed = value.observed;
  const suggested = value.suggested;
  if (!isRecord(observed) || !isRecord(suggested)) return false;
  const kind = suggested.kind;
  const validSuggestion = kind === "raise_complexity_prior"
    ? isComplexityLevel(suggested.from) &&
      isComplexityLevel(suggested.to) &&
      suggested.from !== "large" &&
      suggested.to !== "small" &&
      isNonEmptyString(suggested.rationale)
    : kind === "add_advisory"
    ? isNonEmptyString(suggested.advisory_template_id) && isNonEmptyString(suggested.rationale)
    : kind === "add_clarification"
    ? isNonEmptyString(suggested.question_template_id) && isNonEmptyString(suggested.rationale)
    : false;
  return value.candidate_type === "analysis_rule" &&
    Number.isInteger(observed.sample_size) &&
    (observed.sample_size as number) > 0 &&
    isFiniteNumber(observed.scope_change_rate) &&
    observed.scope_change_rate >= 0 &&
    observed.scope_change_rate <= 1 &&
    validSuggestion;
}

function oppositeDirection(
  left: EdgeLearningCandidateRow,
  right: EdgeLearningCandidateRow,
): boolean {
  if (
    !isPricePriorPayload(left.suggested_payload) ||
    !isPricePriorPayload(right.suggested_payload)
  ) {
    return false;
  }
  const leftDirection = left.suggested_payload.suggested.direction;
  const rightDirection = right.suggested_payload.suggested.direction;
  return (leftDirection === "underestimate" && rightDirection === "overestimate") ||
    (leftDirection === "overestimate" && rightDirection === "underestimate");
}

// STRUCTURES.md §10F / RULES.md #7 defense-in-depth: refuse any payload whose
// shape could reach money or service-scope state.
export function touchesMoneyOrScope(payload: unknown): boolean {
  if (isPricePriorPayload(payload)) {
    if (payload.suggested.new_min <= 0 || payload.suggested.new_max <= 0) return true;
    if (payload.suggested.new_max < payload.suggested.new_min) return true;
    return false;
  }
  if (isAnalysisRulePayload(payload)) {
    const kind = payload.suggested.kind;
    return kind !== "raise_complexity_prior" && kind !== "add_advisory" &&
      kind !== "add_clarification";
  }
  return true;
}

export function shouldPromoteLearningCandidate(
  candidate: EdgeLearningCandidateRow,
  similarRecent: EdgeLearningCandidateRow[],
): EdgeLearningGateDecision {
  const payload = candidate.suggested_payload;
  if (!isPricePriorPayload(payload) && !isAnalysisRulePayload(payload)) {
    return { promote: false, reason: "invalid_payload" };
  }
  // Pin the payload to the durable row columns. A payload that names a
  // different candidate_type or scope than the row it rides on is a
  // cross-skill escalation attempt and never promotes.
  if (
    payload.candidate_type !== candidate.candidate_type ||
    payload.scope.service_type !== candidate.affected_service ||
    payload.scope.problem_slug !== candidate.affected_problem ||
    payload.scope.district_code !== candidate.affected_district
  ) {
    return { promote: false, reason: "invalid_payload" };
  }

  if (candidate.evidence_count < EDGE_MIN_EVIDENCE) {
    return { promote: false, reason: "insufficient_evidence" };
  }
  if (candidate.confidence < EDGE_CONFIDENCE_THRESHOLD) {
    return { promote: false, reason: "low_confidence" };
  }

  // Price priors are the whole denominator: an analysis rule carries no direction, so
  // it can neither agree nor disagree and must not pad the sample into looking large
  // enough to read. The floor only rules out the degenerate tiny samples — a 1-row
  // history reading as a 100% contradiction; the caller's recency window is what stops
  // a real disagreement from blocking the scope forever.
  const directional = similarRecent.filter((row) => isPricePriorPayload(row.suggested_payload));
  if (directional.length >= CONTRADICTION_MIN_SAMPLE) {
    const contradictions = directional
      .filter((row) => oppositeDirection(row, candidate)).length;
    if (contradictions / directional.length > CONTRADICTION_MAX_RATIO) {
      return { promote: false, reason: "contradicted_by_recent" };
    }
  }

  if (touchesMoneyOrScope(candidate.suggested_payload)) {
    return { promote: false, reason: "forbidden_autonomy" };
  }
  return { promote: true, reason: "gate_passed" };
}

async function loadLearningHookInput(
  client: LearningHookDbClient,
  jobId: string,
): Promise<EdgeLearningHookInput | null> {
  const jobResult = await withDbTimeout<DbResult<Record<string, unknown>>>(
    client
      .from("jobs")
      .select(
        "id, service_type, address_district, kael_complexity, kael_price_min, kael_price_max, kael_reference_price_min, kael_reference_price_max, kael_problem_identified, final_price, reviewed_at, status, service_problem_id",
      )
      .eq("id", jobId)
      .maybeSingle() as QueryLike<Record<string, unknown>>,
  );
  const job = jobResult.data;
  if (jobResult.error || !isRecord(job)) return null;
  if (job.status !== "reviewed" || typeof job.reviewed_at !== "string") return null;

  const reviewResult = await withDbTimeout<DbResult<Record<string, unknown>>>(
    client
      .from("reviews")
      .select("rating, tags")
      .eq("job_id", jobId)
      .maybeSingle() as QueryLike<Record<string, unknown>>,
  );
  const review = isRecord(reviewResult.data) ? reviewResult.data : null;

  let problemSlug = isNonEmptyString(job.kael_problem_identified)
    ? job.kael_problem_identified
    : null;
  if (isNonEmptyString(job.service_problem_id)) {
    const problemResult = await withDbTimeout<DbResult<Record<string, unknown>>>(
      client
        .from("service_problems")
        .select("slug")
        .eq("id", job.service_problem_id)
        .maybeSingle() as QueryLike<Record<string, unknown>>,
    );
    if (isRecord(problemResult.data) && isNonEmptyString(problemResult.data.slug)) {
      problemSlug = problemResult.data.slug;
    }
  }
  if (!problemSlug) return null;
  if (!isComplexityLevel(job.kael_complexity)) return null;
  if (!isServiceType(job.service_type)) return null;
  const baselineMin = isFiniteNumber(job.kael_price_min) ? job.kael_price_min : null;
  const baselineMax = isFiniteNumber(job.kael_price_max) ? job.kael_price_max : null;
  if (baselineMin === null || baselineMax === null) return null;
  const districtCode = normalizeServiceAreaDistrict(
    isNonEmptyString(job.address_district) ? job.address_district : "",
  );
  if (!districtCode) return null;

  const scopeChangeResult = await withDbTimeout<DbResult<unknown>>(
    client
      .from("scope_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId) as QueryLike<unknown>,
  );

  return {
    jobId,
    serviceType: job.service_type,
    problemSlug,
    districtCode,
    complexityHint: job.kael_complexity,
    baselineMin,
    baselineMax,
    referenceMin: isFiniteNumber(job.kael_reference_price_min)
      ? job.kael_reference_price_min
      : null,
    referenceMax: isFiniteNumber(job.kael_reference_price_max)
      ? job.kael_reference_price_max
      : null,
    finalPrice: isFiniteNumber(job.final_price) ? job.final_price : null,
    rating: isFiniteNumber(review?.rating) ? review.rating : 0,
    reviewTags: Array.isArray(review?.tags)
      ? review.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    scopeChangeRequested: (scopeChangeResult.count ?? 0) > 0,
    reviewedAt: job.reviewed_at,
  };
}

type ObservationResult =
  | { ok: true; candidateId: string; evidenceCount: number }
  | { ok: false; reason: string };

async function recordObservation(
  client: LearningHookDbClient,
  candidateType: "price_prior_update" | "analysis_rule",
  input: EdgeLearningHookInput,
): Promise<ObservationResult> {
  const result = await withDbTimeout<DbResult<Array<Record<string, unknown>>>>(
    client.rpc("record_learning_observation_atomic", {
      p_job_id: input.jobId,
      p_candidate_type: candidateType,
      p_affected_service: input.serviceType,
      p_affected_problem: input.problemSlug,
      p_affected_district: input.districtCode,
      p_complexity: input.complexityHint,
      p_baseline_min: input.baselineMin,
      p_baseline_max: input.baselineMax,
      p_final_price: input.finalPrice,
      p_rating: input.rating,
      p_review_tags: (REVIEW_TAGS as readonly string[])
        .filter((tag) => input.reviewTags.includes(tag)),
      p_scope_change_requested: input.scopeChangeRequested,
      p_reviewed_at: input.reviewedAt,
      p_reference_min: input.referenceMin,
      p_reference_max: input.referenceMax,
    }) as QueryLike<Array<Record<string, unknown>>>,
  );
  if (result.error) {
    return { ok: false, reason: `rpc_failed:${result.error.code ?? "unknown"}` };
  }
  const row = Array.isArray(result.data) ? result.data[0] : null;
  if (!isRecord(row)) return { ok: false, reason: "rpc_failed:no_row" };
  if (row.ok !== true) {
    const errorCode = isNonEmptyString(row.error_code) ? row.error_code : "unknown";
    return { ok: false, reason: `rpc_rejected:${errorCode.toLowerCase()}` };
  }
  if (!isNonEmptyString(row.candidate_id)) {
    return { ok: false, reason: "rpc_failed:missing_candidate" };
  }
  return {
    ok: true,
    candidateId: row.candidate_id,
    evidenceCount: isFiniteNumber(row.evidence_count) ? row.evidence_count : 0,
  };
}

function contradictionWindowStart(now: Date): string {
  return new Date(now.getTime() - CONTRADICTION_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString();
}

async function maybeQueueManualReview(
  client: LearningHookDbClient,
  candidateId: string,
  now: Date,
): Promise<boolean> {
  const candidateResult = await withDbTimeout<DbResult<Record<string, unknown>>>(
    client
      .from("learning_candidates")
      .select(
        "id, candidate_type, affected_service, affected_problem, affected_district, suggested_payload, confidence, evidence_count, status",
      )
      .eq("id", candidateId)
      .maybeSingle() as QueryLike<Record<string, unknown>>,
  );
  const rawCandidate = candidateResult.data;
  const candidate = isRecord(rawCandidate) && !Array.isArray(rawCandidate)
    ? rawCandidate
    : Array.isArray(rawCandidate) && isRecord(rawCandidate[0])
    ? rawCandidate[0]
    : null;
  if (candidateResult.error || !candidate || !isEdgeCandidateRow(candidate)) return false;
  if (["manual_review", "auto_promoted", "rejected", "archived", "rolled_back"].includes(candidate.status)) {
    return false;
  }
  if (!candidate.affected_service) return false;

  const similarResult = await withDbTimeout<DbResult<Array<Record<string, unknown>>>>(
    client
      .from("learning_candidates")
      .select(
        "id, candidate_type, affected_service, affected_problem, affected_district, suggested_payload, confidence, evidence_count, status",
      )
      .eq("candidate_type", candidate.candidate_type)
      .eq("affected_service", candidate.affected_service)
      .eq("affected_problem", candidate.affected_problem ?? "")
      .eq("affected_district", candidate.affected_district ?? "")
      .neq("id", candidate.id)
      .gte("updated_at", contradictionWindowStart(now))
      .order("updated_at", { ascending: false })
      .limit(50) as QueryLike<Array<Record<string, unknown>>>,
  );
  const similar = Array.isArray(similarResult.data)
    ? similarResult.data.filter(isEdgeCandidateRow)
    : [];

  const decision = shouldPromoteLearningCandidate(candidate, similar);
  if (!decision.promote) {
    const patch: Record<string, unknown> = {
      audit_reason: `gate evaluated: ${decision.reason}`,
    };
    const nextStatus = gateRejectionStatus(decision.reason);
    if (nextStatus) patch.status = nextStatus;
    await withDbTimeout<DbResult<unknown>>(
      client.from("learning_candidates").update(patch).eq("id", candidateId) as QueryLike<unknown>,
    );
    return false;
  }

  const provenance = await candidateProvenance(candidate);
  const queueResult = await withDbTimeout<DbResult<unknown>>(
    client.rpc("queue_learning_candidate_manual_review", {
      p_candidate_id: candidate.id,
      p_source_hash: provenance.sourceHash,
      p_consent_hash: provenance.consentHash,
      p_input_hash: provenance.inputHash,
      p_evidence_hash: provenance.evidenceHash,
      p_release_id: readRuntimeEnv("HARNESS_RELEASE_ID") ?? "unreleased",
      p_safe_metadata: {
        gate_reason: "gate_passed",
        automatic_promotion: false,
        source_kind: "reviewed_job_aggregate",
        consent_basis: "aggregate_only",
        pii_redacted: true,
        raw_text_persisted: false,
        summary_origin: "model_generated",
      },
    }) as QueryLike<unknown>,
  );
  const queueRow = Array.isArray(queueResult.data) ? queueResult.data[0] : queueResult.data;
  return !queueResult.error
    && isRecord(queueRow)
    && queueRow.ok === true
    && queueRow.candidate_id === candidate.id
    && queueRow.status === "manual_review";
}

async function candidateProvenance(candidate: EdgeLearningCandidateRow): Promise<{
  sourceHash: string;
  consentHash: string;
  inputHash: string;
  evidenceHash: string;
}> {
  const payload = JSON.stringify(candidate.suggested_payload);
  return {
    sourceHash: await stableHex(`candidate:${candidate.id}`),
    consentHash: await stableHex("aggregate_only_reviewed_job_evidence"),
    inputHash: await stableHex(payload),
    evidenceHash: await stableHex(`${candidate.evidence_count}:${candidate.confidence}:${payload}`),
  };
}

async function stableHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}


// A rejected candidate keeps `created` only while it is still gathering evidence.
// `invalid_payload` / `forbidden_autonomy` mean the payload itself is broken, so an
// admin has to look rather than the row waiting forever. `manual_review` sits outside
// the `learning_candidates_pending_scope_unique` predicate, which frees the scope: the
// next observation opens a fresh candidate that counts evidence from its own receipts.
function gateRejectionStatus(
  reason: Extract<EdgeLearningGateDecision, { promote: false }>["reason"],
): "pending_evidence" | "manual_review" | null {
  switch (reason) {
    case "insufficient_evidence":
      return null;
    case "low_confidence":
    case "contradicted_by_recent":
      return "pending_evidence";
    case "invalid_payload":
    case "forbidden_autonomy":
      return "manual_review";
  }
}

function isEdgeCandidateRow(value: unknown): value is EdgeLearningCandidateRow {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.candidate_type === "string" &&
    isFiniteNumber(value.confidence) &&
    isFiniteNumber(value.evidence_count) &&
    typeof value.status === "string";
}

// One learning cycle for a reviewed job. Callers wrap in `.catch()`; a failure
// here must never block the customer review response.
export async function runLearningHook(
  client: LearningHookDbClient,
  jobId: string,
  now: Date = new Date(),
): Promise<EdgeLearningHookSummary> {
  const summary: EdgeLearningHookSummary = { ok: false };

  const runtimeConfig = resolveLearningRuntimeConfig(readRuntimeEnv);
  const killSwitch = await assertHarnessCapabilityEnabled(client, {
    environment: readRuntimeEnv("NESTSCOUT_ENVIRONMENT") ?? "local",
    switches: ["learning_promotion"],
  });
  if (!runtimeConfig.write_enabled || runtimeConfig.kill_switch || !killSwitch.allowed) {
    summary.skippedReason = "learning_disabled";
    return summary;
  }

  const input = await loadLearningHookInput(client, jobId);
  if (!input) {
    summary.skippedReason = "insufficient_job_context";
    return summary;
  }

  // MarketMemoryService (STRUCTURES.md §10A). Scope-changed jobs are not
  // clean price-drift evidence; CaseReview records them instead.
  if (input.finalPrice !== null && input.finalPrice > 0 && !input.scopeChangeRequested) {
    const marketResult = await recordObservation(client, "price_prior_update", input);
    if (marketResult.ok) {
      summary.marketCandidateId = marketResult.candidateId;
      summary.marketEvidence = marketResult.evidenceCount;
      summary.marketQueuedForReview = await maybeQueueManualReview(client, marketResult.candidateId, now);
      summary.ok = true;
    }
  }

  // CaseReviewService (STRUCTURES.md §10B).
  const caseResult = await recordObservation(client, "analysis_rule", input);
  if (caseResult.ok) {
    summary.caseCandidateId = caseResult.candidateId;
    summary.caseEvidence = caseResult.evidenceCount;
    summary.caseQueuedForReview = await maybeQueueManualReview(client, caseResult.candidateId, now);
    summary.ok = true;
  }

  return summary;
}

function readRuntimeEnv(name: string): string | undefined {
  const deno = (globalThis as {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno;
  return deno?.env?.get?.(name);
}
