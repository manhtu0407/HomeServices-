// Canonical projection for durable worker-recipient delivery receipts.

import {
  matchingDeliveryReceiptSchema,
  type EdgeMatchingDeliveryReceipt,
} from "../../../../_shared/contracts/stage1-reliability.ts";

export const BROADCAST_DELIVERY_TTL_MS = 5 * 60 * 1_000;

export function projectMatchingDelivery(
  row: Record<string, unknown>,
  now = new Date(),
): EdgeMatchingDeliveryReceipt {
  const parsed = matchingDeliveryReceiptSchema.safeParse({
    delivery_id: row.id,
    broadcast_id: row.broadcast_id,
    job_id: row.job_id,
    operation_id: row.operation_id,
    state: row.status,
    expires_at: row.expires_at,
    delivered_at: row.delivered_at ?? null,
    seen_at: row.seen_at ?? null,
    accepted_at: row.accepted_at ?? null,
    server_time: now.toISOString(),
  });
  if (!parsed.success) throw new Error("MATCHING_DELIVERY_INVALID");
  return parsed.data;
}
