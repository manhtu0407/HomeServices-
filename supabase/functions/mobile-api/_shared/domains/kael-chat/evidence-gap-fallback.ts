// When an auto-quote case has no validated price, the customer may ask for a worker quote instead.
// This only prepares an RFQ review; the customer still confirms `rfq_request`, and the confirm RPC
// re-checks the policy and the recorded fallback before any job exists (RULES #4, #7).

import { normalizeServiceAreaDistrict, type ServiceType } from "../../../../_shared/domain.ts";
import { kaelDiagnosisScopeArtifactSchema } from "../../kael/index.ts";
import { asRecord, asStringArray, nullableString } from "../../platform/coercions.ts";
import { compactMetadata } from "../../platform/domain-utils.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { finalizeUnpricedStage1Intake } from "./estimate-support.ts";
import { loadActiveIntakePolicy } from "./estimate-intake-policy.ts";
import { updateKaelSession } from "./session-store.ts";
import { EVIDENCE_GAP_QUOTE_READINESS, latestQuoteReadinessTurn } from "./evidence-gap-policy.ts";

export type EvidenceGapFallbackOutcome =
  | { status: "applied" }
  | { status: "needs_detail" }
  | { status: "not_eligible"; reason: "no_price_gap" | "policy_disallows" | "case_unavailable" };

export async function applyEvidenceGapRfqFallback(input: {
  client: DbClient;
  sessionId: string;
  session: Record<string, unknown>;
  language: "vi" | "en";
}): Promise<EvidenceGapFallbackOutcome> {
  const gapTurn = await latestQuoteReadinessTurn(input.client, input.sessionId);
  const serviceProblemId = nullableString(gapTurn?.service_problem_id);
  if (!gapTurn || gapTurn.quote_readiness !== EVIDENCE_GAP_QUOTE_READINESS || !serviceProblemId) {
    return { status: "not_eligible", reason: "no_price_gap" };
  }
  const artifactResult = kaelDiagnosisScopeArtifactSchema.safeParse(input.session.diagnosis_scope);
  const problem = await dbQuery<Record<string, unknown>>(
    input.client.from("service_problems").select("slug").eq("id", serviceProblemId).maybeSingle(),
  );
  const problemSlug = nullableString(problem.data?.slug);
  const metadata = asRecord(input.session.safe_metadata);
  const district = normalizeServiceAreaDistrict(nullableString(metadata.address_district) ?? undefined);
  if (!artifactResult.success || problem.error || !problemSlug || !district) {
    return { status: "not_eligible", reason: "case_unavailable" };
  }
  const artifact = artifactResult.data;
  const serviceType = input.session.service_type as ServiceType;
  const customerAnalysisDetail = nullableString(artifact.facts.latest_customer_detail) ??
    artifact.scope_summary ?? "";
  const policy = await loadActiveIntakePolicy({
    client: input.client,
    sessionId: input.sessionId,
    artifact,
    serviceProblemId,
    service_type: serviceType,
    district,
    customerAnalysisDetail,
    language: input.language,
  }, problemSlug);
  if (policy.quoteMode !== "kael_auto_quote" || policy.evidenceRequirements.unavailableFallback !== "rfq") {
    return { status: "not_eligible", reason: "policy_disallows" };
  }
  const profileFacts = Object.fromEntries(
    Object.entries(artifact.facts).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  await finalizeUnpricedStage1Intake({
    client: input.client,
    sessionId: input.sessionId,
    artifact,
    serviceProblemId,
    serviceType,
    customerAnalysisDetail,
    problemChips: asStringArray(metadata.problem_chips),
    district,
    language: input.language,
    policy: { ...policy, quoteMode: "rfq" },
    profileFacts,
    responseSafetySignals: asStringArray(metadata.intake_safety_signals),
    costUsd: 0,
  });
  const refreshed = await dbQuery<Record<string, unknown>>(
    input.client.from("kael_chat_sessions").select("safe_metadata").eq("id", input.sessionId).maybeSingle(),
  );
  const refreshedMetadata = asRecord(refreshed.data?.safe_metadata);
  if (asRecord(refreshedMetadata.intake_coverage).order_eligible !== true) return { status: "needs_detail" };
  await updateKaelSession(input.client, input.sessionId, {
    safe_metadata: compactMetadata({
      ...refreshedMetadata,
      quote_mode_fallback: {
        mode: "rfq",
        policy_id: policy.policyId,
        policy_version: policy.version,
        gap_reason: nullableString(gapTurn.price_gap_reason) ?? "no_published_price",
        gap_knowledge_id: nullableString(gapTurn.price_knowledge_id),
        source: "customer_request",
        decided_at: new Date().toISOString(),
      },
    }),
  });
  return { status: "applied" };
}
