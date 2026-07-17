import type { KaelPurpose } from "../types.ts";
import type { KaelSemanticGuardClassifier } from "../guards/self-check.ts";
import { guardOutput } from "../guards/output-gateway.ts";
import type { KaelPromptActor, KaelPromptLanguage } from "../charter/system-prompt.ts";

export type KaelOrchestratorStage<T> = {
  readonly label: string;
  readonly purpose: KaelPurpose;
  readonly timeoutMs: number;
  readonly permission?: {
    readonly check: () => Promise<KaelStagePermissionDecision> | KaelStagePermissionDecision;
  };
  readonly run: () => Promise<T>;
  readonly fallback?: () => T | Promise<T>;
  readonly selfCheck?: {
    readonly actor: KaelPromptActor;
    readonly language?: KaelPromptLanguage;
    readonly fallbackText: string;
    readonly semanticGuardEnabled?: boolean;
    readonly semanticClassifier?: KaelSemanticGuardClassifier;
  };
};

export type KaelStagePermissionDecision = {
  readonly allowed: boolean;
  readonly reasonCode: string;
  readonly declineTemplateKey?: string;
  readonly responseText?: string;
  readonly retryAfterMs?: number;
};

export type KaelStageStatus = "ok" | "declined" | "degraded" | "failed";

export type KaelStageRunResult<T> = {
  readonly label: string;
  readonly purpose: KaelPurpose;
  readonly status: KaelStageStatus;
  readonly value?: T;
  readonly elapsedMs: number;
  readonly fallbackUsed: boolean;
  readonly failureReason?: string;
};

export type KaelParallelResult<T> = {
  readonly elapsedMs: number;
  readonly results: Array<KaelStageRunResult<T>>;
};

export async function runKaelPurposeStage<T>(
  stage: KaelOrchestratorStage<T>,
): Promise<KaelStageRunResult<T>> {
  const started = Date.now();
  try {
    const permission = stage.permission ? await stage.permission.check() : null;
    if (permission && !permission.allowed) {
      return {
        label: stage.label,
        purpose: stage.purpose,
        status: "declined",
        value: {
          declined: true,
          decline_template_key: permission.declineTemplateKey,
          text: permission.responseText,
          retry_after_ms: permission.retryAfterMs ?? 0,
        } as T,
        elapsedMs: Date.now() - started,
        fallbackUsed: true,
        failureReason: permission.reasonCode,
      };
    }
    // Clear the timeout when the race settles. The provider
    // call already self-aborts at its budget (AbortController, maxRetries:0), so
    // this race is a belt; leaving its setTimeout pending after stage.run() wins
    // would keep a dangling timer and later reject a promise nobody awaits.
    const timeout = createStageTimeout(stage.timeoutMs);
    const value = await Promise.race([
      stage.run(),
      timeout.promise,
    ]).finally(() => timeout.cancel());
    if (stage.selfCheck && typeof value === "string") {
      const checked = guardOutput({
        text: value,
        actor: stage.selfCheck.actor,
        language: stage.selfCheck.language,
        semanticClassifier: stage.selfCheck.semanticClassifier,
        surface: `orchestrator:${stage.label}`,
        fallbackText: stage.selfCheck.fallbackText,
      });
      if (!checked.allowed) {
        return {
          label: stage.label,
          purpose: stage.purpose,
          status: "degraded",
          value: checked.text as T,
          elapsedMs: Date.now() - started,
          fallbackUsed: true,
          failureReason: checked.reason,
        };
      }
      return {
        label: stage.label,
        purpose: stage.purpose,
        status: "ok",
        value: checked.text as T,
        elapsedMs: Date.now() - started,
        fallbackUsed: false,
      };
    }
    return {
      label: stage.label,
      purpose: stage.purpose,
      status: "ok",
      value,
      elapsedMs: Date.now() - started,
      fallbackUsed: false,
    };
  } catch (error) {
    const failureReason = error instanceof StageTimeoutError
      ? "TIMEOUT"
      : error instanceof Error
      ? error.message
      : "UNKNOWN_ERROR";
    if (stage.fallback) {
      return {
        label: stage.label,
        purpose: stage.purpose,
        status: "degraded",
        value: await stage.fallback(),
        elapsedMs: Date.now() - started,
        fallbackUsed: true,
        failureReason,
      };
    }
    return {
      label: stage.label,
      purpose: stage.purpose,
      status: "failed",
      elapsedMs: Date.now() - started,
      fallbackUsed: false,
      failureReason,
    };
  }
}

export async function runKaelParallel<T>(
  stages: Array<KaelOrchestratorStage<T>>,
): Promise<KaelParallelResult<T>> {
  const started = Date.now();
  const results = await Promise.all(stages.map((stage) => runKaelPurposeStage(stage)));
  return {
    elapsedMs: Date.now() - started,
    results,
  };
}

class StageTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`TIMEOUT:${timeoutMs}`);
  }
}

function createStageTimeout(ms: number): { promise: Promise<never>; cancel: () => void } {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new StageTimeoutError(ms)), ms);
  });
  // cancel() clears the timer once the race settles, so when stage.run() wins
  // the timeout never fires (promise stays pending and is GC'd). When the
  // timeout wins, its rejection is consumed by Promise.race and surfaces as the
  // stage's TIMEOUT failure — never an unhandled rejection.
  return {
    promise,
    cancel: () => {
      if (handle !== undefined) clearTimeout(handle);
    },
  };
}
