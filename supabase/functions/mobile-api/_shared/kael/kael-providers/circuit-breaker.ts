import type { AIProvider, KaelPurpose } from "../types.ts";

export type CircuitFailure = {
  readonly purpose: KaelPurpose;
  readonly provider: AIProvider;
  readonly errorCode: string;
  readonly kind?: FailureKind | null;
  readonly now?: Date;
};

export type FailureKind = "credit" | "rate_limit" | "server" | "timeout" | "schema";

type FailureRule = {
  readonly kind: FailureKind;
  readonly threshold: number;
  readonly windowMs: number;
  readonly openMs: number;
};

type CircuitBucket = {
  openUntil?: number;
  failures: Array<{ at: number; kind: FailureKind }>;
};

const MINUTE = 60_000;

const FAILURE_RULES: Record<FailureKind, FailureRule> = {
  credit: { kind: "credit", threshold: 1, windowMs: MINUTE, openMs: 60 * MINUTE },
  rate_limit: { kind: "rate_limit", threshold: 3, windowMs: MINUTE, openMs: 5 * MINUTE },
  server: { kind: "server", threshold: 5, windowMs: 5 * MINUTE, openMs: 5 * MINUTE },
  timeout: { kind: "timeout", threshold: 5, windowMs: 5 * MINUTE, openMs: 5 * MINUTE },
  schema: { kind: "schema", threshold: 3, windowMs: 10 * MINUTE, openMs: 10 * MINUTE },
};

export type KaelCircuitBreaker = ReturnType<typeof createKaelCircuitBreaker>;

export function createKaelCircuitBreaker() {
  const buckets = new Map<string, CircuitBucket>();

  return {
    isOpen(purpose: KaelPurpose, provider: AIProvider, now = new Date()): boolean {
      const bucket = buckets.get(circuitKey(purpose, provider));
      if (!bucket?.openUntil) return false;
      if (bucket.openUntil <= now.getTime()) {
        bucket.openUntil = undefined;
        bucket.failures = [];
        return false;
      }
      return true;
    },

    recordSuccess(purpose: KaelPurpose, provider: AIProvider): void {
      buckets.delete(circuitKey(purpose, provider));
    },

    recordFailure(failure: CircuitFailure): void {
      const kind = failure.kind ?? failureKindForCode(failure.errorCode);
      if (!kind) return;
      const rule = FAILURE_RULES[kind];
      const nowMs = (failure.now ?? new Date()).getTime();
      const key = circuitKey(failure.purpose, failure.provider);
      const bucket = buckets.get(key) ?? { failures: [] };
      bucket.failures = bucket.failures
        .filter((entry) => nowMs - entry.at <= rule.windowMs)
        .concat({ at: nowMs, kind });

      const matchingFailures = bucket.failures.filter((entry) => entry.kind === kind);
      if (matchingFailures.length >= rule.threshold) {
        bucket.openUntil = nowMs + rule.openMs;
      }
      buckets.set(key, bucket);
    },

    reset(): void {
      buckets.clear();
    },
  };
}

export const KAEL_CIRCUIT_BREAKER = createKaelCircuitBreaker();

function circuitKey(purpose: KaelPurpose, provider: AIProvider): string {
  return `${purpose}:${provider}`;
}

export function failureKindForCode(errorCode: string): FailureKind | null {
  if (errorCode === "HTTP_402") return "credit";
  if (errorCode === "HTTP_429") return "rate_limit";
  if (/^HTTP_5\d\d$/.test(errorCode)) return "server";
  if (/TIMEOUT|ABORT/i.test(errorCode)) return "timeout";
  if (/SCHEMA|VALIDATION|INVALID_JSON/i.test(errorCode)) return "schema";
  return null;
}
