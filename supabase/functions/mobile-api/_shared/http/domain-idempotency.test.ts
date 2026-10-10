import { domainIdempotencyStrategy } from "./domain-idempotency.ts";

function expectEqual<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("confirmed matching retry owns the client request ID idempotency", () => {
  expectEqual(
    domainIdempotencyStrategy("jobs.confirmSearch"),
    "matching_retry_command_id",
  );
});

Deno.test("unrelated money impacting routes retain harness idempotency", () => {
  expectEqual(domainIdempotencyStrategy("jobs.cancel"), null);
});
