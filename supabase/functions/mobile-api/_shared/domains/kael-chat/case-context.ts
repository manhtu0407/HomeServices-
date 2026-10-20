// The Case identity handed to the assistant on an in-Case question. Every field is read from the
// persisted session row and its diagnosis_scope artifact, never from the request or the recent turns, so a
// short reply such as "2 máy treo tường 1HP" cannot lose the service it belongs to.

import {
  getKaelPerformanceProfile,
  kaelDiagnosisScopeArtifactSchema,
  scrubSensitiveForLLM,
  type CustomerAssistantCaseContext,
} from "../../kael/index.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { nullableString } from "../../platform/coercions.ts";
import { pendingClarificationSlotOf, slotAskCountsOf } from "./case-work-artifact.ts";

export type CaseContextRefusal =
  | "service_missing"
  | "service_unsupported"
  | "artifact_invalid"
  | "service_mismatch";

export type CaseContextResult =
  | { readonly ok: true; readonly context: CustomerAssistantCaseContext }
  | { readonly ok: false; readonly reason: CaseContextRefusal };

const MAX_FACTS = 10;
const MAX_CODES = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Raw customer wording is already in the transcript; the typed facts carry only what was extracted.
const RAW_TEXT_FACTS = new Set(["latest_customer_detail"]);

// Only the customer who owns the session may have its Case read into a prompt. The admin allowance of
// assertKaelSessionOwnership does not apply: this context speaks to the customer as the customer's assistant.
export function assertCaseContextOwner(
  ctx: MobileApiContext,
  sessionId: string,
  session: Record<string, unknown>,
) {
  if (session.id === sessionId && session.customer_id === ctx.user.id) return;
  apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
}

function factText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join("; ") || null;
  return null;
}

function codes(values: readonly unknown[]): string[] {
  return values
    .flatMap((value) => typeof value === "string" && value.trim() ? [value.trim().slice(0, 80)] : [])
    .slice(0, MAX_CODES);
}

export function buildCaseAssistantContext(input: {
  session: Record<string, unknown>;
  quoteTurn: Record<string, unknown> | null;
}): CaseContextResult {
  const rawService = nullableString(input.session.service_type);
  if (!rawService) return { ok: false, reason: "service_missing" };
  const profile = getKaelPerformanceProfile(rawService);
  if (!profile) return { ok: false, reason: "service_unsupported" };

  const rawArtifact = input.session.diagnosis_scope;
  const parsed = rawArtifact === null || rawArtifact === undefined
    ? null
    : kaelDiagnosisScopeArtifactSchema.safeParse(rawArtifact);
  if (parsed && !parsed.success) return { ok: false, reason: "artifact_invalid" };
  const artifact = parsed?.success ? parsed.data : null;
  if (artifact && artifact.service_type !== profile.service_type) return { ok: false, reason: "service_mismatch" };

  const knownFacts: Record<string, string> = {};
  for (const [key, value] of Object.entries(artifact?.facts ?? {})) {
    if (Object.keys(knownFacts).length >= MAX_FACTS) break;
    const text = RAW_TEXT_FACTS.has(key) ? null : factText(value);
    const clean = text ? scrubSensitiveForLLM(text).replace(/\s+/g, " ").trim().slice(0, 120) : "";
    if (clean) knownFacts[key.slice(0, 60)] = clean;
  }

  const serviceProblemId = nullableString(input.quoteTurn?.service_problem_id);
  const priceGapReason = nullableString(input.quoteTurn?.price_gap_reason);
  return {
    ok: true,
    context: {
      serviceType: profile.service_type,
      casePhase: nullableString(input.session.case_phase),
      status: nullableString(input.session.status),
      serviceProblemId: serviceProblemId && UUID.test(serviceProblemId) ? serviceProblemId : null,
      pendingSlot: artifact
        ? pendingClarificationSlotOf(artifact, slotAskCountsOf(input.session.safe_metadata))
        : null,
      knownFacts,
      missingFacts: codes(artifact?.missing_facts ?? []),
      quoteReadiness: nullableString(input.quoteTurn?.quote_readiness),
      priceBlockerCodes: codes([...(artifact?.quote_blockers ?? []), ...(priceGapReason ? [priceGapReason] : [])]),
    },
  };
}
