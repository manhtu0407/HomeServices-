import type { DbClient } from "../../platform/db.ts";

export async function loadDirectWorkerPaymentAvailability(
  _client: DbClient,
  _jobId: string,
  _customerId: string,
): Promise<false> {
  return false;
}
