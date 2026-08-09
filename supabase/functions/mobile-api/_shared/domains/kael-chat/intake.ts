import { compactMetadata } from "../../platform/domain-utils.ts";
import { sanitizeApartmentAccessProfile } from "../worker/apartment-access.ts";
import {
  normalizeServiceAreaDistrict,
  sanitizeForLLM,
  type KaelChatCreateInput,
} from "../../../../_shared/domain.ts";
import {
  buildInitialDiagnosisScopeArtifact,
  kaelDiagnosisScopeArtifactSchema,
  type KaelDiagnosisScopeArtifact,
} from "../../kael/index.ts";
import { buildKaelIntakeConfirmation } from "../../kael/pipeline/intake-confirmation.ts";
import {
  sanitizeCustomerCaseEvidenceText,
  sanitizeUntrustedEvidenceList,
} from "../../kael/evidence/untrusted-evidence.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  caseWorkVoiceTranscript,
  mergeCaseWorkEvidence,
  sanitizeCaseWorkEvidenceItems,
} from "./case-work-context.ts";
import { createSignedVisionUrls } from "./media-vision.ts";
import { validateAndConsumeKaelChatEvidenceMediaRefs } from "./media-upload.ts";

type PrepareInitialKaelChatIntakeInput = {
  readonly ctx: MobileApiContext;
  readonly input: KaelChatCreateInput;
  readonly language: "vi" | "en";
  readonly safeProblemChips: readonly string[];
  readonly initialSafetySignals: readonly string[];
};

export function resolveKaelChatAddressDistrict(
  ...candidates: ReadonlyArray<string | null | undefined>
) {
  for (const candidate of candidates) {
    const direct = normalizeServiceAreaDistrict(candidate);
    if (direct) return direct;

    const inlineDistrict = candidate?.match(
      /(?:^|[^\p{L}\p{N}])((?:quận|quan|q|district|dist)[\s.]*(?:1[0-2]|[1-9])|bình\s*thạnh|binh\s*thanh|thủ\s*đức|thu\s*duc)(?![\p{L}\p{N}])/iu,
    )?.[1];
    const extractedInlineDistrict = normalizeServiceAreaDistrict(inlineDistrict);
    if (extractedInlineDistrict) return extractedInlineDistrict;

    for (const segment of candidate?.split(/[,;\u2013\u2014\u00b7|/]/) ?? []) {
      const extracted = normalizeServiceAreaDistrict(segment);
      if (extracted) return extracted;
    }
  }
  return null;
}

function buildBookingIntakeConfirmation(input: {
  intake: KaelChatCreateInput;
  description: string;
  problemChips: readonly string[];
  addressDistrict: string | null;
  language: "vi" | "en";
}) {
  if (input.intake.intake_source !== "booking") return null;
  return buildKaelIntakeConfirmation({
    serviceType: input.intake.service_type,
    profileId: input.intake.profile_id!,
    description: input.description,
    problemChips: input.problemChips,
    addressLabel: input.intake.address_label ?? "",
    addressDistrict: input.addressDistrict ?? "",
    scheduledAt: input.intake.scheduled_at!,
    scheduleWindow: input.intake.schedule_window!,
    language: input.language,
  });
}

export async function prepareInitialKaelChatIntake(
  input: PrepareInitialKaelChatIntakeInput,
) {
  const {
    ctx,
    input: chatInput,
    language,
    safeProblemChips,
    initialSafetySignals,
  } = input;
  const inputForSession = chatInput;
  const initialEvidenceItems = sanitizeCaseWorkEvidenceItems(inputForSession.evidence_items ?? []);
  const initialEvidenceRefs = await validateAndConsumeKaelChatEvidenceMediaRefs(
    ctx,
    initialEvidenceItems.flatMap((evidence) => evidence.ref ? [evidence.ref] : []),
    ctx.user.id,
  );
  // Decode/transform every model-visible image before creating any durable
  // session or artifact. Consumed intents are retry-safe, so a transient
  // transform failure cannot leave a poisoned case-work record behind.
  const initialSignedVisionUrls = await createSignedVisionUrls(
    ctx,
    initialEvidenceItems,
    ctx.user.id,
  );
  const initialVoiceTranscript = caseWorkVoiceTranscript(initialEvidenceItems);
  const initialAddressDistrict = resolveKaelChatAddressDistrict(
    inputForSession.address_district,
    inputForSession.message,
  );
  const intakeDescription = sanitizeCustomerCaseEvidenceText(
    sanitizeForLLM(inputForSession.intake_description ?? inputForSession.message ?? ""),
  );
  const intakeConfirmation = buildBookingIntakeConfirmation({
    intake: inputForSession,
    description: intakeDescription,
    problemChips: safeProblemChips,
    addressDistrict: initialAddressDistrict,
    language,
  });
  const metadata = compactMetadata({
    problem_chips: safeProblemChips,
    language,
    // A zero-turn session is valid when the caller intentionally starts an
    // empty conversation. Persist that distinction so an idempotent replay is
    // not mistaken for an in-flight session forever.
    initial_turn_expected: Boolean(inputForSession.message),
    profile_id: inputForSession.profile_id ?? null,
    intake_source: inputForSession.intake_source ?? "direct_chat",
    intake_description: intakeDescription || undefined,
    intake_confirmation: intakeConfirmation ?? undefined,
    address_label: inputForSession.address_label ?? null,
    address_district: initialAddressDistrict,
    apartment_access_profile: sanitizeApartmentAccessProfile(
      inputForSession.apartment_access_profile,
    ),
    evidence_media_refs: initialEvidenceRefs,
    evidence_kinds: initialEvidenceItems.map((evidence) => evidence.kind),
    private_video_evidence_count: initialEvidenceItems.filter((evidence) =>
      evidence.kind === "video_original_private"
    ).length,
    schedule_window: inputForSession.schedule_window ?? null,
    demanding_customer_qa_count: inputForSession.message ? 1 : undefined,
    intake_safety_signals: initialSafetySignals.length > 0 ? initialSafetySignals : undefined,
  });
  const initialArtifact = buildInitialDiagnosisScopeArtifact({
    serviceType: inputForSession.service_type,
    customerGoal: intakeDescription ||
      safeProblemChips.join(" ") || inputForSession.service_type,
  });
  const initialDiagnosisScope = kaelDiagnosisScopeArtifactSchema.parse({
    ...initialArtifact,
    evidence: mergeCaseWorkEvidence(initialArtifact.evidence, initialEvidenceItems),
    facts: {
      ...initialArtifact.facts,
      ...(initialVoiceTranscript
        ? { latest_voice_transcript: sanitizeCustomerCaseEvidenceText(initialVoiceTranscript) }
        : {}),
    },
    updated_at: new Date().toISOString(),
  });
  return {
    initialEvidenceItems,
    initialEvidenceRefs,
    initialSignedVisionUrls,
    initialAddressDistrict,
    intakeConfirmation,
    metadata,
    initialDiagnosisScope,
  };
}
