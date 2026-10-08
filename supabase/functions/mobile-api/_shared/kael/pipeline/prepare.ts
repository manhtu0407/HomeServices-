import type {
  EdgeAiSecrets,
  PipelineInput,
  PipelineResult,
  PipelineStageLog,
  SupabaseLike,
} from "../contracts/types.ts";
import { unsupportedServiceMessage } from "../contracts/types.ts";
import {
  buildIntakeObservation,
  resolveElectricalIntakeRuntime,
} from "./intake-runtime.ts";
import { updateKaelProgress } from "./streaming.ts";
import {
  sanitizeVisionPhotoUrls,
  scrubCustomerCaseContextForLLM,
  scrubSensitiveForLLM,
} from "./utils.ts";
import {
  isKaelAiKillSwitchEnabled,
  KAEL_AI_UNAVAILABLE_VI,
} from "../kael-guardrails/spend-gate.ts";
import { frameUntrustedCustomerCaseEvidenceForModel } from "../evidence/untrusted-evidence.ts";
import { prepareKaelPipelineSpendGate } from "../kael-guardrails/pipeline-spend-gate.ts";
import { createIntakeSafetyGuidance } from "./pipeline-safety-guidance.ts";

type PipelineSpendGatePreparation = Awaited<ReturnType<typeof prepareKaelPipelineSpendGate>>;

export type PreparedKaelPipeline = {
  input: PipelineInput;
  supabase: SupabaseLike;
  secrets: EdgeAiSecrets;
  serviceType: PipelineInput["serviceType"];
  district: PipelineInput["district"];
  language: NonNullable<PipelineInput["language"]>;
  problemChips: string[];
  description: string;
  modelDescription: string;
  photoUrls: string[];
  stageLogs: PipelineStageLog[];
  learningApplications: NonNullable<Extract<PipelineResult, { success: true }>["learningApplications"]>;
  progressTarget: PipelineInput["progressTarget"] | PipelineInput["progressJobId"];
  electricalPlaybookEnabled: boolean;
  deterministicSafetySignals: string[];
  withDeterministicSafetyGuidance: ReturnType<typeof createIntakeSafetyGuidance>;
  spendGate: PipelineSpendGatePreparation["spendGate"];
  recordProviderSpendIfEnforced: PipelineSpendGatePreparation["recordProviderSpendIfEnforced"];
};

export async function prepareKaelPipeline(
  input: PipelineInput,
  supabase: SupabaseLike,
  secrets: EdgeAiSecrets,
): Promise<PreparedKaelPipeline | Extract<PipelineResult, { success: false }>> {  const { serviceType, district } = input;
  const language = input.language ?? "vi";
  const problemChips = input.problemChips.map(scrubSensitiveForLLM);
  const description = scrubCustomerCaseContextForLLM(input.description);
  const modelDescription = frameUntrustedCustomerCaseEvidenceForModel(description);
  const photoUrls = sanitizeVisionPhotoUrls(input.photoUrls ?? []);
  const stageLogs: PipelineStageLog[] = [];
  const learningApplications: Extract<PipelineResult, { success: true }>["learningApplications"] = [];
  let fallbackUsed = false;
  const progressTarget = input.progressTarget ?? input.progressJobId;

  // Hard-stop customer-facing AI before any intake or provider work begins.
  if (isKaelAiKillSwitchEnabled()) {
    console.warn("kael pipeline: KAEL_AI_KILL_SWITCH on — returning unavailable state");
    return {
      success: false,
      error: KAEL_AI_UNAVAILABLE_VI,
      code: "AI_DISABLED",
      stageLogs,
    };
  }

  const electricalIntake = resolveElectricalIntakeRuntime({
    intakeDiagnosisEnabled: input.intakeDiagnosisEnabled === true,
    serviceType,
    actorId: input.actorId,
    problemChips,
    description,
    priorSafetySignals: input.priorSafetySignals,
  });
  const electricalPlaybookEnabled = electricalIntake.enabled;
  const deterministicSafetySignals = electricalIntake.safetySignals;
  const withDeterministicSafetyGuidance = createIntakeSafetyGuidance(
    language,
    deterministicSafetySignals,
  );
  const hardRoute = electricalIntake.hardRoute;
  if (hardRoute) {
    const intakeObservation = buildIntakeObservation({
      scopeSignal: hardRoute.scopeSignal,
      suggestedService: hardRoute.suggestedService,
      problemSlug: null,
      needsClarification: false,
      safetySignals: deterministicSafetySignals,
      modelId: "deterministic",
      serviceType,
      actorId: input.actorId,
      electricalPlaybookEnabled,
    });
    const hardRouteMessage = hardRoute.scopeSignal === "out_of_scope"
      ? unsupportedServiceMessage(language)
      : language === "en"
      ? "Your description does not match the selected service."
      : "Mô tả của bạn không khớp với dịch vụ đang chọn.";
    return {
      success: false,
      error: withDeterministicSafetyGuidance(hardRouteMessage),
      code: hardRoute.scopeSignal === "out_of_scope"
        ? "UNSUPPORTED"
        : "SERVICE_MISMATCH",
      stageLogs,
      suggestedService: hardRoute.suggestedService ?? undefined,
      policyReasonCode: hardRoute.reasonCode,
      intakeObservation: input.intakeDiagnosisEnabled ? intakeObservation : undefined,
    };
  }

  // Keep per-user reservations and the provider budget bound to this pipeline run.
  const {
    providerBudget,
    recordProviderSpendIfEnforced,
    spendGate,
  } = await prepareKaelPipelineSpendGate(input, supabase, stageLogs, secrets);

  // independent hard daily provider-spend ceiling. No-op +
  // zero DB round-trip unless KAEL_PROVIDER_COST_CAP_ENABLED is on; fails open. Kept as
  // a complementary operator knob alongside the §38 gate; degrade honestly here, before
  // spending on the intent + parallel provider calls. (Consolidation tracked as follow-up.)
  if (providerBudget.exhausted) {
    console.warn("kael pipeline: provider daily budget exhausted, degrading", {
      spendUsd: providerBudget.spendUsd,
      capUsd: providerBudget.capUsd,
    });
    return {
      success: false,
      error: withDeterministicSafetyGuidance(
        language === "en"
          ? "Kael is temporarily overloaded. Please try again in a few minutes."
          : "Kael đang tạm quá tải. Vui lòng thử lại sau ít phút.",
      ),
      code: "BUDGET_EXCEEDED",
      stageLogs,
    };
  }
  // Record the AI spend incurred by this estimate (intent + parallel + synthesis)
  // once it is known. Only when enforcement is on; reads the final stageLogs at
  // call time. Awaited so the daily counter stays accurate before we return.
  // the intermediate stage-progress writes are fire-and-forget.
  // updateKaelProgress swallows its own errors (returns void, never throws), the
  // open SSE stream hears each write in-process at call time, and each write
  // is followed by awaited stage work that keeps the isolate alive long enough
  // to flush it. Only the terminal progress:1 write stays awaited so the
  // completed state is durably persisted before the response returns.
  void updateKaelProgress(supabase, progressTarget, {
    stage: "intent_classification",
    status: "running",
    progress: 0.1,
  });
  return {
    input,
    supabase,
    secrets,
    serviceType,
    district,
    language,
    problemChips,
    description,
    modelDescription,
    photoUrls,
    stageLogs,
    learningApplications,
    progressTarget,
    electricalPlaybookEnabled,
    deterministicSafetySignals,
    withDeterministicSafetyGuidance,
    spendGate,
    recordProviderSpendIfEnforced,
  };
}
