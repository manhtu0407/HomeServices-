import type { ComplexityLevel, EdgeAiSecrets, ServiceType, SupabaseLike } from "../types.ts";
import { readBooleanEnvFlag, withDbTimeout } from "../_runtime/utils.ts";

type AppliedComplexityRule = {
  newComplexity: ComplexityLevel;
  ruleId: string;
  ruleVersion: number;
  fromComplexity: ComplexityLevel;
};

type AppliedPriceRule = {
  priceMin: number;
  priceMax: number;
  ruleId: string;
  ruleVersion: number;
};

type LearningRuleApplicationInput = {
  ruleId: string;
  ruleVersion: number;
  skillId: "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6" | "LS7";
  jobId?: string | null;
  actorId?: string | null;
  actorRole?: "customer" | "worker" | "admin" | "system" | null;
  appliedTarget:
    | "analysis_prompt"
    | "price_prior"
    | "clarification_pattern"
    | "advisory_pattern"
    | "detection_pattern"
    | "intent_category";
  safeMetadata?: Record<string, unknown>;
};

type LearningReviewOutcomeInput = {
  jobId: string;
  finalPrice: number | null;
  rating: number;
};

type LearningLogDbClient = {
  from(table: string): {
    select(columns?: string): LearningLogQuery;
    insert(value: unknown): LearningLogQuery;
  };
};

type LearningLogQuery = PromiseLike<{
  data: unknown;
  error: { code?: string; message?: string } | null;
}> & {
  eq(column: string, value: unknown): LearningLogQuery;
  limit(count: number): LearningLogQuery;
};

type LearningReviewOutcomeSummary = {
  source_applications: number;
  inserted_samples: number;
  error_code?: string;
};

export async function applyLearnedComplexityRule(
  supabase: SupabaseLike,
  secrets: EdgeAiSecrets,
  serviceType: ServiceType,
  problemSlug: string,
  district: string,
  currentComplexity: ComplexityLevel,
): Promise<AppliedComplexityRule | null> {
  if (!secrets.learningEnabled) return null;

  const { data: rows, error } = await withDbTimeout<{
    data: Array<Record<string, unknown>> | null;
    error: { code?: string; message?: string } | null;
  }>(
    supabase
      .from("learning_rules")
      .select("id, active_version, rule_payload, affected_district")
      .eq("rule_type", "analysis_rule")
      .eq("affected_service", serviceType)
      .eq("affected_problem", problemSlug)
      .in("affected_district", districtCandidates(district))
      .eq("status", "active") as PromiseLike<{
        data: Array<Record<string, unknown>> | null;
        error: { code?: string; message?: string } | null;
      }>,
  );
  if (error) {
    console.warn("applyLearnedComplexityRule: query failed", {
      errorCode: error.code,
    });
    return null;
  }

  const chosen = chooseLearningRule(rows, district);
  if (!chosen || !isAnalysisRulePayload(chosen.rule_payload)) return null;

  const suggested = chosen.rule_payload.suggested;
  if (!isRecord(suggested) || suggested.kind !== "raise_complexity_prior") {
    return null;
  }

  const from = asComplexityLevel(suggested.from);
  const to = asComplexityLevel(suggested.to);
  if (!from || !to) return null;

  const rank: Record<ComplexityLevel, number> = {
    small: 0,
    medium: 1,
    large: 2,
  };
  if (rank[currentComplexity] > rank[from] || rank[to] < rank[currentComplexity]) {
    return null;
  }

  const ruleId = typeof chosen.id === "string" ? chosen.id : null;
  const ruleVersion = integerFrom(chosen.active_version);
  if (!ruleId || ruleVersion === null) return null;
  return {
    newComplexity: to,
    ruleId,
    ruleVersion,
    fromComplexity: currentComplexity,
  };
}

export async function applyLearnedPriceRule(
  supabase: SupabaseLike,
  secrets: EdgeAiSecrets,
  serviceType: ServiceType,
  problemSlug: string,
  district: string,
): Promise<AppliedPriceRule | null> {
  if (!secrets.learningEnabled) return null;

  const { data: rows, error } = await withDbTimeout<{
    data: Array<Record<string, unknown>> | null;
    error: { code?: string; message?: string } | null;
  }>(
    supabase
      .from("learning_rules")
      .select("id, active_version, rule_payload, affected_district")
      .eq("rule_type", "price_prior_update")
      .eq("affected_service", serviceType)
      .eq("affected_problem", problemSlug)
      .in("affected_district", districtCandidates(district))
      .eq("status", "active") as PromiseLike<{
        data: Array<Record<string, unknown>> | null;
        error: { code?: string; message?: string } | null;
      }>,
  );
  if (error) {
    console.warn("applyLearnedPriceRule: query failed", {
      errorCode: error.code,
    });
    return null;
  }

  const chosen = chooseLearningRule(rows, district);
  if (!chosen || !isPricePriorPayload(chosen.rule_payload)) return null;

  const suggested = chosen.rule_payload.suggested;
  if (!isRecord(suggested)) return null;
  const priceMin = integerFrom(suggested.new_min);
  const priceMax = integerFrom(suggested.new_max);
  const ruleId = typeof chosen.id === "string" ? chosen.id : null;
  const ruleVersion = integerFrom(chosen.active_version);
  if (
    !ruleId ||
    ruleVersion === null ||
    priceMin === null ||
    priceMax === null ||
    priceMin <= 0 ||
    priceMax < priceMin
  ) {
    return null;
  }

  return {
    priceMin,
    priceMax,
    ruleId,
    ruleVersion,
  };
}

// Apply a defense-in-depth clamp at price-application time. Promotion
// is already evidence-gated and IQR-grounded (real reviewed jobs, outliers
// rejected), so a learned range that is e.g. ~2x the admin baseline is a
// LEGITIMATE market correction and must be allowed through. This clamp only
// catches the pathological case of a rule promoted on
// broken data that pushes the price "off by many times" (a decimal / unit
// error, orders of magnitude). If either endpoint falls outside
// [baseline / FACTOR, baseline * FACTOR] the rule is ignored for this estimate
// and an alert is logged — no user-facing block; synthesis falls back to the
// baseline range.
export const LEARNED_PRICE_MAX_DEVIATION_FACTOR = 4;

export function clampLearnedPriceToBaseline(
  learned: AppliedPriceRule | null,
  baseline: { priceMin: number; priceMax: number },
): AppliedPriceRule | null {
  if (!learned) return null;
  // Cannot reason about deviation without a positive baseline; keep the rule
  // (it already passed applyLearnedPriceRule's own positivity checks).
  if (!(baseline.priceMin > 0) || !(baseline.priceMax > 0)) return learned;

  const factor = LEARNED_PRICE_MAX_DEVIATION_FACTOR;
  const minOutOfBand =
    learned.priceMin < baseline.priceMin / factor ||
    learned.priceMin > baseline.priceMin * factor;
  const maxOutOfBand =
    learned.priceMax < baseline.priceMax / factor ||
    learned.priceMax > baseline.priceMax * factor;
  if (minOutOfBand || maxOutOfBand) {
    console.warn("clampLearnedPriceToBaseline: learned range outside baseline band, ignoring rule", {
      ruleId: learned.ruleId,
      ruleVersion: learned.ruleVersion,
      learnedMin: learned.priceMin,
      learnedMax: learned.priceMax,
      baselineMin: baseline.priceMin,
      baselineMax: baseline.priceMax,
      maxDeviationFactor: factor,
    });
    return null;
  }
  return learned;
}

export async function recordLearningRuleApplication(
  supabase: SupabaseLike,
  input: LearningRuleApplicationInput,
): Promise<{ inserted: boolean; error_code?: string }> {
  if (!input.ruleId) return { inserted: false, error_code: "MISSING_RULE_ID" };
  const client = supabase as unknown as LearningLogDbClient;
  try {
    const result = await withDbTimeout<{
      data: unknown;
      error: { code?: string; message?: string } | null;
    }>(
      client.from("kael_rule_application_log").insert({
        rule_id: input.ruleId,
        skill_id: input.skillId,
        job_id: input.jobId ?? null,
        actor_id: input.actorId ?? null,
        actor_role: input.actorRole ?? "system",
        applied_target: input.appliedTarget,
        applied_count: 1,
        override_count: 0,
        safe_metadata: {
          rule_version: input.ruleVersion,
          ...(input.safeMetadata ?? {}),
        },
      }),
    );
    if (result.error) {
      console.warn("recordLearningRuleApplication: insert failed", {
        errorCode: result.error.code,
      });
      return { inserted: false, error_code: result.error.code ?? "DB_ERROR" };
    }
    return { inserted: true };
  } catch {
    console.warn("recordLearningRuleApplication: insert threw", {
      ruleId: input.ruleId,
    });
    return { inserted: false, error_code: "DB_THROW" };
  }
}

export async function recordLearningReviewOutcome(
  supabase: SupabaseLike,
  input: LearningReviewOutcomeInput,
): Promise<LearningReviewOutcomeSummary> {
  if (!learningReviewOutcomeEnabled()) {
    return { source_applications: 0, inserted_samples: 0 };
  }
  const client = supabase as unknown as LearningLogDbClient;
  try {
    const sourceResult = await withDbTimeout<{
      data: unknown;
      error: { code?: string; message?: string } | null;
    }>(
      client
        .from("kael_rule_application_log")
        .select("id,rule_id,skill_id,applied_target,safe_metadata")
        .eq("job_id", input.jobId)
        .eq("applied_count", 1)
        .limit(20),
    );
    if (sourceResult.error) {
      return {
        source_applications: 0,
        inserted_samples: 0,
        error_code: sourceResult.error.code ?? "DB_ERROR",
      };
    }
    const rows = Array.isArray(sourceResult.data)
      ? sourceResult.data.filter(isRecord)
      : [];
    const samples = rows
      .map((row) => reviewOutcomeSample(row, input))
      .filter((sample): sample is Record<string, unknown> => sample !== null);
    if (samples.length === 0) {
      return { source_applications: rows.length, inserted_samples: 0 };
    }
    const insertResult = await withDbTimeout<{
      data: unknown;
      error: { code?: string; message?: string } | null;
    }>(
      client.from("kael_rule_application_log").insert(samples),
    );
    if (insertResult.error) {
      return {
        source_applications: rows.length,
        inserted_samples: 0,
        error_code: insertResult.error.code ?? "DB_ERROR",
      };
    }
    return { source_applications: rows.length, inserted_samples: samples.length };
  } catch {
    return { source_applications: 0, inserted_samples: 0, error_code: "DB_THROW" };
  }
}

function districtCandidates(district: string): string[] {
  return district === "hcmc_all" ? ["hcmc_all"] : [district, "hcmc_all"];
}

function chooseLearningRule(
  rows: Array<Record<string, unknown>> | null,
  district: string,
): Record<string, unknown> | null {
  if (!rows || rows.length === 0) return null;
  const exact = rows.find((row) => row.affected_district === district);
  const citywide = rows.find((row) => row.affected_district === "hcmc_all");
  return exact ?? citywide ?? null;
}

function isPricePriorPayload(value: unknown): value is {
  candidate_type: "price_prior_update";
  suggested: Record<string, unknown>;
} {
  return isRecord(value) &&
    value.candidate_type === "price_prior_update" &&
    isRecord(value.suggested);
}

function isAnalysisRulePayload(value: unknown): value is {
  candidate_type: "analysis_rule";
  suggested: Record<string, unknown>;
} {
  return isRecord(value) &&
    value.candidate_type === "analysis_rule" &&
    isRecord(value.suggested);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reviewOutcomeSample(
  row: Record<string, unknown>,
  input: LearningReviewOutcomeInput,
): Record<string, unknown> | null {
  const ruleId = stringFrom(row.rule_id);
  const skillId = stringFrom(row.skill_id);
  const appliedTarget = stringFrom(row.applied_target);
  if (!ruleId || !skillId || !appliedTarget) return null;
  const metadata = isRecord(row.safe_metadata) ? row.safe_metadata : {};
  const accuracyDelta = priceBandMissRatio(
    input.finalPrice,
    integerFrom(metadata.applied_price_min),
    integerFrom(metadata.applied_price_max),
  );
  const satisfactionDelta = Math.max(0, Math.min(1, (5 - input.rating) / 5));
  return {
    rule_id: ruleId,
    skill_id: skillId,
    job_id: input.jobId,
    actor_role: "system",
    applied_target: appliedTarget,
    applied_count: 0,
    override_count: accuracyDelta !== null && accuracyDelta > 0 ? 1 : 0,
    accuracy_delta: accuracyDelta,
    satisfaction_delta: satisfactionDelta,
    safe_metadata: {
      source: "review_outcome",
      source_application_log_id: stringFrom(row.id),
      final_price_present: input.finalPrice !== null,
      rating_present: true,
    },
  };
}

function priceBandMissRatio(
  finalPrice: number | null,
  min: number | null,
  max: number | null,
): number | null {
  if (
    finalPrice === null ||
    min === null ||
    max === null ||
    finalPrice <= 0 ||
    min <= 0 ||
    max < min
  ) {
    return null;
  }
  if (finalPrice < min) return roundMetric((min - finalPrice) / min);
  if (finalPrice > max) return roundMetric((finalPrice - max) / max);
  return 0;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function learningReviewOutcomeEnabled(): boolean {
  const deno = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno;
  const readEnabled = readBooleanEnvFlag(deno?.env?.get?.("KAEL_LEARNING_READ_ENABLED"), false);
  const writeEnabled = readBooleanEnvFlag(deno?.env?.get?.("KAEL_LEARNING_WRITE_ENABLED"), false);
  const killSwitch = readBooleanEnvFlag(deno?.env?.get?.("KAEL_LEARNING_KILL_SWITCH"), false);
  return readEnabled && writeEnabled && !killSwitch;
}

function asComplexityLevel(value: unknown): ComplexityLevel | null {
  return value === "small" || value === "medium" || value === "large"
    ? value
    : null;
}

function integerFrom(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) ? number : null;
}
