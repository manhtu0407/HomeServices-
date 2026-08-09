import { describe, expect, it } from "vitest";
import {
  createRuntimeKaelSpendGate,
  finalizeAiSpend,
  reserveAiSpend,
} from "../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/spend-gate.ts";

describe("release-bound spend reservations", () => {
  it("uses fail-closed reservations outside a local harness", () => {
    expect(
      createRuntimeKaelSpendGate({ rpc: async () => ({ data: null, error: null }) }, "actor-1", {
        environment: "staging",
      }).failureMode,
    ).toBe("fail-closed");
    expect(
      createRuntimeKaelSpendGate({ rpc: async () => ({ data: null, error: null }) }, "actor-1", {
        environment: "local",
      }).failureMode,
    ).toBe("fail-open");
  });

  it("fails closed when a remote durable reservation cannot be checked", async () => {
    const result = await reserveAiSpend(undefined, {
      actorId: null,
      estimatedCostUsd: 0.01,
      purpose: "intent",
      failureMode: "fail-closed",
    });
    expect(result).toEqual({
      allowed: false,
      scope: "no_rpc_fail_closed",
      reservationId: null,
    });
  });

  it("passes trace, release, and provider-attempt lineage to reserve and finalize", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc(fn: string, args: Record<string, unknown> = {}) {
        calls.push({ fn, args });
        return Promise.resolve({
          data: fn === "reserve_kael_ai_spend"
            ? [{ allowed: true, reservation_id: 42 }]
            : null,
          error: null,
        });
      },
    };
    const lineage = {
      runId: "00000000-0000-4000-8000-000000000021",
      traceId: "00000000-0000-4000-8000-000000000022",
      releaseId: "harness-test",
      providerAttemptId: "00000000-0000-4000-8000-000000000023",
    };
    const reservation = await reserveAiSpend(client, {
      actorId: "00000000-0000-4000-8000-000000000024",
      estimatedCostUsd: 0.02,
      purpose: "market_lookup",
      failureMode: "fail-closed",
      ...lineage,
    });
    await finalizeAiSpend(client, {
      reservationId: reservation.reservationId,
      actorId: "00000000-0000-4000-8000-000000000024",
      purpose: "market_lookup",
      actualUsd: 0.015,
      ...lineage,
    });
    expect(calls[0]?.args).toMatchObject({
      p_harness_run_id: lineage.runId,
      p_harness_trace_id: lineage.traceId,
      p_harness_release_id: lineage.releaseId,
      p_provider_attempt_id: lineage.providerAttemptId,
    });
    expect(calls[1]?.args).toMatchObject({
      p_reservation_id: 42,
      p_harness_run_id: lineage.runId,
    });
  });
});
