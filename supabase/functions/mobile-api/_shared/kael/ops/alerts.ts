import type { AIProvider, KaelPurpose } from "../contracts/types.ts";
import { assertSafeTraceValue } from "../learning/trace.ts";

const ALERT_TIMEOUT_MS = 1_500;
const MAX_ALERT_RESPONSE_BYTES = 64 * 1024;
let missingWebhookLogged = false;

export type KaelOpsAlertInput = {
  readonly code: "kill_switch_block" | "open_circuit_block" | "spend_cap_block" | "model_escalation";
  readonly severity: "info" | "warning" | "critical";
  readonly provider?: AIProvider;
  readonly purpose?: KaelPurpose;
  readonly scope?: string;
  readonly reason?: string;
};

export type KaelOpsAlertPayload = KaelOpsAlertInput & {
  readonly occurred_at: string;
  readonly schema_version: "kael_ops_alert.v1";
};

export function buildKaelOpsAlertPayload(
  input: KaelOpsAlertInput,
  now = new Date(),
): KaelOpsAlertPayload {
  const payload = {
    ...input,
    ...(input.scope ? { scope: safeToken(input.scope, 80) } : {}),
    ...(input.reason ? { reason: safeToken(input.reason, 120) } : {}),
    occurred_at: now.toISOString(),
    schema_version: "kael_ops_alert.v1" as const,
  };
  assertSafeTraceValue(payload, ["kael_ops_alert"]);
  return payload;
}

export async function emitKaelOpsAlert(input: KaelOpsAlertInput): Promise<void> {
  const url = readWebhookUrl();
  if (!url) {
    if (!missingWebhookLogged) {
      missingWebhookLogged = true;
      console.info("Kael ops alert webhook is not configured; alerts are no-op");
    }
    return;
  }

  let payload: KaelOpsAlertPayload;
  try {
    payload = buildKaelOpsAlertPayload(input);
  } catch (error) {
    console.warn("Kael ops alert rejected unsafe payload", {
      errorName: error instanceof Error ? error.name : typeof error,
      code: input.code,
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: controller.signal,
    });
    if (response.body) {
      const reader = response.body.getReader();
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_ALERT_RESPONSE_BYTES) {
          await reader.cancel();
          break;
        }
      }
    }
    if (!response.ok) {
      console.warn("Kael ops alert webhook rejected delivery", { code: input.code, status: response.status });
    }
  } catch (error) {
    console.warn("Kael ops alert delivery failed", {
      code: input.code,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  } finally {
    clearTimeout(timer);
  }
}

function readWebhookUrl(): string | null {
  try {
    const denoGet = (globalThis as {
      Deno?: { env?: { get?: (key: string) => string | undefined } };
    }).Deno?.env?.get;
    const raw = denoGet?.("KAEL_OPS_ALERT_WEBHOOK_URL")?.trim();
    if (!raw) return null;
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      console.warn("Kael ops alert webhook must use HTTPS");
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeToken(value: string, maxLength: number): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replace(/\s+/gu, " ").trim();
  return normalized.slice(0, maxLength);
}
