import type { UserRole } from "../../../_shared/domain.ts";

type StagingPaymentRoute = {
  kind: "jobs.paymentIntent" | "jobs.stagingPaymentConfirm";
  method: "POST";
  jobId: string;
  roles: UserRole[];
};

export function matchStagingPaymentRoute(
  action: string,
  method: string,
  jobId: string,
): StagingPaymentRoute | null {
  if (method !== "POST") return null;
  if (action === "payment-intent") {
    return { kind: "jobs.paymentIntent", method: "POST", jobId, roles: ["customer", "admin"] };
  }
  if (action === "staging-payment-confirm") {
    return { kind: "jobs.stagingPaymentConfirm", method: "POST", jobId, roles: ["customer", "admin"] };
  }
  return null;
}
