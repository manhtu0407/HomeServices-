// Read-only checks shared by the gap reply and the RFQ fallback, kept apart from the estimate
// writer so the reply can ask "is a worker quote possible?" without importing it.

import { asRecord } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";

export const EVIDENCE_GAP_QUOTE_READINESS = "validated_price_evidence_unavailable";

export type EvidenceGapPolicyState = {
  readonly rfqAvailable: boolean;
  readonly enrichmentSlots: readonly string[];
};

export async function evidenceGapPolicyState(
  client: DbClient,
  serviceProblemId: string,
): Promise<EvidenceGapPolicyState> {
  const policy = await dbQuery<Record<string, unknown>>(
    client.from("service_intake_policies")
      .select("quote_mode, evidence_requirements, tier_b_slots")
      .eq("service_problem_id", serviceProblemId)
      .eq("status", "active")
      .maybeSingle(),
  );
  if (policy.error || !policy.data) return { rfqAvailable: false, enrichmentSlots: [] };
  const slots = Array.isArray(policy.data.tier_b_slots) ? policy.data.tier_b_slots : [];
  return {
    rfqAvailable: policy.data.quote_mode === "kael_auto_quote" &&
      asRecord(policy.data.evidence_requirements).evidence_unavailable_fallback === "rfq",
    enrichmentSlots: slots.flatMap((slot) => {
      const row = asRecord(slot);
      return row.enabled === true && typeof row.key === "string" ? [row.key] : [];
    }),
  };
}

export async function evidenceGapRfqFallbackAvailable(
  client: DbClient,
  serviceProblemId: string,
): Promise<boolean> {
  return (await evidenceGapPolicyState(client, serviceProblemId)).rfqAvailable;
}

// The newest Kael turn that reported quote readiness decides whether the case is in a price gap;
// a later question-and-answer turn does not change that state.
export async function latestQuoteReadinessTurn(
  client: DbClient,
  sessionId: string,
): Promise<Record<string, unknown> | null> {
  const turns = await dbQuery<Array<Record<string, unknown>>>(
    client.from("kael_chat_turns")
      .select("safe_metadata, turn_index")
      .eq("session_id", sessionId)
      .eq("role", "kael")
      .order("turn_index", { ascending: false })
      .limit(12),
  );
  if (turns.error || !Array.isArray(turns.data)) return null;
  for (const turn of turns.data) {
    const metadata = asRecord(turn.safe_metadata);
    if (typeof metadata.quote_readiness === "string") return metadata;
  }
  return null;
}
