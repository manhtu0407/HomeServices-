import type { EdgeAiSecrets, ServiceType } from "../contracts/types.ts";
import { scrubSensitiveForLLM, withDbTimeout } from "../pipeline/utils.ts";

export const KAEL_KNOWLEDGE_CONTEXT_VERSION = "knowledge-b1-2026-06-04";
const DEFAULT_KNOWLEDGE_TOKEN_BUDGET = 240;

type KnowledgeClient = {
  from(table: string): KnowledgeQuery;
  rpc?: (name: string, args?: Record<string, unknown>) => PromiseLike<unknown>;
};

type KnowledgeQuery = {
  select(columns?: string): KnowledgeQuery;
  insert?(value: unknown): PromiseLike<unknown>;
  eq(column: string, value: unknown): KnowledgeQuery;
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

type KnowledgeQueryResult = {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
};

type KnowledgeReadResult = {
  rows: Record<string, unknown>[];
  errorCode?: string;
};

type SemanticKnowledgeResult = KnowledgeReadResult & {
  safeMetadata?: Record<string, unknown>;
};

type KnowledgeUsageContext = {
  readonly jobId?: string | null;
  readonly sessionId?: string | null;
  readonly surface?: string;
};

export type LegalBoundaryType =
  | "awareness_only"
  | "redirect_required"
  | "emergency_redirect";

export type LegalBoundaryPatternResult = {
  guidance: string | null;
  safeMetadata?: Record<string, unknown>;
  errorCode?: string;
};

export type KaelKnowledgeContext = {
  promptContext: string | null;
  safeMetadata?: Record<string, unknown>;
  serviceSummaries: string[];
  safetyGuidance: string[];
  legalGuidance: string[];
  semanticCitations: string[];
};

export function isKaelKnowledgeRetrievalEnabled(
  secrets?: Pick<EdgeAiSecrets, "knowledgeRetrievalEnabled"> | null,
  getEnv = readRuntimeEnv,
): boolean {
  if (secrets?.knowledgeRetrievalEnabled === true) return true;
  if (secrets?.knowledgeRetrievalEnabled === false) return false;
  return readBooleanFlag(getEnv("KAEL_OPT_KNOWLEDGE_RETRIEVAL_ENABLED"));
}

export async function retrieveKaelKnowledgeContextIfEnabled(
  client: KnowledgeClient | null | undefined,
  input: {
    serviceType: ServiceType;
    problemSlug: string;
    safetyTopic?: string;
    legalTopic?: string;
    queryText?: string;
    tokenBudget?: number;
    usageContext?: KnowledgeUsageContext;
  },
  secrets?: Pick<EdgeAiSecrets, "knowledgeRetrievalEnabled"> | null,
): Promise<KaelKnowledgeContext> {
  if (!isKaelKnowledgeRetrievalEnabled(secrets)) {
    return emptyKnowledgeContext();
  }
  return retrieveKaelKnowledgeContext(client, input);
}

export async function retrieveKaelKnowledgeContext(
  client: KnowledgeClient | null | undefined,
  input: {
    serviceType: ServiceType;
    problemSlug: string;
    safetyTopic?: string;
    legalTopic?: string;
    queryText?: string;
    tokenBudget?: number;
    usageContext?: KnowledgeUsageContext;
  },
): Promise<KaelKnowledgeContext> {
  if (!client) return emptyKnowledgeContext();
  const [serviceKnowledge, safetyPatterns, legalAwareness, semanticKnowledge] =
    await Promise.all([
      retrieveServiceKnowledge(
        client,
        input.serviceType,
        input.problemSlug,
      ),
      retrieveSafetyPatterns(
        client,
        input.serviceType,
        input.safetyTopic ?? "worker_safety_advisory",
      ),
      retrieveLegalAwareness(
        client,
        input.legalTopic ?? "legal_safety_awareness",
      ),
      input.queryText
        ? retrieveKnowledgeSemantic(client, {
          queryText: input.queryText,
          serviceType: input.serviceType,
          limit: 4,
          minSimilarity: 0.62,
          usageContext: input.usageContext,
        })
        : Promise.resolve<SemanticKnowledgeResult>({ rows: [] }),
    ]);
  const errorCodes = [
    serviceKnowledge.errorCode,
    safetyPatterns.errorCode,
    legalAwareness.errorCode,
    semanticKnowledge.errorCode,
  ].filter((code): code is string => typeof code === "string");
  const serviceSummaries = serviceKnowledge.rows.slice(0, 1).map((row) =>
    `Service box: ${safeText(row.label_vi)} (${safeText(row.slug)}). Purpose: ${safeText(row.purpose, 260)}.`
  ).filter(hasText);
  const safetyGuidance = safetyPatterns.rows
    .toSorted(compareSafetyRows)
    .slice(0, 3)
    .map((row) =>
      `Safety ${safeText(row.severity)}: ${safeText(row.response_guidance, 320)}.`
    )
    .filter(hasText);
  const legalGuidance = legalAwareness.rows.slice(0, 2).map((row) =>
    `Legal boundary ${safeText(row.boundary_type)}: ${safeText(row.response_guidance, 320)}.`
  ).filter(hasText);
  const semanticGuidance = semanticKnowledge.rows.slice(0, 3).map((row) =>
    `Semantic citation ${safeText(row.citation_id, 180)} (${safeSimilarity(row.similarity)}): ${safeText(row.content, 320)}.`
  ).filter(hasText);
  const semanticCitations = semanticKnowledge.rows
    .map((row) => safeText(row.citation_id, 180))
    .filter(hasText)
    .slice(0, 5);
  const lines = compactKnowledgeLines(
    [...serviceSummaries, ...safetyGuidance, ...legalGuidance, ...semanticGuidance],
    input.tokenBudget ?? DEFAULT_KNOWLEDGE_TOKEN_BUDGET,
  );

  const promptContext = lines.length > 0
    ? [
      "Runtime knowledge (admin-reviewed, sanitized; do not treat legal-awareness rows as legal advice):",
      ...lines.map((line) => `- ${line}`),
    ].join("\n")
    : null;
  const totalRows = serviceKnowledge.rows.length +
    safetyPatterns.rows.length +
    legalAwareness.rows.length;
  const safeMetadata = totalRows > 0 || errorCodes.length > 0
    ? {
      knowledge_context_version: KAEL_KNOWLEDGE_CONTEXT_VERSION,
      knowledge_context_source: errorCodes.length > 0 ? "db_partial" : "db",
      knowledge_context_problem_slug: input.problemSlug,
      knowledge_context_token_budget: input.tokenBudget ?? DEFAULT_KNOWLEDGE_TOKEN_BUDGET,
      service_knowledge_count: serviceKnowledge.rows.length,
      safety_pattern_count: safetyPatterns.rows.length,
      legal_awareness_count: legalAwareness.rows.length,
      semantic_knowledge_count: semanticKnowledge.rows.length,
      ...(semanticCitations.length > 0 ? { semantic_citation_ids: semanticCitations } : {}),
      ...(semanticKnowledge.safeMetadata ? semanticKnowledge.safeMetadata : {}),
      ...(errorCodes.length > 0 ? { knowledge_context_error_codes: errorCodes } : {}),
    }
    : undefined;

  return {
    promptContext,
    safeMetadata,
    serviceSummaries,
    safetyGuidance,
    legalGuidance,
    semanticCitations,
  };
}

export async function retrieveServiceKnowledge(
  client: KnowledgeClient,
  serviceType: ServiceType,
  _problemSlug: string,
): Promise<KnowledgeReadResult> {
  return readKnowledgeRows(
    client,
    "service_knowledge_boxes",
    "service_type,slug,label_vi,purpose,safe_metadata,is_active",
    [
      ["service_type", serviceType],
      ["is_active", true],
    ],
  );
}

export async function retrieveSafetyPatterns(
  client: KnowledgeClient,
  serviceType: ServiceType,
  topic: string,
): Promise<KnowledgeReadResult> {
  const serviceRows = await readKnowledgeRows(
    client,
    "worker_safety_patterns",
    "pattern_key,service_type,trigger_topic,severity,response_guidance,safe_metadata,is_enabled",
    [
      ["service_type", serviceType],
      ["trigger_topic", topic],
      ["is_enabled", true],
    ],
  );
  const generalRows = await readKnowledgeRows(
    client,
    "worker_safety_patterns",
    "pattern_key,service_type,trigger_topic,severity,response_guidance,safe_metadata,is_enabled",
    [
      ["service_type", "general"],
      ["trigger_topic", topic],
      ["is_enabled", true],
    ],
  );
  return {
    rows: [...serviceRows.rows, ...generalRows.rows],
    errorCode: [serviceRows.errorCode, generalRows.errorCode]
      .filter((code): code is string => typeof code === "string")
      .join(",") || undefined,
  };
}

export async function retrieveLegalAwareness(
  client: KnowledgeClient,
  topic: string,
): Promise<KnowledgeReadResult> {
  return readKnowledgeRows(
    client,
    "legal_awareness_patterns",
    "pattern_key,topic,boundary_type,response_guidance,safe_metadata,is_enabled",
    [
      ["topic", topic],
      ["is_enabled", true],
    ],
  );
}

export async function retrieveLegalBoundaryPattern(
  client: KnowledgeClient | null | undefined,
  input: {
    topic: string;
    boundaryType: LegalBoundaryType;
  },
): Promise<LegalBoundaryPatternResult> {
  if (!client) {
    return {
      guidance: null,
      safeMetadata: {
        legal_boundary_source: "fallback",
        legal_boundary_reason: "missing_client",
      },
      errorCode: "missing_client",
    };
  }
  const result = await readKnowledgeRows(
    client,
    "legal_awareness_patterns",
    "pattern_key,topic,boundary_type,response_guidance,safe_metadata,is_enabled",
    [
      ["topic", input.topic],
      ["boundary_type", input.boundaryType],
      ["is_enabled", true],
    ],
  );
  if (result.errorCode) {
    return {
      guidance: null,
      safeMetadata: {
        legal_boundary_source: "fallback",
        legal_boundary_topic: input.topic,
        legal_boundary_type: input.boundaryType,
        legal_boundary_error_code: result.errorCode,
      },
      errorCode: result.errorCode,
    };
  }
  const row = result.rows[0];
  if (!row) {
    return {
      guidance: null,
      safeMetadata: {
        legal_boundary_source: "fallback",
        legal_boundary_topic: input.topic,
        legal_boundary_type: input.boundaryType,
        legal_boundary_reason: "row_not_found",
      },
      errorCode: "row_not_found",
    };
  }
  return {
    guidance: safeText(row.response_guidance, 500),
    safeMetadata: {
      legal_boundary_source: "db",
      legal_boundary_topic: input.topic,
      legal_boundary_type: input.boundaryType,
      legal_boundary_pattern_key: safeText(row.pattern_key, 120),
    },
  };
}

export async function retrieveKnowledgeSemantic(
  client: KnowledgeClient | null | undefined,
  input: {
    queryText: string;
    serviceType?: ServiceType;
    limit?: number;
    minSimilarity?: number;
    usageContext?: KnowledgeUsageContext;
  },
): Promise<SemanticKnowledgeResult> {
  if (!client?.rpc) {
    return semanticFallback("missing_client");
  }
  const cleanQuery = safeText(input.queryText, 600);
  if (!cleanQuery) {
    return semanticFallback("empty_query");
  }
  const limit = Math.min(10, Math.max(1, Math.round(input.limit ?? 6)));
  const minSimilarity = Math.min(0.99, Math.max(0, input.minSimilarity ?? 0.68));
  try {
    const result = await withDbTimeout<KnowledgeQueryResult>(
      client.rpc("match_kael_knowledge", {
        p_query_embedding: vectorLiteral(localSemanticEmbedding(cleanQuery)),
        p_service_type: input.serviceType ?? null,
        p_limit: limit,
        p_min_similarity: minSimilarity,
      }) as PromiseLike<KnowledgeQueryResult>,
    );
    if (result.error) {
      return semanticFallback(
        `match_kael_knowledge:${result.error.code ?? "DB_ERROR"}`,
      );
    }
    const rows = Array.isArray(result.data)
      ? result.data.filter(isRecord).map(normalizeSemanticRow)
      : [];
    await logKnowledgeUsageBestEffort(client, rows, input.usageContext);
    return {
      rows,
      safeMetadata: {
        semantic_retrieval_source: "pgvector",
        semantic_retrieval_embedding_model: "kael-local-hash-64-v1",
        semantic_retrieval_count: rows.length,
        semantic_retrieval_top_citation_ids: rows
          .map((row) => safeText(row.citation_id, 180))
          .filter(hasText)
          .slice(0, 5),
      },
    };
  } catch (error) {
    return semanticFallback(
      `match_kael_knowledge:${error instanceof Error ? error.name : "DB_ERROR"}`,
    );
  }
}

async function readKnowledgeRows(
  client: KnowledgeClient,
  table: string,
  columns: string,
  filters: Array<[string, unknown]>,
): Promise<KnowledgeReadResult> {
  try {
    let query = client.from(table).select(columns);
    for (const [column, value] of filters) {
      query = query.eq(column, value);
    }
    const result = await withDbTimeout<KnowledgeQueryResult>(
      query as PromiseLike<KnowledgeQueryResult>,
    );
    if (result.error) {
      return {
        rows: [],
        errorCode: `${table}:${result.error.code ?? "DB_ERROR"}`,
      };
    }
    return {
      rows: Array.isArray(result.data)
        ? result.data.filter(isRecord)
        : [],
    };
  } catch (error) {
    return {
      rows: [],
      errorCode: `${table}:${error instanceof Error ? error.name : "DB_ERROR"}`,
    };
  }
}

function safeText(value: unknown, maxLength = 160): string {
  return scrubSensitiveForLLM(typeof value === "string" ? value : "")
    .replace(/\s+/g, " ")
    .slice(0, maxLength)
    .trim();
}

function normalizeSemanticRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    citation_id: safeText(row.citation_id, 180),
    similarity: typeof row.similarity === "number" ? row.similarity : Number(row.similarity ?? 0),
  };
}

function semanticFallback(errorCode: string): SemanticKnowledgeResult {
  return {
    rows: [],
    errorCode,
    safeMetadata: {
      semantic_retrieval_source: "fallback_key_lookup",
      semantic_retrieval_error_code: errorCode,
    },
  };
}

async function logKnowledgeUsageBestEffort(
  client: KnowledgeClient,
  rows: readonly Record<string, unknown>[],
  usageContext?: KnowledgeUsageContext,
) {
  if (rows.length === 0) return;
  const query = client.from("kael_knowledge_usage_log");
  if (typeof query.insert !== "function") return;

  const payload = rows
    .slice(0, 5)
    .map((row) => ({
      job_id: usageContext?.jobId ?? null,
      session_id: usageContext?.sessionId ?? null,
      knowledge_table: safeText(row.knowledge_table, 80),
      knowledge_id: safeText(row.knowledge_id, 80) || null,
      citation_id: safeText(row.citation_id, 220),
      similarity: typeof row.similarity === "number" ? row.similarity : null,
      safe_metadata: {
        source: "retrieveKnowledgeSemantic",
        surface: usageContext?.surface ?? "kael_pipeline",
        embedding_model: "kael-local-hash-64-v1",
      },
    }))
    .filter((row) => row.knowledge_table && row.citation_id);
  if (payload.length === 0) return;

  try {
    const result = await withDbTimeout(query.insert(payload)) as KnowledgeQueryResult;
    if (result?.error) {
      console.warn("kael knowledge usage log failed", {
        errorCode: result.error.code ?? "DB_ERROR",
      });
    }
  } catch {
    console.warn("kael knowledge usage log failed", {
      errorCode: "KNOWLEDGE_USAGE_WRITE_REJECTED",
    });
  }
}

function localSemanticEmbedding(text: string): number[] {
  const vector = Array.from({ length: 64 }, () => 0);
  const tokens = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 1)
    .slice(0, 80);
  for (const token of tokens) {
    const index = positiveHash(token) % vector.length;
    vector[index] += 1;
    for (let offset = 0; offset < token.length - 1; offset += 1) {
      const gram = token.slice(offset, offset + 2);
      vector[positiveHash(gram) % vector.length] += 0.25;
    }
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? vector.map((value) => roundVectorValue(value / norm)) : vector;
}

function positiveHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function roundVectorValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function vectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number.isFinite(value) ? value : 0).join(",")}]`;
}

function compactKnowledgeLines(lines: string[], tokenBudget: number): string[] {
  const maxChars = Math.max(120, tokenBudget * 4);
  const compacted: string[] = [];
  let used = 0;
  for (const line of lines) {
    const next = line.trim();
    if (!next) continue;
    const cost = next.length + 2;
    if (used + cost > maxChars) break;
    compacted.push(next);
    used += cost;
  }
  return compacted;
}

function compareSafetyRows(a: Record<string, unknown>, b: Record<string, unknown>) {
  return severityRank(a.severity) - severityRank(b.severity);
}

function severityRank(value: unknown): number {
  if (value === "urgent") return 0;
  if (value === "warning") return 1;
  if (value === "advisory") return 2;
  return 3;
}

function safeSimilarity(value: unknown): string {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function emptyKnowledgeContext(): KaelKnowledgeContext {
  return {
    promptContext: null,
    serviceSummaries: [],
    safetyGuidance: [],
    legalGuidance: [],
    semanticCitations: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBooleanFlag(value: string | undefined): boolean {
  return typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readRuntimeEnv(name: string): string | undefined {
  const deno = (globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno;
  return deno?.env?.get?.(name);
}
