// What Kael says when a case has no validated price: why, a labelled market reference when real
// cited prices exist, and the next steps the customer can take. Never a Kael estimate (RULES #4, #8).

import type { EdgeKaelNextAction } from "../../../../_shared/contracts/kael-next-actions.ts";
import type { KaelDiagnosisScopeArtifact } from "../../kael/contracts/artifact-contract.ts";
import { PRICE_DISCLAIMER, PRICE_DISCLAIMER_EN, type PipelineStageLog } from "../../kael/contracts/types.ts";
import type { KaelProgressTarget } from "../../kael/index.ts";
import { sanitizeMarketSourceLinks } from "../../kael/kael-guardrails/output-pipeline.ts";
import { asRecord, nullableString } from "../../platform/coercions.ts";
import type { DbClient } from "../../platform/db.ts";
import { emitKaelChatStep } from "./emit-step.ts";
import { evidenceGapPolicyState } from "./evidence-gap-policy.ts";
import { intakeSlotQuestion } from "../../kael/language/intake-slot-questions.ts";
import { intakeObservationMetadata, withIntakeSafetyGuidance } from "./intake-safety.ts";
import { priceEvidenceGapReply } from "./price-gap-reply.ts";

const REFERENCE_UNITS = ["per_visit", "per_repair_point", "per_item"] as const;
type ReferenceUnit = typeof REFERENCE_UNITS[number];
const MIN_REFERENCE_SOURCES = 2;

export type ReferencePriceNote = {
  price_min: number;
  price_max: number;
  unit: ReferenceUnit;
  source_count: number;
  sources: Array<{ domain: string; url: string }>;
};

// Cited prices only, grouped by the unit most sources share; fewer than two distinct sources
// means no number is shown at all.
export function referencePriceFromMarketMetadata(metadata: Record<string, unknown>): ReferencePriceNote | null {
  const raw = Array.isArray(metadata.source_trust_reference_sources)
    ? metadata.source_trust_reference_sources
    : Array.isArray(metadata.source_trust_accepted_sources)
    ? metadata.source_trust_accepted_sources
    : [];
  const parsed = raw.flatMap((item) => {
    const row = asRecord(item);
    const domain = nullableString(row.domain)?.trim().toLowerCase();
    const min = Number(row.price_min);
    const max = Number(row.price_max);
    const unit = row.unit;
    if (
      !domain || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min <= 0 || max < min ||
      !(REFERENCE_UNITS as readonly unknown[]).includes(unit)
    ) return [];
    return [{ domain, min, max, unit: unit as ReferenceUnit, url: nullableString(row.verified_url) }];
  });
  let best: { unit: ReferenceUnit; rows: typeof parsed } | null = null;
  for (const unit of REFERENCE_UNITS) {
    const byDomain = new Map(parsed.filter((row) => row.unit === unit).map((row) => [row.domain, row]));
    const rows = [...byDomain.values()];
    if (!best || rows.length > best.rows.length) best = { unit, rows };
  }
  if (!best || best.rows.length < MIN_REFERENCE_SOURCES) return null;
  return {
    price_min: Math.min(...best.rows.map((row) => row.min)),
    price_max: Math.max(...best.rows.map((row) => row.max)),
    unit: best.unit,
    source_count: best.rows.length,
    sources: sanitizeMarketSourceLinks(
      best.rows.flatMap((row) => row.url ? [{ domain: row.domain, url: row.url }] : []),
    ),
  };
}

export function referencePriceFromStageLogs(stageLogs: readonly PipelineStageLog[]): ReferencePriceNote | null {
  const market = stageLogs.find((stage) => stage.stage === "market")?.safeMetadata ?? {};
  return referencePriceFromMarketMetadata(market);
}

export function parseReferencePriceNote(value: unknown): ReferencePriceNote | null {
  const row = asRecord(value);
  const min = Number(row.price_min);
  const max = Number(row.price_max);
  const count = Number(row.source_count);
  if (
    !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min <= 0 || max < min ||
    !Number.isSafeInteger(count) || count < MIN_REFERENCE_SOURCES ||
    !(REFERENCE_UNITS as readonly unknown[]).includes(row.unit)
  ) return null;
  const sources = Array.isArray(row.sources)
    ? sanitizeMarketSourceLinks(row.sources.flatMap((item) => {
      const source = asRecord(item);
      const domain = nullableString(source.domain);
      const url = nullableString(source.url);
      return domain && url ? [{ domain, url }] : [];
    }))
    : [];
  return { price_min: min, price_max: max, unit: row.unit as ReferenceUnit, source_count: count, sources };
}

function unitLabel(unit: ReferenceUnit, language: "vi" | "en") {
  if (language === "en") return unit === "per_visit" ? "visit" : unit === "per_repair_point" ? "repair point" : "item";
  return unit === "per_visit" ? "lượt" : unit === "per_repair_point" ? "điểm sửa" : "món";
}

export function referencePriceText(note: ReferencePriceNote, language: "vi" | "en"): string {
  if (language === "en") {
    return `Market reference, not yet verified: about ${note.price_min.toLocaleString("en-US")}–${
      note.price_max.toLocaleString("en-US")
    } VND per ${unitLabel(note.unit, "en")} from ${note.source_count} public sources. This is not a quote and cannot be booked. ${PRICE_DISCLAIMER_EN}`;
  }
  return `Tham khảo thị trường (chưa đủ kiểm chứng): khoảng ${note.price_min.toLocaleString("vi-VN")}–${
    note.price_max.toLocaleString("vi-VN")
  } đ/${unitLabel(note.unit, "vi")} từ ${note.source_count} nguồn công khai. Đây không phải báo giá, bạn chưa thể đặt thợ theo con số này. ${PRICE_DISCLAIMER}`;
}

export function buildEvidenceGapNextActions(input: {
  language: "vi" | "en";
  rfqAvailable: boolean;
  hasPhoto: boolean;
  missingSlot?: string | null;
}): EdgeKaelNextAction[] {
  const vi = input.language === "vi";
  const actions: EdgeKaelNextAction[] = [];
  if (input.rfqAvailable) {
    actions.push({
      id: "request_worker_quote",
      kind: "request_worker_quote",
      label: vi ? "Gửi thợ báo giá từ ảnh" : "Ask a worker to quote",
      message: vi
        ? "Gửi yêu cầu để thợ phù hợp xem ảnh và báo giá giúp mình."
        : "Please send my request so a suitable worker can review it and quote.",
      turn_intent: "request_worker_quote",
    });
  }
  if (!input.hasPhoto) {
    actions.push({ id: "attach_photo", kind: "attach_photo", label: vi ? "Gửi thêm ảnh" : "Add a photo" });
  }
  const slotQuestion = input.missingSlot ? intakeSlotQuestion(input.missingSlot, input.language) : null;
  actions.push(slotQuestion && input.missingSlot
    ? { id: `provide_${input.missingSlot}`.slice(0, 64), kind: "provide_detail", label: slotQuestion.label, message: slotQuestion.example, slot: input.missingSlot }
    : { id: "provide_detail", kind: "provide_detail", label: vi ? "Bổ sung thông tin" : "Add details" });
  actions.push({
    id: "ask_why_no_price",
    kind: "ask_question",
    label: vi ? "Vì sao chưa có giá?" : "Why is there no price?",
    message: vi ? "Vì sao Kael chưa đưa ra giá cho việc này?" : "Why can't Kael price this yet?",
    turn_intent: "ask_question",
  });
  return actions.slice(0, 4);
}

// The first enabled enrichment slot the case has not answered yet, if Kael knows how to ask for it.
export function firstMissingSlot(slots: readonly string[], facts: Record<string, unknown>): string | null {
  return slots.find((slot) => !facts[slot] && intakeSlotQuestion(slot, "vi") !== null) ?? null;
}

export function evidenceGapProbe(language: "vi" | "en"): string {
  return language === "en"
    ? "Would you like Kael to send the request so a suitable worker reviews your photos and quotes, or add more details so Kael can search again?"
    : "Bạn muốn Kael gửi yêu cầu để thợ phù hợp xem ảnh và báo giá chính xác, hay bổ sung thêm thông tin để Kael tìm lại?";
}

export function evidenceGapTurnContent(input: {
  stageLogs: readonly PipelineStageLog[];
  language: "vi" | "en";
  rfqAvailable: boolean;
  hasPhoto: boolean;
  missingSlot?: string | null;
}) {
  const gapReply = priceEvidenceGapReply({ stageLogs: input.stageLogs, language: input.language });
  const reference = referencePriceFromStageLogs(input.stageLogs);
  const market = input.stageLogs.find((stage) => stage.stage === "market")?.safeMetadata ?? {};
  const text = [
    gapReply.text,
    ...(reference ? [referencePriceText(reference, input.language)] : []),
    ...(input.rfqAvailable ? [evidenceGapProbe(input.language)] : []),
  ].join("\n\n");
  return {
    text,
    metadata: {
      ...gapReply.metadata,
      next_actions: buildEvidenceGapNextActions(input),
      ...(reference ? { reference_price: reference } : {}),
      ...(typeof market.kael_price_knowledge_id === "string"
        ? { price_knowledge_id: market.kael_price_knowledge_id }
        : {}),
    },
  };
}

// The single place every no-validated-price branch reports from.
export async function emitEvidenceGapStep(input: {
  client: DbClient;
  sessionId: string;
  progressTarget: KaelProgressTarget;
  artifact: KaelDiagnosisScopeArtifact;
  stageLogs: readonly PipelineStageLog[];
  language: "vi" | "en";
  responseSafetySignals: readonly string[];
  serviceProblemId?: string | null;
  intakeObservation?: Parameters<typeof intakeObservationMetadata>[0];
  extraMetadata?: Record<string, unknown>;
}) {
  const policyState = input.serviceProblemId
    ? await evidenceGapPolicyState(input.client, input.serviceProblemId)
    : { rfqAvailable: false, enrichmentSlots: [] };
  const content = evidenceGapTurnContent({
    stageLogs: input.stageLogs,
    language: input.language,
    rfqAvailable: policyState.rfqAvailable,
    hasPhoto: input.artifact.evidence.some((item) => item.kind === "photo" || item.kind === "video_frame"),
    missingSlot: firstMissingSlot(policyState.enrichmentSlots, input.artifact.facts),
  });
  await emitKaelChatStep(input.client, input.sessionId, input.progressTarget, {
    artifact: input.artifact,
    turn: {
      contentType: "analysis",
      text: withIntakeSafetyGuidance(content.text, input.responseSafetySignals, input.language),
      nextStatus: "active",
      telemetry: { replySource: "template" },
      metadata: {
        diagnosis_scope: input.artifact,
        quote_readiness: "validated_price_evidence_unavailable",
        ...input.extraMetadata,
        ...content.metadata,
        ...(input.serviceProblemId ? { service_problem_id: input.serviceProblemId } : {}),
        ...intakeObservationMetadata(input.intakeObservation),
      },
    },
    progress: {
      stage: "price_synthesis",
      status: "completed",
      progress: 1,
    },
  });
}
