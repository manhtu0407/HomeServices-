import { db, dbQuery } from "../../platform/db.ts";
import { parseKaelProgressSnapshot } from "../../platform/job-state.ts";
import { serializeKaelSession, serializeKaelTurn } from "./serialize.ts";
import { assertKaelSessionOwnership } from "./session-store.ts";
import { createSignedCaseWorkEvidenceUrls } from "./media-vision.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { findKaelConfirmationOperation } from "./confirmation-operation.ts";

export async function getKaelChat(ctx: MobileApiContext, sessionId: string) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select(
        "id, job_id, customer_id, service_type, status, case_phase, diagnosis_scope, scheduled_at, started_at, estimate_ready_at, total_turns, total_cost_usd, safe_metadata, created_at",
      )
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  assertKaelSessionOwnership(sessionResult.data, ctx);

  const turnsResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_chat_turns")
      .select(
        "id, session_id, turn_index, role, content_type, text_content, media_refs, safe_metadata, created_at",
      )
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: true }),
  );
  if (turnsResult.error) {
    apiFailure("DB_ERROR", "Không thể tải lịch sử Kael", 500);
  }

  const turns = (turnsResult.data ?? []).map(serializeKaelTurn);
  const latestEstimate = [...turns]
    .reverse()
    .find((turn) => turn.content_type === "estimate")?.estimate ?? null;
  const session = serializeKaelSession(sessionResult.data, latestEstimate, turns);
  const confirmationOperation = session.job_id
    ? await findKaelConfirmationOperation(ctx, sessionId)
    : null;
  const evidencePreviewCandidates = kaelEvidencePreviewCandidates(
    session.diagnosis_scope?.evidence ?? [],
  );
  const evidencePreviewUrls = evidencePreviewCandidates.length > 0
    ? await createSignedCaseWorkEvidenceUrls(
      ctx,
      evidencePreviewCandidates.map((candidate) => candidate.ref),
      session.customer_id,
    )
    : [];

  return {
    session: {
      ...session,
      confirmation_operation: confirmationOperation,
      next_action: confirmationOperation && !confirmationOperation.terminal
        ? "reconcile_confirmation"
        : session.next_action,
      evidence_previews: pairKaelEvidencePreviewUrls(
        evidencePreviewCandidates,
        evidencePreviewUrls,
      ),
    },
    turns,
  };
}

export async function getKaelChatProgress(
  ctx: MobileApiContext,
  sessionId: string,
) {
  return readKaelChatProgressSnapshot(ctx, sessionId);
}

export async function readKaelChatProgressSnapshot(
  ctx: MobileApiContext,
  sessionId: string,
) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, customer_id, kael_progress")
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  assertKaelSessionOwnership(sessionResult.data, ctx);

  return {
    session_id: sessionId,
    progress: parseKaelProgressSnapshot(sessionResult.data.kael_progress, sessionId),
  };
}

export type KaelEvidencePreview = {
  evidence_index: number;
  evidence_kind: "photo" | "video_frame";
  url: string;
};

export type KaelEvidencePreviewCandidate = {
  evidenceIndex: number;
  evidenceKind: "photo" | "video_frame";
  ref: string;
};

type KaelEvidencePreviewInput = {
  kind?: unknown;
  model_eligible?: unknown;
  ref?: unknown;
};

export function kaelEvidencePreviewCandidates(
  evidence: readonly KaelEvidencePreviewInput[],
): KaelEvidencePreviewCandidate[] {
  const counters = { photo: 0, video_frame: 0 };
  return evidence.flatMap((item) => {
    if (
      (item.kind !== "photo" && item.kind !== "video_frame") ||
      item.model_eligible === false ||
      typeof item.ref !== "string" ||
      !item.ref.trim()
    ) return [];
    const evidenceKind = item.kind;
    const evidenceIndex = ++counters[evidenceKind];
    return [{ evidenceIndex, evidenceKind, ref: item.ref.trim() }];
  });
}

export function pairKaelEvidencePreviewUrls(
  candidates: readonly KaelEvidencePreviewCandidate[],
  urls: readonly string[],
): KaelEvidencePreview[] {
  if (candidates.length !== urls.length) return [];
  return candidates.map((candidate, index) => ({
    evidence_index: candidate.evidenceIndex,
    evidence_kind: candidate.evidenceKind,
    url: urls[index],
  }));
}
