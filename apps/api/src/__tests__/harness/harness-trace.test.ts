import { describe, expect, it } from "vitest";
import {
  beginHarnessRun,
  createHarnessTraceContext,
  harnessTraceHeaders,
  hashHarnessIdentifier,
  recordHarnessEvent,
  sanitizeHarnessMetadata,
} from "../../../../../supabase/functions/_shared/harness/trace.ts";

describe("Harness trace lineage", () => {
  it("accepts only UUID request lineage and exposes public-safe headers", () => {
    const request = new Request("https://example.test/jobs", {
      headers: {
        "x-trace-id": "00000000-0000-4000-8000-000000000001",
        "x-run-id": "00000000-0000-4000-8000-000000000002",
        "x-parent-run-id": "not-a-uuid",
      },
    });
    const trace = createHarnessTraceContext({
      request,
      releaseId: "harness-test",
      environment: "preview",
      now: 10,
    });
    expect(trace.traceId).toBe("00000000-0000-4000-8000-000000000001");
    expect(trace.runId).toBe("00000000-0000-4000-8000-000000000002");
    expect(trace.parentRunId).toBeNull();
    expect(Object.fromEntries(harnessTraceHeaders(trace))).toEqual({
      "x-harness-release-id": "harness-test",
      "x-run-id": trace.runId,
      "x-trace-id": trace.traceId,
    });
  });

  it("hashes actor identity and never writes raw PII metadata", async () => {
    const hash = await hashHarnessIdentifier("user@example.test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("user");
    expect(sanitizeHarnessMetadata({
      route_kind: "jobs.get",
      email: "user@example.test",
      phone: "0901234567",
      safe: true,
      nested: { forbidden: true },
    })).toEqual({ route_kind: "jobs.get", safe: true });
  });

  it("drops alternate free-text and precise-location metadata keys", () => {
    expect(sanitizeHarnessMetadata({
      route_kind: "jobs.get",
      message: "raw customer message",
      query: "customer search query",
      title: "private job title",
      name: "Nguyen Van A",
      url: "https://private.example.test/path",
      unit: "A-12.04",
      safe: true,
    })).toEqual({ route_kind: "jobs.get", safe: true });
  });

  it("writes release-bound run and event arguments through the service client", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc(fn: string, args: Record<string, unknown>) {
        calls.push({ fn, args });
        return Promise.resolve({ data: true, error: null });
      },
    };
    const trace = createHarnessTraceContext({
      releaseId: "harness-test",
      environment: "staging",
      client,
      turnId: '00000000-0000-4000-8000-000000000020',
      toolCallId: '00000000-0000-4000-8000-000000000021',
    });
    await beginHarnessRun(trace, {
      actorId: "00000000-0000-4000-8000-000000000010",
      actorRole: "customer",
      routeKind: "jobs.get",
      capability: "mobile.route.jobs.get",
      safeMetadata: { risk: "read" },
    });
    await recordHarnessEvent(trace, {
      eventClass: "authorization.resolved",
      stage: "authorization",
      status: "succeeded",
      safeMetadata: { actor_role: "customer" },
    });
    expect(calls.map((call) => call.fn)).toEqual([
      "begin_harness_run",
      "append_harness_event",
    ]);
    expect(calls[0]?.args).toMatchObject({
      p_release_id: "harness-test",
      p_environment: "staging",
      p_actor_role: "customer",
      p_route_kind: "jobs.get",
    });
    expect(calls[0]?.args.p_actor_id_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[1]?.args).toMatchObject({
      p_turn_id: '00000000-0000-4000-8000-000000000020',
      p_tool_call_id: '00000000-0000-4000-8000-000000000021',
    });
  });
});
