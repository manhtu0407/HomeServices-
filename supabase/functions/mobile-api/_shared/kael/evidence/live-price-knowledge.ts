import type {
  ComplexityLevel,
  MarketPriceResult,
  MarketSourceEvidence,
  ServiceType,
  VisionResult,
} from "../contracts/types.ts";
import type { MarketLookupResult } from "../tools/market-provider.ts";
import { scrubSensitiveForLLM } from "../pipeline/utils.ts";

export const LIVE_PRICE_RESEARCH_POLICY_ID = "kael.live_price_research.v1";
const ACTIVE_KNOWLEDGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// A failed lookup is remembered just long enough to stop a customer's follow-up questions
// from re-buying the same empty search; new evidence changes the fingerprint and retries.
const GAP_KNOWLEDGE_TTL_MS = 6 * 60 * 60 * 1000;
const SOURCE_FRESHNESS_MONTHS = 12;
const DISTRICT_SCOPE = "hcmc_all";
const PRIOR_FINDING_LIMIT = 3;

type KnowledgeQuery = {
  select(columns?: string): KnowledgeQuery;
  insert(value: unknown): KnowledgeQuery;
  update(value: unknown): KnowledgeQuery;
  eq(column: string, value: unknown): KnowledgeQuery;
  gt(column: string, value: unknown): KnowledgeQuery;
  order(column: string, options?: { ascending?: boolean }): KnowledgeQuery;
  limit(count: number): KnowledgeQuery;
  maybeSingle(): KnowledgeQuery;
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

export type PriceKnowledgeClient = {
  from(table: string): KnowledgeQuery;
};

type QueryResult = { data?: unknown; error?: { code?: string } | null };

export type ActivePriceKnowledge = {
  id: string;
  unit: string;
  aggregateMin: number;
  aggregateMax: number;
  acceptedSourceCount: number;
  highTrustSourceCount: number;
  requiredQuorum: number;
  sources: PriceKnowledgeSource[];
  confidence: number;
  reuseCount: number;
  verifiedAt: string;
};

export type PriceKnowledgeGap = {
  id: string;
  researchFingerprint: string;
  failureReason: string;
  demandCount: number;
  checkedSourceCount: number;
  rejectionReasons: string[];
  expiresAt: string;
};

export type PriceKnowledgeSource = {
  domain: string;
  url: string | null;
  price_min: number;
  price_max: number;
  unit: string;
  date: string;
  auto_tier: number;
};

export type PriceKnowledgeState = {
  serviceProblemId: string | null;
  problemLabelVi: string | null;
  active: ActivePriceKnowledge | null;
  gap: PriceKnowledgeGap | null;
  priorFindings: string[];
};

export type MarketResearchInput = {
  serviceType: ServiceType;
  problemSlug: string;
  problemLabelVi: string | null;
  customerDetail: string;
  visualFindings: string[];
  recommendedScope: string | null;
};

export function asPriceKnowledgeClient(value: unknown): PriceKnowledgeClient | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return typeof (value as { from?: unknown }).from === "function"
    ? value as PriceKnowledgeClient
    : undefined;
}

// Reads never block pricing: a missing table or a transient error degrades to "no
// knowledge", which sends the case to live research exactly as before this store existed.
export async function readPriceKnowledgeState(
  client: PriceKnowledgeClient | undefined,
  serviceType: ServiceType,
  problemSlug: string,
  now = new Date(),
): Promise<PriceKnowledgeState> {
  const empty: PriceKnowledgeState = {
    serviceProblemId: null,
    problemLabelVi: null,
    active: null,
    gap: null,
    priorFindings: [],
  };
  if (!client) return empty;
  try {
    const nowIso = now.toISOString();
    const [problem, active, gap, findings] = await Promise.all([
      client.from("service_problems")
        .select("id, label_vi")
        .eq("service_type", serviceType)
        .eq("slug", problemSlug)
        .maybeSingle() as PromiseLike<QueryResult>,
      client.from("kael_price_knowledge")
        .select(
          "id, unit, aggregate_min, aggregate_max, accepted_source_count, high_trust_source_count, required_quorum, sources, reuse_count, verified_at, safe_metadata",
        )
        .eq("service_type", serviceType)
        .eq("problem_slug", problemSlug)
        .eq("district_scope", DISTRICT_SCOPE)
        .eq("status", "active")
        .gt("expires_at", nowIso)
        .maybeSingle() as PromiseLike<QueryResult>,
      client.from("kael_price_knowledge")
        .select("id, research_fingerprint, failure_reason, demand_count, expires_at, safe_metadata")
        .eq("service_type", serviceType)
        .eq("problem_slug", problemSlug)
        .eq("district_scope", DISTRICT_SCOPE)
        .eq("status", "insufficient")
        .gt("expires_at", nowIso)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle() as PromiseLike<QueryResult>,
      client.from("kael_case_knowledge")
        .select("finding")
        .eq("service_type", serviceType)
        .eq("problem_slug", problemSlug)
        .order("created_at", { ascending: false })
        .limit(PRIOR_FINDING_LIMIT) as PromiseLike<QueryResult>,
    ]);
    const problemRow = asRecord(problem.data);
    return {
      serviceProblemId: stringOrNull(problemRow.id),
      problemLabelVi: stringOrNull(problemRow.label_vi),
      active: problem.error || active.error ? null : parseActiveKnowledge(active.data),
      gap: gap.error ? null : parseGap(gap.data),
      priorFindings: findings.error || !Array.isArray(findings.data)
        ? []
        : findings.data.flatMap((row) => {
          const finding = stringOrNull(asRecord(row).finding);
          return finding ? [finding] : [];
        }),
    };
  } catch {
    console.warn("kael price knowledge read failed", { errorCode: "KNOWLEDGE_READ_REJECTED" });
    return empty;
  }
}

export function buildMarketResearchInput(input: {
  serviceType: ServiceType;
  problemSlug: string;
  problemLabelVi: string | null;
  customerDetail: string;
  analysis: VisionResult | null;
}): MarketResearchInput {
  const findings = input.analysis
    ? [
      input.analysis.problem_identified,
      ...(input.analysis.evidence_findings ?? []).map((finding) => finding.observation),
    ]
    : [];
  return {
    serviceType: input.serviceType,
    problemSlug: input.problemSlug,
    problemLabelVi: input.problemLabelVi,
    customerDetail: input.customerDetail.trim().slice(0, 600),
    visualFindings: findings
      .map((finding) => scrubSensitiveForLLM(finding).trim())
      .filter((finding) => finding.length > 0)
      .slice(0, 4),
    recommendedScope: input.analysis?.recommended_scope
      ? scrubSensitiveForLLM(input.analysis.recommended_scope).trim() || null
      : null,
  };
}

// Free text cannot key the gap cache: every follow-up question is appended to the case
// detail and vision wording varies between runs, so a text key would re-buy the same empty
// search on each message. A new photo is the evidence that can change the answer.
export async function researchFingerprint(input: {
  serviceType: ServiceType;
  problemSlug: string;
  photoCount: number;
}): Promise<string> {
  const canonical = JSON.stringify([
    LIVE_PRICE_RESEARCH_POLICY_ID,
    input.serviceType,
    input.problemSlug,
    Math.max(0, Math.trunc(input.photoCount)),
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function marketResultFromKnowledge(active: ActivePriceKnowledge): MarketLookupResult {
  const sources: MarketSourceEvidence[] = active.sources.map((source) => ({
    domain: source.domain,
    price_min: source.price_min,
    price_max: source.price_max,
    unit: source.unit as MarketSourceEvidence["unit"],
    date: source.date,
  }));
  const citations = active.sources.flatMap((source) => source.url ? [source.url] : []);
  const market: MarketPriceResult = {
    market_range_min: active.aggregateMin,
    market_range_max: active.aggregateMax,
    confidence: active.confidence,
    sources_summary: `Tổng hợp ${active.acceptedSourceCount} nguồn đã kiểm chứng (Kael đã lưu).`,
    ...(citations.length > 0 ? { citations } : {}),
    sources,
  };
  return {
    success: true,
    market,
    provider: "perplexity",
    model: "kael-price-knowledge",
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    cacheStatus: "hit",
    safeMetadata: {
      source_trust_enabled: true,
      source_trust_quorum_met: true,
      source_trust_accepted_source_count: active.acceptedSourceCount,
      source_trust_tier_1_2_count: active.highTrustSourceCount,
      source_trust_required_quorum: active.requiredQuorum,
      source_trust_aggregation_unit: active.unit,
      source_trust_accepted_sources: active.sources.map((source) => ({
        domain: source.domain,
        ...publicSourceLink(source.url, source.domain),
        price_min: source.price_min,
        price_max: source.price_max,
        unit: source.unit,
        date: source.date,
        auto_tier: source.auto_tier,
      })),
      kael_price_knowledge_id: active.id,
      kael_price_knowledge_result: "hit",
      kael_price_knowledge_verified_at: active.verifiedAt,
    },
  };
}

export function hasVerifiedMarketQuorum(
  result: MarketLookupResult | undefined,
): result is Extract<MarketLookupResult, { success: true }> {
  if (!result?.success) return false;
  const metadata = result.safeMetadata ?? {};
  const highTrust = positiveInteger(metadata.source_trust_tier_1_2_count);
  return metadata.source_trust_quorum_met === true && highTrust !== null && highTrust >= 2;
}

export function marketResultFromGap(gap: PriceKnowledgeGap): MarketLookupResult {
  return {
    success: false,
    failureReason: `kael_price_knowledge:${gap.failureReason}`,
    provider: "perplexity",
    model: "kael-price-knowledge",
    safeMetadata: {
      source_trust_enabled: true,
      source_trust_quorum_met: false,
      kael_price_knowledge_id: gap.id,
      kael_price_knowledge_result: "recent_gap",
      kael_price_knowledge_gap_reason: gap.failureReason,
      kael_price_knowledge_checked_source_count: gap.checkedSourceCount,
      kael_price_knowledge_rejection_reasons: gap.rejectionReasons,
    },
  };
}

// The validated market result is the server's decision; nothing here re-reads model text.
// Only a lookup that already met the Tier 1-2 quorum becomes reusable knowledge.
export async function recordPriceKnowledgeOutcome(
  client: PriceKnowledgeClient | undefined,
  input: {
    serviceType: ServiceType;
    problemSlug: string;
    serviceProblemId: string | null;
    fingerprint: string;
    result: MarketLookupResult;
    existingGap: PriceKnowledgeGap | null;
    now?: Date;
  },
): Promise<{ knowledgeId: string | null; status: "active" | "insufficient" | "skipped" }> {
  if (!client) return { knowledgeId: null, status: "skipped" };
  const resultSource = input.result.safeMetadata?.kael_price_knowledge_result;
  if (resultSource === "hit" || resultSource === "recent_gap") {
    return { knowledgeId: null, status: "skipped" };
  }
  const now = input.now ?? new Date();
  try {
    const active = input.result.success ? activeRowFromResult(input, now) : null;
    if (active) {
      await (client.from("kael_price_knowledge")
        .update({ status: "superseded", updated_at: now.toISOString() })
        .eq("service_type", input.serviceType)
        .eq("problem_slug", input.problemSlug)
        .eq("district_scope", DISTRICT_SCOPE)
        .eq("status", "active") as PromiseLike<QueryResult>);
      const inserted = await (client.from("kael_price_knowledge")
        .insert(active)
        .select("id")
        .maybeSingle() as PromiseLike<QueryResult>);
      if (inserted.error) {
        console.warn("kael price knowledge write failed", {
          errorCode: inserted.error.code ?? "DB_ERROR",
        });
        return { knowledgeId: null, status: "skipped" };
      }
      return { knowledgeId: stringOrNull(asRecord(inserted.data).id), status: "active" };
    }
    if (input.existingGap && input.existingGap.researchFingerprint === input.fingerprint) {
      await (client.from("kael_price_knowledge")
        .update({
          demand_count: input.existingGap.demandCount + 1,
          updated_at: now.toISOString(),
        })
        .eq("id", input.existingGap.id) as PromiseLike<QueryResult>);
      return { knowledgeId: input.existingGap.id, status: "insufficient" };
    }
    const gap = gapRowFromResult(input, now);
    const inserted = await (client.from("kael_price_knowledge")
      .insert(gap)
      .select("id")
      .maybeSingle() as PromiseLike<QueryResult>);
    if (inserted.error) {
      console.warn("kael price knowledge gap write failed", {
        errorCode: inserted.error.code ?? "DB_ERROR",
      });
      return { knowledgeId: null, status: "skipped" };
    }
    return { knowledgeId: stringOrNull(asRecord(inserted.data).id), status: "insufficient" };
  } catch {
    console.warn("kael price knowledge write failed", { errorCode: "KNOWLEDGE_WRITE_REJECTED" });
    return { knowledgeId: null, status: "skipped" };
  }
}

export async function recordPriceKnowledgeReuse(
  client: PriceKnowledgeClient | undefined,
  active: ActivePriceKnowledge,
  now = new Date(),
): Promise<void> {
  if (!client) return;
  try {
    await (client.from("kael_price_knowledge")
      .update({ reuse_count: active.reuseCount + 1, updated_at: now.toISOString() })
      .eq("id", active.id) as PromiseLike<QueryResult>);
  } catch {
    console.warn("kael price knowledge reuse count failed", { errorCode: "KNOWLEDGE_WRITE_REJECTED" });
  }
}

export async function recordPriceKnowledgeGapDemand(
  client: PriceKnowledgeClient | undefined,
  gap: PriceKnowledgeGap,
  now = new Date(),
): Promise<void> {
  if (!client) return;
  try {
    await (client.from("kael_price_knowledge")
      .update({ demand_count: gap.demandCount + 1, updated_at: now.toISOString() })
      .eq("id", gap.id) as PromiseLike<QueryResult>);
  } catch {
    console.warn("kael price knowledge demand count failed", { errorCode: "KNOWLEDGE_WRITE_REJECTED" });
  }
}

// Photos never enter this table. What is kept is the model's scrubbed reading of them, so
// the next case with the same problem starts from what earlier evidence showed.
export async function recordCaseKnowledge(
  client: PriceKnowledgeClient | undefined,
  input: {
    serviceType: ServiceType;
    problemSlug: string;
    analysis: VisionResult;
    complexity: ComplexityLevel;
    priceKnowledgeId: string | null;
  },
): Promise<void> {
  if (!client) return;
  const finding = scrubSensitiveForLLM(input.analysis.problem_identified).trim().slice(0, 500);
  if (!finding) return;
  const scope = input.analysis.recommended_scope
    ? scrubSensitiveForLLM(input.analysis.recommended_scope).trim().slice(0, 400)
    : "";
  try {
    const result = await (client.from("kael_case_knowledge").insert({
      service_type: input.serviceType,
      problem_slug: input.problemSlug,
      finding,
      recommended_scope: scope || null,
      severity_indicators: input.analysis.severity_indicators
        .map((item) => scrubSensitiveForLLM(item).trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 5),
      complexity_hint: input.complexity,
      price_knowledge_id: input.priceKnowledgeId,
    }) as PromiseLike<QueryResult>);
    if (result.error) {
      console.warn("kael case knowledge write failed", { errorCode: result.error.code ?? "DB_ERROR" });
    }
  } catch {
    console.warn("kael case knowledge write failed", { errorCode: "KNOWLEDGE_WRITE_REJECTED" });
  }
}

function activeRowFromResult(
  input: {
    serviceType: ServiceType;
    problemSlug: string;
    serviceProblemId: string | null;
    fingerprint: string;
    result: MarketLookupResult;
  },
  now: Date,
): Record<string, unknown> | null {
  if (!input.result.success) return null;
  const metadata = input.result.safeMetadata ?? {};
  if (metadata.source_trust_quorum_met !== true) return null;
  const highTrust = positiveInteger(metadata.source_trust_tier_1_2_count);
  const requiredQuorum = positiveInteger(metadata.source_trust_required_quorum);
  const unit = metadata.source_trust_aggregation_unit;
  if (
    highTrust === null || requiredQuorum === null || highTrust < 2 ||
    highTrust < requiredQuorum ||
    (unit !== "per_visit" && unit !== "per_repair_point" && unit !== "per_item")
  ) {
    return null;
  }
  const sources = acceptedSources(metadata.source_trust_accepted_sources, input.result.market);
  if (sources.length < highTrust) return null;
  const oldestSource = sources.map((source) => Date.parse(`${source.date}T00:00:00.000Z`))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)[0];
  if (oldestSource === undefined) return null;
  const freshnessLimit = new Date(oldestSource);
  freshnessLimit.setUTCMonth(freshnessLimit.getUTCMonth() + SOURCE_FRESHNESS_MONTHS);
  const expiresAt = Math.min(now.getTime() + ACTIVE_KNOWLEDGE_TTL_MS, freshnessLimit.getTime());
  if (expiresAt <= now.getTime()) return null;
  return {
    service_type: input.serviceType,
    problem_slug: input.problemSlug,
    service_problem_id: input.serviceProblemId,
    district_scope: DISTRICT_SCOPE,
    status: "active",
    unit,
    aggregate_min: input.result.market.market_range_min,
    aggregate_max: input.result.market.market_range_max,
    accepted_source_count: sources.length,
    high_trust_source_count: highTrust,
    required_quorum: requiredQuorum,
    sources,
    research_fingerprint: input.fingerprint,
    policy_id: LIVE_PRICE_RESEARCH_POLICY_ID,
    verified_at: now.toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
    safe_metadata: {
      decision_actor: "kael_system",
      decision_policy_id: LIVE_PRICE_RESEARCH_POLICY_ID,
      confidence: input.result.market.confidence,
      provider: input.result.provider,
      model: input.result.model,
      source_trust_version: metadata.source_trust_version ?? null,
      reversible: true,
      appealable: true,
    },
  };
}

function gapRowFromResult(
  input: {
    serviceType: ServiceType;
    problemSlug: string;
    serviceProblemId: string | null;
    fingerprint: string;
    result: MarketLookupResult;
  },
  now: Date,
): Record<string, unknown> {
  const metadata = input.result.safeMetadata ?? {};
  const failureReason = input.result.success
    ? "weak_quorum"
    : input.result.failureReason.replace(/^[a-z]+:/, "").slice(0, 120) || "insufficient_trusted_data";
  return {
    service_type: input.serviceType,
    problem_slug: input.problemSlug,
    service_problem_id: input.serviceProblemId,
    district_scope: DISTRICT_SCOPE,
    status: "insufficient",
    research_fingerprint: input.fingerprint,
    failure_reason: failureReason,
    policy_id: LIVE_PRICE_RESEARCH_POLICY_ID,
    verified_at: now.toISOString(),
    expires_at: new Date(now.getTime() + GAP_KNOWLEDGE_TTL_MS).toISOString(),
    safe_metadata: {
      checked_source_count: nonNegativeInteger(metadata.source_trust_raw_source_count) ?? 0,
      accepted_citations: nonNegativeInteger(metadata.accepted_citations) ?? 0,
      high_trust_source_count: nonNegativeInteger(metadata.source_trust_tier_1_2_count) ?? 0,
      rejection_reasons: rejectionReasons(metadata.source_trust_source_rejections),
    },
  };
}

function acceptedSources(value: unknown, market: MarketPriceResult): PriceKnowledgeSource[] {
  if (!Array.isArray(value)) return [];
  const citations = market.citations ?? [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    const domain = stringOrNull(row.domain);
    const priceMin = positiveInteger(row.price_min);
    const priceMax = positiveInteger(row.price_max);
    const unit = stringOrNull(row.unit);
    const date = stringOrNull(row.date);
    const autoTier = positiveInteger(row.auto_tier);
    if (!domain || priceMin === null || priceMax === null || !unit || !date || autoTier === null) {
      return [];
    }
    const citation = citations.find((item) => Boolean(publicSourceLink(item, domain).verified_url));
    const url = citation ? publicSourceLink(citation, domain).verified_url ?? null : null;
    return [{ domain, url, price_min: priceMin, price_max: priceMax, unit, date, auto_tier: autoTier }];
  });
}

function publicSourceLink(value: string | null, expectedDomain: string): {
  verified_domain?: string;
  verified_url?: string;
} {
  const domain = expectedDomain.trim().toLowerCase();
  if (
    !value || value.length > 2_000 ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/u.test(domain)
  ) return {};
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      (url.hostname.toLowerCase() !== domain && url.hostname.toLowerCase() !== `www.${domain}`)
    ) return {};
    url.search = "";
    url.hash = "";
    const canonical = url.toString();
    if (canonical.length > 2_000) return {};
    return {
      verified_domain: domain,
      verified_url: canonical,
    };
  } catch {
    return {};
  }
}

function parseActiveKnowledge(value: unknown): ActivePriceKnowledge | null {
  const row = asRecord(value);
  const id = stringOrNull(row.id);
  const unit = stringOrNull(row.unit);
  const aggregateMin = positiveInteger(row.aggregate_min);
  const aggregateMax = positiveInteger(row.aggregate_max);
  const accepted = positiveInteger(row.accepted_source_count);
  const highTrust = positiveInteger(row.high_trust_source_count);
  const requiredQuorum = positiveInteger(row.required_quorum);
  if (
    !id || !unit || aggregateMin === null || aggregateMax === null || aggregateMax < aggregateMin ||
    accepted === null || highTrust === null || requiredQuorum === null ||
    highTrust < 2 || highTrust < requiredQuorum || !Array.isArray(row.sources)
  ) {
    return null;
  }
  const sources = row.sources.flatMap((item) => {
    const source = asRecord(item);
    const domain = stringOrNull(source.domain);
    const priceMin = positiveInteger(source.price_min);
    const priceMax = positiveInteger(source.price_max);
    const date = stringOrNull(source.date);
    const autoTier = positiveInteger(source.auto_tier);
    if (!domain || priceMin === null || priceMax === null || !date || autoTier === null) return [];
    return [{
      domain,
      url: stringOrNull(source.url),
      price_min: priceMin,
      price_max: priceMax,
      unit: stringOrNull(source.unit) ?? unit,
      date,
      auto_tier: autoTier,
    }];
  });
  if (sources.length !== accepted) return null;
  const confidence = Number(asRecord(row.safe_metadata).confidence);
  return {
    id,
    unit,
    aggregateMin,
    aggregateMax,
    acceptedSourceCount: accepted,
    highTrustSourceCount: highTrust,
    requiredQuorum,
    sources,
    confidence: Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : 0.6,
    reuseCount: nonNegativeInteger(row.reuse_count) ?? 0,
    verifiedAt: stringOrNull(row.verified_at) ?? "",
  };
}

function parseGap(value: unknown): PriceKnowledgeGap | null {
  const row = asRecord(value);
  const id = stringOrNull(row.id);
  const fingerprint = stringOrNull(row.research_fingerprint);
  if (!id || !fingerprint) return null;
  const metadata = asRecord(row.safe_metadata);
  return {
    id,
    researchFingerprint: fingerprint,
    failureReason: stringOrNull(row.failure_reason) ?? "insufficient_trusted_data",
    demandCount: positiveInteger(row.demand_count) ?? 1,
    checkedSourceCount: nonNegativeInteger(metadata.checked_source_count) ?? 0,
    rejectionReasons: Array.isArray(metadata.rejection_reasons)
      ? metadata.rejection_reasons.filter((item): item is string => typeof item === "string")
      : [],
    expiresAt: stringOrNull(row.expires_at) ?? "",
  };
}

function rejectionReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => {
    const reason = stringOrNull(asRecord(item).reason);
    return reason ? [reason] : [];
  }))].slice(0, 6);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
