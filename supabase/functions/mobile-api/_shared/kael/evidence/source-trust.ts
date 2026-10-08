import type { AIMessage, ComplexityLevel, ServiceType } from "../contracts/types.ts";
import { KAEL_BUSINESS_GUARDRAILS, KAEL_RESPONSE_STYLE } from "../contracts/types.ts";

export const SOURCE_TRUST_VERSION = "source-trust-r4-live-research";
const SOURCE_TRUST_CACHE_TTL_MS = 5 * 60 * 1000;
const SOURCE_TRUST_MIN_EFFECTIVE_SCORE = 0.5;

// Perplexity rejects the entire request with HTTP 400 once search_domain_filter carries more
// than 20 entries, so the registry is truncated to its highest-trust domains instead of being
// sent whole. The literal list below is already sized to this limit.
const PERPLEXITY_SEARCH_DOMAIN_LIMIT = 20;

const TIER_1_SOURCE_TRUST_DOMAINS = Object.freeze([
  "btaskee.com",
  "jupviec.vn",
  "tuoitre.vn",
  "thanhnien.vn",
  "dienmayxanh.com",
  "suachuatainha.com.vn",
  "tktclean.com",
  "cleanipedia.com",
  "hoanmyclean.vn",
  "thoviet.com.vn",
  "thosaigon.vn",
  "suadiennuocnamviet.com",
  "khodiennuoc.com",
  "f24.vn",
  "suadiennuocvn.net",
  "saigonfix.vn",
  "diennuochonglinh.com",
  "moitruongmiendong.com",
  "drhome.com.vn",
  "diennuochuongthinh.com",
] as const);

export type SourceTrustTier = "tier_1" | "tier_2" | "tier_3" | "blocked";
export type SourceTrustAutoTier = 1 | 2 | 3 | 4 | 5;
export type SourceTrustCriteria = Readonly<{
  A: boolean;
  B: boolean;
  C: boolean;
  D: boolean;
  E: boolean;
  F: boolean;
  G: boolean;
}>;
export type SourceTrustRegistryEntry = {
  domain: string;
  tier: SourceTrustTier;
  autoTier: SourceTrustAutoTier;
  trustScore: number;
  isActive: boolean;
  lastReviewedAt: string | null;
  effectiveUntil: string | null;
  entityType: string | null;
  region: string | null;
  criteriaMet: SourceTrustCriteria;
  serviceTypes: readonly string[];
};

// What Kael already knows about the case when it searches. Every field is model-derived
// or customer text that has already passed the PII scrubber; none of it is a media ref.
export type MarketResearchContext = {
  problemLabelVi?: string | null;
  customerDetail?: string | null;
  visualFindings?: readonly string[];
  recommendedScope?: string | null;
  priorFindings?: readonly string[];
};

type TrustedMarketInput = {
  serviceType: ServiceType;
  problem: string;
  complexity: ComplexityLevel;
  district: string;
  research?: MarketResearchContext;
};

export type SourceTrustLookupResult = {
  requestedDomain: string;
  matchedDomain: string | null;
  tier: SourceTrustTier;
  trustScore: number;
  effectiveTrustScore: number;
  isActive: boolean;
  source: "db" | "fallback";
};

export type CitationValidationResult = {
  quorumMet: boolean;
  quorum: number;
  source: "db" | "fallback";
  accepted: Array<{
    url: string;
    domain: string;
    matchedDomain: string;
    tier: SourceTrustTier;
    autoTier: SourceTrustAutoTier;
    trustScore: number;
    effectiveTrustScore: number;
    entityType: string | null;
    region: string | null;
    criteriaMet: SourceTrustCriteria;
  }>;
  rejected: Array<{
    url: string;
    domain: string | null;
    reason: string;
  }>;
  safeMetadata: Record<string, unknown>;
};

export type CitationValidationOptions = {
  now?: Date;
  maxAutoTier?: SourceTrustAutoTier;
  quorumAutoTierMax?: 1 | 2;
  marketAmountVnd?: number;
  highValueThresholdVnd?: number;
};

export type TrustedPerplexityMarketConfig = {
  model: "sonar";
  maxTokens: 600;
  timeoutMs: 6_000;
  searchDomainFilter: readonly string[];
  searchRecencyFilter: "year";
  searchMode: "web";
  searchContextSize: "medium";
  messages: AIMessage[];
  safeMetadata: Record<string, unknown>;
};

type SourceTrustQuery = {
  select(columns?: string, options?: unknown): SourceTrustQuery;
  eq(column: string, value: unknown): SourceTrustQuery;
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

type SourceTrustClient = {
  from(table: string): SourceTrustQuery;
};

let registryCache:
  | {
    expiresAt: number;
    source: "db" | "fallback";
    rows: SourceTrustRegistryEntry[];
  }
  | null = null;

export function resetSourceTrustRegistryCacheForTest(): void {
  registryCache = null;
}

export function isSourceTrustPerplexityFilterEnabled(
  getEnv = readRuntimeEnv,
): boolean {
  const value = getEnv("KAEL_TRUST_PERPLEXITY_FILTER_ENABLED") ??
    getEnv("KAEL_OPT_SOURCE_TRUST_ENABLED");
  return typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function sourceTrustHighValueThresholdVnd(
  getEnv = readRuntimeEnv,
): number | null {
  const raw = getEnv("KAEL_SOURCE_TRUST_HIGH_VALUE_VND");
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function sourceTrustQuorumForMarketAmount(
  marketAmountVnd: number,
  highValueThresholdVnd: number,
): number {
  return marketAmountVnd >= highValueThresholdVnd ? 3 : 2;
}

export function trustedPerplexityMarketConfig(
  input: TrustedMarketInput,
): TrustedPerplexityMarketConfig {
  return buildTrustedPerplexityMarketConfig(
    input,
    fallbackRegistryRows(),
    "fallback",
  );
}

export async function trustedPerplexityMarketConfigForClient(
  input: TrustedMarketInput,
  supabase?: unknown,
): Promise<TrustedPerplexityMarketConfig> {
  const registry = await loadSourceTrustRegistry(supabase);
  return buildTrustedPerplexityMarketConfig(input, registry.rows, registry.source);
}

export async function lookupTrustScore(
  domainOrUrl: string,
  supabase?: unknown,
  options: { now?: Date } = {},
): Promise<SourceTrustLookupResult> {
  const now = options.now ?? new Date();
  const requestedDomain = normalizeDomain(domainOrUrl);
  if (!requestedDomain) {
    return blockedTrustScore("", "fallback");
  }

  const registry = await loadSourceTrustRegistry(supabase, now);
  const matched = findRegistryMatch(requestedDomain, registry.rows, now);
  if (!matched) return blockedTrustScore(requestedDomain, registry.source);

  return {
    requestedDomain,
    matchedDomain: matched.domain,
    tier: matched.tier,
    trustScore: matched.trustScore,
    effectiveTrustScore: effectiveTrustScore(matched, now),
    isActive: matched.isActive,
    source: registry.source,
  };
}

export async function validateCitations(
  citations: readonly string[],
  supabase?: unknown,
  quorum = 2,
  options: CitationValidationOptions = {},
): Promise<CitationValidationResult> {
  const now = options.now ?? new Date();
  const maxAutoTier = options.maxAutoTier ?? 1;
  const quorumAutoTierMax = options.quorumAutoTierMax ?? maxAutoTier;
  const dynamicQuorumRequested = options.marketAmountVnd !== undefined ||
    options.highValueThresholdVnd !== undefined;
  const quorumConfigValid = !dynamicQuorumRequested ||
    (Number.isSafeInteger(options.marketAmountVnd) &&
      Number.isSafeInteger(options.highValueThresholdVnd) &&
      (options.marketAmountVnd ?? 0) > 0 &&
      (options.highValueThresholdVnd ?? 0) > 0);
  const resolvedQuorum = quorumConfigValid && dynamicQuorumRequested
    ? sourceTrustQuorumForMarketAmount(
      options.marketAmountVnd as number,
      options.highValueThresholdVnd as number,
    )
    : quorum;
  const registry = await loadSourceTrustRegistry(supabase, now);
  const accepted: CitationValidationResult["accepted"] = [];
  const rejected: CitationValidationResult["rejected"] = [];
  const seenDomains = new Set<string>();

  for (const url of [...new Set(citations)].slice(0, 20)) {
    const domain = domainFromCitation(url);
    if (!domain) {
      rejected.push({ url, domain: null, reason: "invalid_url" });
      continue;
    }
    if (seenDomains.has(domain)) {
      rejected.push({ url, domain, reason: "duplicate_domain" });
      continue;
    }
    seenDomains.add(domain);

    const matched = findRegistryMatch(domain, registry.rows, now);
    if (!matched) {
      rejected.push({ url, domain, reason: "domain_not_trusted" });
      continue;
    }

    const score = effectiveTrustScore(matched, now);
    if (
      !matched.isActive ||
      score < SOURCE_TRUST_MIN_EFFECTIVE_SCORE ||
      matched.autoTier > maxAutoTier ||
      matched.autoTier === 5
    ) {
      rejected.push({ url, domain, reason: "trust_score_below_threshold" });
      continue;
    }

    accepted.push({
      url,
      domain,
      matchedDomain: matched.domain,
      tier: matched.tier,
      autoTier: matched.autoTier,
      trustScore: matched.trustScore,
      effectiveTrustScore: score,
      entityType: matched.entityType,
      region: matched.region,
      criteriaMet: matched.criteriaMet,
    });
  }

  const quorumEligible = accepted.filter((item) =>
    item.autoTier <= quorumAutoTierMax
  );
  const quorumMet = quorumConfigValid && quorumEligible.length >= resolvedQuorum;
  return {
    quorumMet,
    quorum: resolvedQuorum,
    source: registry.source,
    accepted,
    rejected,
    safeMetadata: {
      source_trust_citation_result: quorumMet
        ? "passed"
        : quorumConfigValid
        ? "insufficient_trusted_citations"
        : "source_trust_quorum_config_invalid",
      source_trust_registry_source: registry.source,
      source_trust_citation_quorum: resolvedQuorum,
      source_trust_citation_quorum_tier_max: quorumAutoTierMax,
      source_trust_citation_max_auto_tier: maxAutoTier,
      source_trust_quorum_config_valid: quorumConfigValid,
      total_citations: citations.length,
      accepted_citations: accepted.length,
      quorum_eligible_citations: quorumEligible.length,
      rejected_citations: rejected.length,
      accepted_domains: accepted.map((item) => item.matchedDomain),
    },
  };
}

export function effectiveTrustScore(
  entry: Pick<
    SourceTrustRegistryEntry,
    "trustScore" | "lastReviewedAt" | "effectiveUntil" | "isActive"
  >,
  now = new Date(),
): number {
  if (!entry.isActive) return 0;
  if (entry.effectiveUntil && Date.parse(entry.effectiveUntil) <= now.getTime()) {
    return 0;
  }
  const baseScore = clampScore(entry.trustScore);
  if (!entry.lastReviewedAt) return roundTrustScore(baseScore * 0.8);
  const reviewedAt = Date.parse(entry.lastReviewedAt);
  if (!Number.isFinite(reviewedAt)) return roundTrustScore(baseScore * 0.8);

  const daysSinceReview = (now.getTime() - reviewedAt) / 86_400_000;
  if (daysSinceReview < 90) return roundTrustScore(baseScore);
  if (daysSinceReview < 180) return roundTrustScore(baseScore * 0.9);
  if (daysSinceReview < 365) return roundTrustScore(baseScore * 0.7);
  return roundTrustScore(baseScore * 0.5);
}

function buildTrustedPerplexityMarketConfig(
  input: TrustedMarketInput,
  registryRows: readonly SourceTrustRegistryEntry[],
  source: "db" | "fallback",
): TrustedPerplexityMarketConfig {
  const domains = searchDomainsForService(input.serviceType, registryRows);

  return {
    model: "sonar",
    maxTokens: 600,
    timeoutMs: 6_000,
    searchDomainFilter: domains,
    searchRecencyFilter: "year",
    searchMode: "web",
    searchContextSize: "medium",
    messages: buildTrustedPerplexityMarketMessages(input),
    safeMetadata: {
      source_trust_enabled: true,
      source_trust_version: SOURCE_TRUST_VERSION,
      source_trust_registry_source: source,
      search_domain_filter_count: domains.length,
      search_recency_filter: "year",
      search_mode: "web",
      research_context_fields: researchContextFieldCount(input.research),
      search_context_size: "medium",
      latency_budget_ms: 6_000,
    },
  };
}

// Domains reviewed for this service come first, Tier 2 included: a price table from a
// verified local repair company is the evidence the quorum needs, and leaving it out of the
// search is what made every electrical lookup come back empty. Unscoped Tier 1 rows fill
// whatever room the provider limit leaves.
function searchDomainsForService(
  serviceType: ServiceType,
  registryRows: readonly SourceTrustRegistryEntry[],
): string[] {
  const usable = registryRows
    .filter((row) =>
      row.isActive &&
      effectiveTrustScore(row) >= SOURCE_TRUST_MIN_EFFECTIVE_SCORE
    )
    .sort((a, b) =>
      a.autoTier - b.autoTier || effectiveTrustScore(b) - effectiveTrustScore(a) ||
      a.domain.localeCompare(b.domain)
    );
  const serviceScoped = usable
    .filter((row) => row.autoTier <= 2 && row.serviceTypes.includes(serviceType))
    .map((row) => row.domain);
  const unscopedTier1 = usable
    .filter((row) => row.autoTier === 1 && row.serviceTypes.length === 0)
    .map((row) => row.domain);
  const domains = [...new Set([...serviceScoped, ...unscopedTier1])];
  return (domains.length > 0 ? domains : [...TIER_1_SOURCE_TRUST_DOMAINS])
    .slice(0, PERPLEXITY_SEARCH_DOMAIN_LIMIT);
}

function researchContextFieldCount(research: MarketResearchContext | undefined): number {
  if (!research) return 0;
  return [
    research.problemLabelVi,
    research.customerDetail,
    research.recommendedScope,
    (research.visualFindings ?? []).length > 0 ? "visual" : null,
    (research.priorFindings ?? []).length > 0 ? "prior" : null,
  ].filter((value) => typeof value === "string" && value.trim().length > 0).length;
}

function clipResearchText(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function researchContextLines(research: MarketResearchContext | undefined): string {
  if (!research) return "";
  const lines: string[] = [];
  if (research.problemLabelVi?.trim()) {
    lines.push(`Vấn đề (tiếng Việt): ${clipResearchText(research.problemLabelVi, 120)}`);
  }
  if (research.customerDetail?.trim()) {
    lines.push(`Mô tả của khách: ${clipResearchText(research.customerDetail, 400)}`);
  }
  const findings = (research.visualFindings ?? [])
    .map((finding) => clipResearchText(finding, 160))
    .filter(Boolean)
    .slice(0, 4);
  if (findings.length > 0) {
    lines.push(`Phát hiện từ ảnh hiện trạng: ${findings.join("; ")}`);
  }
  if (research.recommendedScope?.trim()) {
    lines.push(`Phạm vi đề xuất: ${clipResearchText(research.recommendedScope, 240)}`);
  }
  const prior = (research.priorFindings ?? [])
    .map((finding) => clipResearchText(finding, 160))
    .filter(Boolean)
    .slice(0, 3);
  if (prior.length > 0) {
    lines.push(`Ghi nhận từ các ca tương tự trước đây: ${prior.join("; ")}`);
  }
  return lines.length > 0 ? `\n${lines.join("\n")}` : "";
}

function buildTrustedPerplexityMarketMessages(input: TrustedMarketInput): AIMessage[] {
  return [
    {
      role: "system",
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

You are a price researcher for NestScout apartment services in Ho Chi Minh City.
Use only the trusted Vietnamese domains configured in this request.

When enough trusted evidence exists, return ONLY valid JSON:
{
  "sources": [
    {
      "domain": "trusted-source.example",
      "price_min": number,
      "price_max": number,
      "unit": "per_visit" | "per_repair_point" | "per_item" | "per_hour" | "per_m2",
      "date": "YYYY-MM-DD",
      "signals": {
        "identity_verified": boolean,
        "source_type": "direct_pricing" | "materials" | "reference" | "listing" | "unknown",
        "hcmc_relevant": boolean,
        "clear_price_and_unit": boolean,
        "integrity_verified": boolean,
        "evidence_verified": boolean,
        "review_overdue": boolean,
        "price_jump_suspected": boolean
      }
    }
  ],
  "sources_summary": "short Vietnamese summary mentioning trusted source count",
  "citations": ["https://trusted-source.example/path"]
}

Rules:
- Prefer at least 2 different trusted domains.
- Return one entry per source. Do not return a blended market range.
- Keep the domain, price range, unit, date, and A-G evidence signals factual to that source.
- Do not return or claim any trust tier. NestScout's deterministic rulebook computes it.
- Do not use Facebook groups, personal forums, personal blogs, or open classifieds.
- Search Vietnamese price tables ("bảng giá", "giá sửa", "giá dịch vụ") for the exact work described, using the Vietnamese problem, the customer description, and the photo findings.
- Use per_repair_point for a price per repaired point or device, per_item for a price per replaced item, per_visit for a package or visit price.
- Do not invent prices or citations.
- If trusted data is insufficient, return {"error":"insufficient_trusted_data"}.`,
    },
    {
      role: "user",
      content: `Service: ${input.serviceType}
Problem: ${input.problem}
Complexity: ${input.complexity}
District: ${input.district}
Location: Ho Chi Minh City, Vietnam${researchContextLines(input.research)}`,
    },
  ];
}

async function loadSourceTrustRegistry(
  supabase?: unknown,
  now = new Date(),
): Promise<{ source: "db" | "fallback"; rows: SourceTrustRegistryEntry[] }> {
  const client = asSourceTrustClient(supabase);
  if (
    registryCache &&
    registryCache.expiresAt > now.getTime() &&
    (!client || registryCache.source === "db")
  ) {
    return { source: registryCache.source, rows: registryCache.rows };
  }

  if (!client) {
    const rows = fallbackRegistryRows();
    registryCache = {
      source: "fallback",
      rows,
      expiresAt: now.getTime() + SOURCE_TRUST_CACHE_TTL_MS,
    };
    return { source: "fallback", rows };
  }

  const result = await selectRegistryRows(client);

  const rows = !result.error && Array.isArray(result.data)
    ? result.data.map(normalizeRegistryRow).filter((row): row is SourceTrustRegistryEntry => row !== null)
    : [];

  if (rows.length > 0) {
    registryCache = {
      source: "db",
      rows,
      expiresAt: now.getTime() + SOURCE_TRUST_CACHE_TTL_MS,
    };
    return { source: "db", rows };
  }

  const fallback = fallbackRegistryRows();
  registryCache = {
    source: "fallback",
    rows: fallback,
    expiresAt: now.getTime() + SOURCE_TRUST_CACHE_TTL_MS,
  };
  return { source: "fallback", rows: fallback };
}

type RegistrySelectResult = {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
};

const REGISTRY_COLUMNS =
  "domain,tier,auto_tier,entity_type,region,criteria_met,trust_score,last_reviewed_at,is_active,effective_until";

// service_types arrives with a migration that can land after this code is deployed; an
// undefined-column error must not drop the whole registry to the hardcoded fallback.
async function selectRegistryRows(client: SourceTrustClient): Promise<RegistrySelectResult> {
  const scoped = await client
    .from("source_trust_registry")
    .select(`${REGISTRY_COLUMNS},service_types`)
    .eq("is_active", true) as RegistrySelectResult;
  if (scoped.error?.code !== "42703") return scoped;
  return await client
    .from("source_trust_registry")
    .select(REGISTRY_COLUMNS)
    .eq("is_active", true) as RegistrySelectResult;
}

function normalizeRegistryRow(value: unknown): SourceTrustRegistryEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const domain = normalizeDomain(row.domain);
  const tier = normalizeTier(row.tier);
  const trustScore = numberOrNull(row.trust_score);
  if (!domain || !tier || trustScore === null) return null;
  const autoTier = normalizeAutoTier(row.auto_tier, tier);
  if (!autoTier) return null;
  return {
    domain,
    tier,
    autoTier,
    trustScore,
    isActive: row.is_active !== false,
    lastReviewedAt: typeof row.last_reviewed_at === "string"
      ? row.last_reviewed_at
      : null,
    effectiveUntil: typeof row.effective_until === "string"
      ? row.effective_until
      : null,
    entityType: nullableString(row.entity_type),
    region: nullableString(row.region),
    criteriaMet: normalizeCriteriaMet(row.criteria_met),
    serviceTypes: Array.isArray(row.service_types)
      ? row.service_types.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function fallbackRegistryRows(): SourceTrustRegistryEntry[] {
  return TIER_1_SOURCE_TRUST_DOMAINS.map((domain) => ({
    domain,
    tier: "tier_1",
    autoTier: 1,
    trustScore: 1,
    isActive: true,
    lastReviewedAt: "2026-05-26T00:00:00.000Z",
    effectiveUntil: null,
    entityType: null,
    region: "hcmc",
    criteriaMet: emptyCriteria(),
    serviceTypes: [],
  }));
}

function findRegistryMatch(
  domain: string,
  rows: readonly SourceTrustRegistryEntry[],
  now: Date,
): SourceTrustRegistryEntry | null {
  const activeRows = rows.filter((row) =>
    row.isActive &&
    (!row.effectiveUntil || Date.parse(row.effectiveUntil) > now.getTime())
  );
  return activeRows.find((row) => domain === row.domain) ??
    activeRows.find((row) => domain.endsWith(`.${row.domain}`)) ??
    null;
}

function domainFromCitation(value: string): string | null {
  try {
    const parsed = new URL(value);
    return normalizeDomain(parsed.hostname);
  } catch {
    return null;
  }
}

export function normalizeSourceTrustDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let domain = value.trim().toLowerCase();
  if (!domain) return null;
  try {
    if (domain.includes("://")) {
      domain = new URL(domain).hostname;
    }
  } catch {
    return null;
  }
  domain = domain
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/\.$/, "");
  return /^[a-z0-9.-]+$/.test(domain) ? domain : null;
}

function normalizeDomain(value: unknown): string | null {
  return normalizeSourceTrustDomain(value);
}

function normalizeTier(value: unknown): SourceTrustTier | null {
  if (
    value === "tier_1" ||
    value === "tier_2" ||
    value === "tier_3" ||
    value === "blocked"
  ) {
    return value;
  }
  if (value === 1) return "tier_1";
  if (value === 2) return "tier_2";
  if (value === 3) return "tier_3";
  return null;
}

function normalizeAutoTier(
  value: unknown,
  legacyTier: SourceTrustTier,
): SourceTrustAutoTier | null {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return value;
  }
  if (legacyTier === "tier_1") return 1;
  if (legacyTier === "tier_2") return 2;
  if (legacyTier === "tier_3") return 3;
  return 5;
}

function normalizeCriteriaMet(value: unknown): SourceTrustCriteria {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return emptyCriteria();
  }
  const criteria = value as Record<string, unknown>;
  return {
    A: criteria.A === true,
    B: criteria.B === true,
    C: criteria.C === true,
    D: criteria.D === true,
    E: criteria.E === true,
    F: criteria.F === true,
    G: criteria.G === true,
  };
}

function emptyCriteria(): SourceTrustCriteria {
  return { A: false, B: false, C: false, D: false, E: false, F: false, G: false };
}

function blockedTrustScore(
  requestedDomain: string,
  source: "db" | "fallback",
): SourceTrustLookupResult {
  return {
    requestedDomain,
    matchedDomain: null,
    tier: "blocked",
    trustScore: 0,
    effectiveTrustScore: 0,
    isActive: false,
    source,
  };
}

function asSourceTrustClient(value: unknown): SourceTrustClient | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const maybe = value as { from?: unknown };
  return typeof maybe.from === "function"
    ? value as SourceTrustClient
    : undefined;
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function roundTrustScore(value: number): number {
  return Math.round(clampScore(value) * 10_000) / 10_000;
}

function readRuntimeEnv(name: string): string | undefined {
  const deno = (globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno;
  return deno?.env?.get?.(name);
}
