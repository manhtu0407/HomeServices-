import type { EdgeKaelCaseWorkPhase, KaelChatNextAction, KaelChatStatus } from "../../../../_shared/contracts.ts";
import { KAEL_CASE_WORK_PHASES, kaelDiagnosisScopeArtifactSchema } from "../../kael/contracts/artifact-contract.ts";
import { kaelIntakeConfirmationSchema } from "../../kael/pipeline/intake-confirmation.ts";
import {
  PRICE_DISCLAIMER,
  intakeEvalObservationSchema,
  isIntakeEvalObservationExposureEnabled,
} from "../../kael/index.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import {
  asComplexityOrNull,
  asRecord,
  asStringArray,
  nullableServiceType,
  nullableString,
} from "../../platform/coercions.ts";
import { KAEL_CHAT_HARD_COST_CAP_USD } from "../../kael/kael-guardrails/cost-cap.ts";
import { parseBaselinePriceEvidenceReceipt } from "../../kael/evidence/baseline-price-evidence.ts";
import {
  isSafePublicPriceReasoningText,
  type PriceReasoningReceipt,
} from "../../kael/kael-guardrails/output-pipeline.ts";

export function serializeKaelTurn(row: Record<string, unknown>) {
  const metadata = asRecord(row.safe_metadata);
  const contentType = requiredKaelContentType(row.content_type);
  const turnIndex = finiteDbNumber(row.turn_index);
  if (
    turnIndex === null || !Number.isSafeInteger(turnIndex) || turnIndex <= 0 ||
    (row.text_content !== null && row.text_content !== undefined &&
      typeof row.text_content !== "string") ||
    !Array.isArray(row.media_refs) ||
    !row.media_refs.every((item) => typeof item === "string")
  ) {
    apiFailure("DB_ERROR", "Dữ liệu lượt chat Kael không hợp lệ", 500);
  }
  return {
    id: requiredDbString(row.id, "Dữ liệu lượt chat Kael không hợp lệ"),
    session_id: requiredDbString(
      row.session_id,
      "Dữ liệu lượt chat Kael không hợp lệ",
    ),
    turn_index: turnIndex,
    role: requiredKaelTurnRole(row.role),
    content_type: contentType,
    text_content: nullableString(row.text_content),
    media_refs: row.media_refs,
    estimate: serializeKaelEstimate(metadata.estimate, metadata.estimate_card_v3),
    // Surface what Kael still needs so the mobile
    // thread can render slot-hint chips. Drawn from the missing-info artifact proposal.
    clarification: serializeKaelClarification(contentType, metadata.artifact_proposal),
    ...(isIntakeEvalObservationExposureEnabled()
      ? { intake_observation: serializeIntakeEvalObservation(metadata.intake_observation) }
      : {}),
    created_at: requiredDbString(
      row.created_at,
      "Dữ liệu lượt chat Kael không hợp lệ",
    ),
  };
}

function serializeIntakeEvalObservation(value: unknown) {
  const parsed = intakeEvalObservationSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    scope_signal: parsed.data.scopeSignal,
    suggested_service: parsed.data.suggestedService,
    problem_slug: parsed.data.problemSlug,
    needs_clarification: parsed.data.needsClarification,
    safety_signals: parsed.data.safetySignals,
    model_id: parsed.data.modelId,
    prompt_version: parsed.data.promptVersion,
    playbook_version: parsed.data.playbookVersion,
  };
}

function serializeKaelClarification(
  contentType: string,
  artifactProposal: unknown,
): { question: string | null; missing_slots: string[] } | null {
  if (contentType !== "clarification") return null;
  const proposal = asRecord(artifactProposal);
  const question = nullableString(proposal.recommended_next_question);
  const missingSlots = asStringArray(proposal.missing_fields);
  if (!question && missingSlots.length === 0) return null;
  return { question, missing_slots: missingSlots };
}

export function serializeKaelSession(
  row: Record<string, unknown>,
  estimate: ReturnType<typeof serializeKaelEstimate>,
  turns: Array<ReturnType<typeof serializeKaelTurn>>,
) {
  const status = requiredKaelChatStatus(row.status);
  const lastTurn = turns[turns.length - 1];
  const totalCostUsd = finiteDbNumber(row.total_cost_usd);
  const totalTurns = finiteDbNumber(row.total_turns);
  const serviceType = nullableServiceType(row.service_type);
  const diagnosisScopeResult = row.diagnosis_scope === null
    ? null
    : kaelDiagnosisScopeArtifactSchema.safeParse(row.diagnosis_scope);
  if (
    totalCostUsd === null || totalCostUsd < 0 ||
    totalTurns === null || !Number.isSafeInteger(totalTurns) || totalTurns < 0 ||
    !serviceType ||
    (diagnosisScopeResult !== null && !diagnosisScopeResult.success)
  ) {
    apiFailure("DB_ERROR", "Dữ liệu phiên Kael không hợp lệ", 500);
  }
  const diagnosisScope = diagnosisScopeResult?.success ? diagnosisScopeResult.data : null;
  const metadata = asRecord(row.safe_metadata);
  const intakeConfirmationResult = metadata.intake_confirmation === undefined ||
      metadata.intake_confirmation === null
    ? null
    : kaelIntakeConfirmationSchema.safeParse(metadata.intake_confirmation);
  if (intakeConfirmationResult && !intakeConfirmationResult.success) {
    apiFailure("DB_ERROR", "Dữ liệu xác nhận đầu vào Kael không hợp lệ", 500);
  }
  const intakeConfirmation = intakeConfirmationResult?.success
    ? intakeConfirmationResult.data
    : null;
  const rowCasePhase = typeof row.case_phase === "string" &&
      (KAEL_CASE_WORK_PHASES as readonly string[]).includes(row.case_phase)
    ? row.case_phase as EdgeKaelCaseWorkPhase
    : null;
  if (!rowCasePhase) {
    apiFailure("DB_ERROR", "Dữ liệu phiên Kael không hợp lệ", 500);
  }
  return {
    id: requiredDbString(row.id, "Dữ liệu phiên Kael không hợp lệ"),
    job_id: nullableString(row.job_id),
    customer_id: requiredDbString(
      row.customer_id,
      "Dữ liệu phiên Kael không hợp lệ",
    ),
    service_type: serviceType,
    status,
    case_phase: rowCasePhase,
    diagnosis_scope: diagnosisScope,
    scheduled_at: nullableString(row.scheduled_at),
    estimate,
    started_at: requiredDbString(
      row.started_at,
      "Dữ liệu phiên Kael không hợp lệ",
    ),
    estimate_ready_at: nullableString(row.estimate_ready_at),
    total_turns: totalTurns,
    total_cost_usd: totalCostUsd,
    next_action: kaelNextAction(
      status,
      lastTurn?.content_type,
      totalCostUsd,
      diagnosisScope,
      intakeConfirmation,
    ),
    intake_confirmation: intakeConfirmation,
  };
}

export function serializeKaelEstimate(value: unknown, cardV3?: unknown) {
  const estimate = asRecord(value);
  if (Object.keys(estimate).length === 0) return null;
  // Surface the honesty fields already computed in estimate_card_v3 so the
  // customer sees a real inspection requirement without treating low price
  // confidence alone as a workflow blocker. Older turns default to false.
  const cardEnvelope = asRecord(cardV3);
  const nestedCard = asRecord(cardEnvelope.card);
  const card = Object.keys(nestedCard).length > 0 ? nestedCard : cardEnvelope;
  const reasoning = asRecord(card.kael_reasoning);
  const serviceType = nullableServiceType(estimate.service_type);
  const problemCategory = requiredDbString(
    estimate.problem_category,
    "Dữ liệu ước tính Kael không hợp lệ",
  );
  const problemSummary = requiredDbString(
    estimate.problem_summary,
    "Dữ liệu ước tính Kael không hợp lệ",
  );
  const complexity = asComplexityOrNull(estimate.complexity);
  const priceMin = finiteDbNumber(estimate.price_min);
  const priceMax = finiteDbNumber(estimate.price_max);
  const confidence = finiteDbNumber(estimate.confidence);
  if (
    !serviceType || !complexity || priceMin === null || priceMax === null ||
    !Number.isInteger(priceMin) || !Number.isInteger(priceMax) ||
    priceMin <= 0 || priceMax < priceMin || confidence === null ||
    confidence < 0 || confidence > 1
  ) {
    apiFailure("DB_ERROR", "Dữ liệu ước tính Kael không hợp lệ", 500);
  }
  return {
    service_type: serviceType,
    problem_category: problemCategory,
    problem_summary: problemSummary,
    complexity,
    price_min: priceMin,
    price_max: priceMax,
    confidence,
    advisory: nullableString(estimate.advisory),
    disclaimer: nonEmptyString(estimate.disclaimer) ?? PRICE_DISCLAIMER,
    needs_inspection: card.needs_inspection === true,
    price_source: nullableString(card.price_source),
    complexity_reasoning: nullableString(reasoning.complexity_reasoning),
    market_signals: nullableString(reasoning.market_signals),
    needs_inspection_reason: nullableString(reasoning.needs_inspection_reason),
    analysis_receipt: serializeEstimateAnalysisReceipt(card.analysis_receipt),
    price_reasoning_receipt: serializePriceReasoningReceipt(
      card.price_reasoning_receipt,
      {
        expectedPriceSource: nullableEstimatePriceSource(card.price_source),
        priceMax,
        priceMin,
      },
    ),
  };
}

type StoredEstimatePriceSource = PriceReasoningReceipt["fairness"]["price_source"];

function serializePriceReasoningReceipt(
  value: unknown,
  expected: {
    expectedPriceSource: StoredEstimatePriceSource | null;
    priceMin: number;
    priceMax: number;
  },
): PriceReasoningReceipt | null {
  const receipt = asRecord(value);
  if (Object.keys(receipt).length === 0) return null;
  if (
    receipt.schema_version !== "price_reasoning_receipt.v1" ||
    !isReceiptId(receipt.receipt_id)
  ) {
    invalidPriceReasoningReceipt();
  }
  const problem = asRecord(receipt.problem);
  const scope = asRecord(receipt.scope);
  const costs = asRecord(receipt.costs);
  const scenarios = asRecord(receipt.scenarios);
  const lowScenario = asRecord(scenarios.low);
  const highScenario = asRecord(scenarios.high);
  const fairness = asRecord(receipt.fairness);
  const source = priceReasoningSource(fairness.price_source);
  if (!expected.expectedPriceSource || source !== expected.expectedPriceSource) {
    invalidPriceReasoningReceipt();
  }
  const totalMin = positiveSafeInteger(costs.total_min);
  const totalMax = positiveSafeInteger(costs.total_max);
  const reconciliation = costs.reconciliation;
  if (
    costs.currency !== "VND" ||
    totalMin !== expected.priceMin ||
    totalMax !== expected.priceMax ||
    (reconciliation !== "package_total" && reconciliation !== "exact")
  ) {
    invalidPriceReasoningReceipt();
  }
  const components = serializePriceReasoningComponents(
    costs.components,
    expected,
    reconciliation,
  );
  const lowTotal = positiveSafeInteger(lowScenario.total);
  const highTotal = positiveSafeInteger(highScenario.total);
  if (lowTotal !== expected.priceMin || highTotal !== expected.priceMax) {
    invalidPriceReasoningReceipt();
  }
  const marketSourceCount = nullableNonNegativeSafeInteger(
    fairness.market_source_count,
  );
  const highTrustSourceCount = nullableNonNegativeSafeInteger(
    fairness.high_trust_source_count,
  );
  if (
    highTrustSourceCount !== null && marketSourceCount !== null &&
    highTrustSourceCount > marketSourceCount ||
    (fairness.quorum_met !== null && typeof fairness.quorum_met !== "boolean")
  ) {
    invalidPriceReasoningReceipt();
  }
  const confidence = priceReasoningConfidence(fairness.confidence);
  const capStatement = priceReasoningText(fairness.cap_statement, 300);
  const baselineEvidence = fairness.baseline_evidence === null ||
      fairness.baseline_evidence === undefined
    ? null
    : parseBaselinePriceEvidenceReceipt(fairness.baseline_evidence);
  if (fairness.baseline_evidence && !baselineEvidence) {
    invalidPriceReasoningReceipt();
  }
  return {
    schema_version: "price_reasoning_receipt.v1",
    receipt_id: receipt.receipt_id,
    problem: {
      confirmed_facts: priceReasoningTextList(problem.confirmed_facts, 1, 5, 240),
      possible_causes: serializePriceReasoningCauses(problem.possible_causes),
      unknowns: priceReasoningTextList(problem.unknowns, 1, 4, 280),
    },
    scope: {
      included: priceReasoningTextList(scope.included, 1, 5, 320),
      conditional: priceReasoningTextList(scope.conditional, 1, 5, 320),
      excluded: priceReasoningTextList(scope.excluded, 1, 5, 320),
    },
    costs: {
      currency: "VND",
      total_min: totalMin,
      total_max: totalMax,
      reconciliation,
      components,
    },
    scenarios: {
      low: {
        total: lowTotal,
        conditions: priceReasoningTextList(lowScenario.conditions, 1, 4, 280),
        scope: priceReasoningTextList(lowScenario.scope, 1, 5, 320),
      },
      high: {
        total: highTotal,
        conditions: priceReasoningTextList(highScenario.conditions, 1, 4, 280),
        scope: priceReasoningTextList(highScenario.scope, 1, 5, 320),
      },
    },
    fairness: {
      price_source: source,
      confidence,
      baseline_evidence: baselineEvidence,
      market_source_count: marketSourceCount,
      high_trust_source_count: highTrustSourceCount,
      quorum_met: fairness.quorum_met,
      cap_statement: capStatement,
      remaining_uncertainty: priceReasoningTextList(
        fairness.remaining_uncertainty,
        1,
        4,
        280,
      ),
    },
  };
}

function serializePriceReasoningCauses(
  value: unknown,
): PriceReasoningReceipt["problem"]["possible_causes"] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    invalidPriceReasoningReceipt();
  }
  return value.map((item) => {
    const cause = asRecord(item);
    const basis = serializePriceReasoningBasis(cause.basis);
    const confidence = cause.confidence === "low" || cause.confidence === "medium" ||
        cause.confidence === "high"
      ? cause.confidence
      : invalidPriceReasoningReceipt();
    return {
      statement: priceReasoningText(cause.statement, 240),
      basis,
      confidence,
    };
  });
}

function serializePriceReasoningBasis(
  value: unknown,
): PriceReasoningReceipt["problem"]["possible_causes"][number]["basis"] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    invalidPriceReasoningReceipt();
  }
  const seen = new Set<string>();
  const basis = value.map((item) => {
    if (
      item !== "customer_report" && item !== "visual_evidence" &&
      item !== "service_profile" && item !== "knowledge" || seen.has(item)
    ) {
      invalidPriceReasoningReceipt();
    }
    seen.add(item);
    return item;
  });
  return basis;
}

function serializePriceReasoningComponents(
  value: unknown,
  expected: { priceMin: number; priceMax: number },
  reconciliation: PriceReasoningReceipt["costs"]["reconciliation"],
): PriceReasoningReceipt["costs"]["components"] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7) {
    invalidPriceReasoningReceipt();
  }
  const kinds = new Set<string>();
  const components = value.map((item) => {
    const component = asRecord(item);
    const kind = priceReasoningComponentKind(component.kind);
    const status = priceReasoningComponentStatus(component.status);
    const amountMin = nullablePriceAmount(component.amount_min);
    const amountMax = nullablePriceAmount(component.amount_max);
    if (
      kinds.has(kind) ||
      (amountMin === null) !== (amountMax === null) ||
      (amountMin !== null && amountMax !== null && amountMax < amountMin) ||
      (status === "priced" &&
        (kind !== "service_package" || amountMin === null || amountMax === null)) ||
      (status !== "priced" && (amountMin !== null || amountMax !== null))
    ) {
      invalidPriceReasoningReceipt();
    }
    kinds.add(kind);
    return {
      kind,
      status,
      amount_min: amountMin,
      amount_max: amountMax,
      explanation: priceReasoningText(component.explanation, 260),
    };
  });
  const servicePackage = components.find((component) => component.kind === "service_package");
  if (
    reconciliation === "package_total" &&
    (!servicePackage || servicePackage.status !== "priced" ||
      servicePackage.amount_min !== expected.priceMin ||
      servicePackage.amount_max !== expected.priceMax ||
      components.some((component) =>
        component.kind !== "service_package" && component.status === "priced"
      ))
  ) {
    invalidPriceReasoningReceipt();
  }
  if (reconciliation === "exact") {
    const priced = components.filter((component) => component.status === "priced");
    const totalMin = priced.reduce((total, component) => total + (component.amount_min ?? 0), 0);
    const totalMax = priced.reduce((total, component) => total + (component.amount_max ?? 0), 0);
    if (priced.length === 0 || totalMin !== expected.priceMin || totalMax !== expected.priceMax) {
      invalidPriceReasoningReceipt();
    }
  }
  return components;
}

function priceReasoningComponentKind(
  value: unknown,
): PriceReasoningReceipt["costs"]["components"][number]["kind"] {
  if (
    value === "service_package" || value === "labor" || value === "travel" ||
    value === "materials" || value === "replacement_parts" ||
    value === "equipment" || value === "other"
  ) return value;
  return invalidPriceReasoningReceipt();
}

function priceReasoningComponentStatus(
  value: unknown,
): PriceReasoningReceipt["costs"]["components"][number]["status"] {
  if (
    value === "priced" || value === "included_unitemized" ||
    value === "conditional_unpriced" || value === "excluded" ||
    value === "undetermined"
  ) return value;
  return invalidPriceReasoningReceipt();
}

function priceReasoningSource(value: unknown): StoredEstimatePriceSource {
  if (
    value === "perplexity_validated" || value === "baseline_with_market" ||
    value === "baseline_only" || value === "inspection_required"
  ) return value;
  return invalidPriceReasoningReceipt();
}

function priceReasoningConfidence(
  value: unknown,
): PriceReasoningReceipt["fairness"]["confidence"] {
  if (value === "low" || value === "medium" || value === "high") return value;
  return invalidPriceReasoningReceipt();
}

function priceReasoningTextList(
  value: unknown,
  minItems: number,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    invalidPriceReasoningReceipt();
  }
  const seen = new Set<string>();
  return value.map((item) => {
    const text = priceReasoningText(item, maxLength);
    if (seen.has(text)) invalidPriceReasoningReceipt();
    seen.add(text);
    return text;
  });
}

function priceReasoningText(value: unknown, maxLength: number): string {
  return isSafePublicPriceReasoningText(value, maxLength)
    ? value
    : invalidPriceReasoningReceipt();
}

function isReceiptId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{1,160}$/.test(value);
}

function positiveSafeInteger(value: unknown): number {
  const parsed = finiteDbNumber(value);
  if (!parsed || !Number.isSafeInteger(parsed) || parsed <= 0) {
    invalidPriceReasoningReceipt();
  }
  return parsed;
}

function nullablePriceAmount(value: unknown): number | null {
  if (value === null) return null;
  return positiveSafeInteger(value);
}

function nullableNonNegativeSafeInteger(value: unknown): number | null {
  if (value === null) return null;
  const parsed = finiteDbNumber(value);
  if (parsed === null || !Number.isSafeInteger(parsed) || parsed < 0) {
    invalidPriceReasoningReceipt();
  }
  return parsed;
}

function nullableEstimatePriceSource(value: unknown): StoredEstimatePriceSource | null {
  return value === "perplexity_validated" || value === "baseline_with_market" ||
      value === "baseline_only" || value === "inspection_required"
    ? value
    : null;
}

function invalidPriceReasoningReceipt(): never {
  return apiFailure("DB_ERROR", "Dữ liệu biên nhận giải thích giá Kael không hợp lệ", 500);
}

function serializeEstimateAnalysisReceipt(value: unknown) {
  const receipt = asRecord(value);
  if (Object.keys(receipt).length === 0) return null;
  if (receipt.schema_version !== "analysis_receipt.v1") return null;
  const evidence = asRecord(receipt.evidence);
  const market = asRecord(receipt.market);
  const photoCount = finiteDbNumber(evidence.photo_count);
  const videoFrameCount = finiteDbNumber(evidence.video_frame_count);
  const voiceTranscriptCount = finiteDbNumber(evidence.voice_transcript_count);
  const acceptedSourceCount = finiteDbNumber(market.accepted_source_count);
  const highTrustSourceCount = finiteDbNumber(market.high_trust_source_count);
  const analysisStatus = evidence.analysis_status;
  const validAnalysisStatus = analysisStatus === undefined ||
    analysisStatus === "analyzed" ||
    analysisStatus === "not_provided" ||
    analysisStatus === "unavailable";
  const validEvidenceCounts = [photoCount, videoFrameCount, voiceTranscriptCount]
    .every((count) => count !== null && Number.isSafeInteger(count) && count >= 0);
  const validMarketCounts = [
    [market.accepted_source_count, acceptedSourceCount],
    [market.high_trust_source_count, highTrustSourceCount],
  ].every(([raw, count]) => isNullableNonNegativeInteger(raw, count));
  if (
    !validEvidenceCounts ||
    !validAnalysisStatus ||
    typeof evidence.skipped !== "boolean" ||
    !validMarketCounts ||
    (market.quorum_met !== null && typeof market.quorum_met !== "boolean")
  ) {
    apiFailure("DB_ERROR", "Dữ liệu biên nhận phân tích Kael không hợp lệ", 500);
  }
  const findings = serializeEstimateEvidenceFindings(evidence.findings, {
    photo: photoCount as number,
    video_frame: videoFrameCount as number,
  });
  if (
    (analysisStatus === "not_provided" || analysisStatus === "unavailable") &&
    findings && findings.length > 0
  ) {
    apiFailure("DB_ERROR", "Dữ liệu biên nhận phân tích Kael không hợp lệ", 500);
  }
  if (evidence.skipped && analysisStatus !== undefined && analysisStatus !== "not_provided") {
    apiFailure("DB_ERROR", "Dữ liệu biên nhận phân tích Kael không hợp lệ", 500);
  }
  const problem = serializeEstimateProblemReceipt(receipt.problem);
  return {
    schema_version: "analysis_receipt.v1" as const,
    evidence: {
      ...(analysisStatus ? { analysis_status: analysisStatus } : {}),
      ...(findings ? { findings } : {}),
      photo_count: photoCount as number,
      video_frame_count: videoFrameCount as number,
      voice_transcript_count: voiceTranscriptCount as number,
      skipped: evidence.skipped,
    },
    market: {
      accepted_source_count: market.accepted_source_count === null
        ? null
        : acceptedSourceCount,
      high_trust_source_count: market.high_trust_source_count === null
        ? null
        : highTrustSourceCount,
      quorum_met: market.quorum_met,
    },
    ...(problem ? { problem } : {}),
  };
}

function serializeEstimateEvidenceFindings(
  value: unknown,
  evidenceCount: { photo: number; video_frame: number },
) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 5) {
    apiFailure("DB_ERROR", "Dữ liệu biên nhận phân tích Kael không hợp lệ", 500);
  }
  const seen = new Set<string>();
  return value.map((item) => {
    const finding = asRecord(item);
    const kind = finding.evidence_kind;
    const index = finiteDbNumber(finding.evidence_index);
    const observation = boundedNonEmptyString(finding.observation, 240);
    const possibleMeaning = finding.possible_meaning === null
      ? null
      : boundedNonEmptyString(finding.possible_meaning, 240);
    const confidence = finding.confidence;
    const validKind = kind === "photo" || kind === "video_frame";
    const key = `${kind}:${index}`;
    if (
      !validKind ||
      (confidence !== "low" && confidence !== "medium" && confidence !== "high") ||
      index === null ||
      !Number.isSafeInteger(index) ||
      index < 1 ||
      index > evidenceCount[kind] ||
      !observation ||
      (finding.possible_meaning !== null && !possibleMeaning) ||
      seen.has(key)
    ) {
      apiFailure("DB_ERROR", "Dữ liệu biên nhận phân tích Kael không hợp lệ", 500);
    }
    seen.add(key);
    return {
      confidence,
      evidence_index: index,
      evidence_kind: kind,
      observation,
      possible_meaning: possibleMeaning,
    };
  });
}

function serializeEstimateProblemReceipt(value: unknown) {
  if (value === undefined) return undefined;
  const problem = asRecord(value);
  const summary = boundedNonEmptyString(problem.summary, 500);
  const remainingUncertainty = problem.remaining_uncertainty === null
    ? null
    : boundedNonEmptyString(problem.remaining_uncertainty, 300);
  const recommendedScope = problem.recommended_scope === null
    ? null
    : boundedNonEmptyString(problem.recommended_scope, 400);
  const indicators = Array.isArray(problem.severity_indicators)
    ? problem.severity_indicators.map((item) => boundedNonEmptyString(item, 200))
    : [];
  if (
    !summary ||
    !Array.isArray(problem.severity_indicators) ||
    indicators.length > 5 ||
    indicators.some((item) => !item) ||
    (problem.remaining_uncertainty !== null && !remainingUncertainty) ||
    (problem.recommended_scope !== null && !recommendedScope)
  ) {
    apiFailure("DB_ERROR", "Dữ liệu biên nhận phân tích Kael không hợp lệ", 500);
  }
  return {
    remaining_uncertainty: remainingUncertainty,
    recommended_scope: recommendedScope,
    severity_indicators: indicators as string[],
    summary,
  };
}

function isNullableNonNegativeInteger(raw: unknown, parsed: unknown) {
  return raw === null ||
    (typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0);
}

function requiredDbString(value: unknown, message: string): string {
  const parsed = nonEmptyString(value);
  if (!parsed) apiFailure("DB_ERROR", message, 500);
  return parsed;
}

function requiredKaelChatStatus(value: unknown): KaelChatStatus {
  if (
    value === "active" || value === "collecting_evidence" ||
    value === "estimate_ready" || value === "confirmed" ||
    value === "abandoned" || value === "unsupported"
  ) {
    return value;
  }
  apiFailure("DB_ERROR", "Dữ liệu phiên Kael không hợp lệ", 500);
}

function requiredKaelTurnRole(
  value: unknown,
): "customer" | "kael" | "system" {
  if (value === "customer" || value === "kael" || value === "system") {
    return value;
  }
  apiFailure("DB_ERROR", "Dữ liệu lượt chat Kael không hợp lệ", 500);
}

function requiredKaelContentType(
  value: unknown,
): "text" | "photo_request" | "video_request" | "photo_attached" |
  "video_attached" | "clarification" | "analysis" | "estimate" | "error" {
  if (
    value === "text" || value === "photo_request" ||
    value === "video_request" || value === "photo_attached" ||
    value === "video_attached" || value === "clarification" ||
    value === "analysis" || value === "estimate" || value === "error"
  ) {
    return value;
  }
  apiFailure("DB_ERROR", "Dữ liệu lượt chat Kael không hợp lệ", 500);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function boundedNonEmptyString(value: unknown, maxLength: number): string | null {
  const parsed = nonEmptyString(value);
  return parsed && parsed.length <= maxLength ? parsed : null;
}

function finiteDbNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function kaelNextAction(
  status: KaelChatStatus,
  lastContentType: string | undefined,
  totalCostUsd: number,
  diagnosisScope?: unknown,
  intakeConfirmation?: unknown,
): KaelChatNextAction {
  if (status === "confirmed") return "confirmed";
  if (status === "unsupported") return "unsupported";
  if (totalCostUsd >= KAEL_CHAT_HARD_COST_CAP_USD) return "budget_exceeded";
  const intake = kaelIntakeConfirmationSchema.safeParse(intakeConfirmation);
  if (intake.success && intake.data.status === "pending") return "confirm_intake";
  if (status === "collecting_evidence") return "collect_evidence";
  if (status === "estimate_ready") return "estimate_ready";
  const artifact = kaelDiagnosisScopeArtifactSchema.safeParse(diagnosisScope);
  if (artifact.success && artifact.data.next_action.kind === "ask_question") return "ask_question";
  if (artifact.success && artifact.data.next_action.kind === "request_evidence") return "request_evidence";
  if (lastContentType === "photo_request") return "ask_photo";
  if (lastContentType === "video_request") return "ask_video";
  if (lastContentType === "error") return "unsupported";
  return "await_input";
}
