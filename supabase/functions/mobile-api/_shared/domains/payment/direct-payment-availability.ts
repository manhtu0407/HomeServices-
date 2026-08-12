import { dbQuery, type DbClient } from "../../platform/db.ts";

export async function loadDirectWorkerPaymentAvailability(
  client: DbClient,
  jobId: string,
  customerId: string,
): Promise<boolean | null> {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("get_direct_worker_payment_availability", {
      p_customer_id: customerId,
      p_job_id: jobId,
    }),
  );
  const available = result.data?.[0]?.direct_payment_available;
  if (result.error || typeof available !== "boolean") {
    console.warn("mobile-api direct payment availability projection failed", { jobId });
    return null;
  }
  return available;
}
