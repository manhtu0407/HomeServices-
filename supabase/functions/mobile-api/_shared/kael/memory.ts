import { sanitizeMemoryObject, sanitizeMemoryText } from "./memory-sanitizer.ts";

type DbResult<T> = { data: T | null; error: { code?: string; message?: string } | null };
type Chain = {
  select(columns?: string, options?: unknown): Chain;
  insert(value: unknown): Chain;
  eq(column: string, value: unknown): Chain;
  order(column: string, options?: unknown): Chain;
  limit(count: number): Chain;
  maybeSingle(): Chain;
  then<TResult1 = DbResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};
type DbClient = { from(table: import("../db-types.ts").PublicTableName): Chain };

export type MemoryLayerName = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
export type MemoryActor = "customer" | "worker" | "system";
export type MemoryStaleness = "fresh" | "stale" | "archive";

export type MemoryLayer = {
  layer: MemoryLayerName;
  included: boolean;
  token_budget: number;
  token_count: number;
  stale: MemoryStaleness;
  data: unknown;
  facts: Record<string, unknown>;
};

export type MemoryContext = {
  layers: Record<MemoryLayerName, MemoryLayer>;
  total_tokens: number;
  resolved_facts: Record<string, unknown>;
};

type ContextInput = {
  actor: MemoryActor;
  actorId: string;
  jobId?: string;
  maxTotalTokens?: number;
};

const DEFAULT_BUDGETS: Record<MemoryLayerName, number> = {
  L1: 250,
  L2: 500,
  L3: 500,
  L4: 500,
  L5: 500,
  L6: 300,
};

export class KaelMemory {
  private readonly scratchpad: Record<string, unknown> = {};
  private readonly now: Date;
  private readonly maxTotalTokens: number;

  constructor(
    private readonly client: DbClient,
    options: { now?: Date; maxTotalTokens?: number } = {},
  ) {
    this.now = options.now ?? new Date();
    this.maxTotalTokens = options.maxTotalTokens ?? 1500;
  }

  setShortTerm(key: string, value: unknown) {
    this.scratchpad[key] = sanitizeMemoryObject(value);
  }

  async getContext(input: ContextInput): Promise<MemoryContext> {
    const [
      job,
      customer,
      worker,
      domain,
      conversation,
    ] = await Promise.all([
      this.fetchJobMemory(input.jobId),
      input.actor === "customer" || input.actor === "system"
        ? this.fetchCustomerMemory(input.actorId)
        : Promise.resolve(disabledLayer("L3")),
      input.actor === "worker" || input.actor === "system"
        ? this.fetchWorkerMemory(input.actorId)
        : Promise.resolve(disabledLayer("L4")),
      this.fetchDomainMemory(),
      this.fetchConversationMemory(input.jobId),
    ]);

    const l1 = constrainLayer({
      layer: "L1",
      included: true,
      token_budget: DEFAULT_BUDGETS.L1,
      token_count: 0,
      stale: "fresh",
      data: sanitizeMemoryObject(this.scratchpad),
      facts: { ...this.scratchpad },
    });
    const layers: Record<MemoryLayerName, MemoryLayer> = {
      L1: l1,
      L2: job,
      L3: customer,
      L4: worker,
      L5: domain,
      L6: conversation,
    };
    const total = Object.values(layers).reduce((sum, layer) => sum + layer.token_count, 0);
    if (total > (input.maxTotalTokens ?? this.maxTotalTokens)) {
      layers.L6 = constrainLayer({ ...layers.L6, data: null, facts: {}, included: false, token_count: 0 });
    }
    return {
      layers,
      total_tokens: Object.values(layers).reduce((sum, layer) => sum + layer.token_count, 0),
      resolved_facts: resolveMemoryFacts(Object.values(layers)),
    };
  }

  private async fetchJobMemory(jobId?: string): Promise<MemoryLayer> {
    if (!jobId) return disabledLayer("L2");
    const result = await query<Record<string, unknown>>(
      this.client
        .from("jobs")
        .select("id, customer_id, worker_id, kael_problem_identified, kael_estimate_card_v3, kael_worker_brief_core, kael_worker_brief_guidance")
        .eq("id", jobId)
        .maybeSingle(),
    );
    const data = sanitizeMemoryObject(result.data ?? {});
    return constrainLayer({
      layer: "L2",
      included: !!result.data && !result.error,
      token_budget: DEFAULT_BUDGETS.L2,
      token_count: 0,
      stale: "fresh",
      data,
      facts: extractFacts(data),
    });
  }

  private async fetchCustomerMemory(customerId: string): Promise<MemoryLayer> {
    const result = await query<Record<string, unknown>>(
      this.client
        .from("customer_kael_memory")
        .select("customer_id, preference_summary, service_preferences, trust_signals, last_observed_at, memory_version")
        .eq("customer_id", customerId)
        .maybeSingle(),
    );
    await this.audit("customer", customerId, "read", "L3", "memory_context");
    const data = sanitizeMemoryObject(result.data ?? {});
    return constrainLayer({
      layer: "L3",
      included: !!result.data && !result.error,
      token_budget: DEFAULT_BUDGETS.L3,
      token_count: 0,
      stale: classifyMemoryStaleness(nullableString(data.last_observed_at), this.now),
      data,
      facts: extractFacts(data),
    });
  }

  private async fetchWorkerMemory(workerId: string): Promise<MemoryLayer> {
    const result = await query<Record<string, unknown>>(
      this.client
        .from("worker_kael_memory")
        .select("worker_id, service_skill_summary, service_skill_proficiency, reliability_signals, red_flags, last_observed_at, memory_version")
        .eq("worker_id", workerId)
        .maybeSingle(),
    );
    await this.audit("worker", workerId, "read", "L4", "memory_context");
    const data = sanitizeMemoryObject(result.data ?? {});
    return constrainLayer({
      layer: "L4",
      included: !!result.data && !result.error,
      token_budget: DEFAULT_BUDGETS.L4,
      token_count: 0,
      stale: classifyMemoryStaleness(nullableString(data.last_observed_at), this.now),
      data,
      facts: extractFacts(data),
    });
  }

  private async fetchDomainMemory(): Promise<MemoryLayer> {
    const result = await query<Array<Record<string, unknown>>>(
      this.client
        .from("learning_rules")
        .select("id, rule_type, rule_payload, status")
        .eq("status", "active")
        .limit(5),
    );
    await this.audit("domain", null, "read", "L5", "memory_context");
    const data = sanitizeMemoryObject(result.data ?? []);
    return constrainLayer({
      layer: "L5",
      included: !result.error,
      token_budget: DEFAULT_BUDGETS.L5,
      token_count: 0,
      stale: "fresh",
      data,
      facts: extractFacts(data),
    });
  }

  private async fetchConversationMemory(jobId?: string): Promise<MemoryLayer> {
    if (!jobId) return disabledLayer("L6");
    const result = await query<Array<Record<string, unknown>>>(
      this.client
        .from("chat_messages")
        .select("sender_role, content, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(10),
    );
    const data = sanitizeMemoryObject(result.data ?? []);
    return constrainLayer({
      layer: "L6",
      included: !result.error,
      token_budget: DEFAULT_BUDGETS.L6,
      token_count: 0,
      stale: "fresh",
      data,
      facts: {},
    });
  }

  private async audit(
    subjectType: "customer" | "worker" | "domain",
    subjectId: string | null,
    operation: "read" | "write" | "delete" | "archive",
    layer: MemoryLayerName,
    purpose: string,
  ) {
    await this.client.from("kael_memory_audit").insert({
      subject_type: subjectType,
      subject_id: subjectId,
      actor_id: subjectId,
      operation,
      layer,
      purpose,
      safe_metadata: {},
    });
  }
}

export function resolveMemoryFacts(layers: Array<{ layer: MemoryLayerName; facts: Record<string, unknown> }>) {
  const priority: Record<MemoryLayerName, number> = { L1: 1, L2: 4, L3: 3, L4: 3, L5: 5, L6: 0 };
  return layers
    .toSorted((a, b) => priority[a.layer] - priority[b.layer])
    .reduce<Record<string, unknown>>((facts, layer) => ({ ...facts, ...layer.facts }), {});
}

export function classifyMemoryStaleness(value?: string | null, now = new Date()): MemoryStaleness {
  if (!value) return "fresh";
  const observed = Date.parse(value);
  if (!Number.isFinite(observed)) return "fresh";
  const days = (now.getTime() - observed) / 86_400_000;
  if (days > 365) return "archive";
  if (days > 90) return "stale";
  return "fresh";
}

function constrainLayer(layer: MemoryLayer): MemoryLayer {
  const tokenCount = estimateTokens(layer.data);
  if (tokenCount <= layer.token_budget) return { ...layer, token_count: tokenCount };
  const maxChars = layer.token_budget * 4;
  const compact = sanitizeMemoryText(JSON.stringify(layer.data), maxChars);
  return {
    ...layer,
    data: compact,
    token_count: estimateTokens(compact),
  };
}

function disabledLayer(layer: MemoryLayerName): MemoryLayer {
  return {
    layer,
    included: false,
    token_budget: DEFAULT_BUDGETS[layer],
    token_count: 0,
    stale: "fresh",
    data: null,
    facts: {},
  };
}

function extractFacts(value: unknown): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  if (Array.isArray(value)) {
    for (const item of value) Object.assign(facts, extractFacts(item));
    return facts;
  }
  if (!value || typeof value !== "object") return facts;
  const record = value as Record<string, unknown>;
  for (const key of ["service_preference", "preferred_service_type", "advice"]) {
    if (record[key] !== undefined) facts[key] = record[key];
  }
  if (record.rule_payload) Object.assign(facts, extractFacts(record.rule_payload));
  if (record.service_preferences) Object.assign(facts, extractFacts(record.service_preferences));
  return facts;
}

function estimateTokens(value: unknown) {
  return Math.ceil(JSON.stringify(value ?? "").length / 4);
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function query<T>(chain: Chain): Promise<DbResult<T>> {
  return await Promise.resolve(chain) as DbResult<T>;
}
