import { scrubSensitiveForLLM } from "./utils.ts";

export type VoiceTranscriptActor = "customer" | "worker";
export type VoiceTranscriptSource = "on_device_stt" | "typed";
export type VoiceRegionHint = "bac" | "trung" | "nam" | "unknown";

export type VoiceTranscriptRow = {
  readonly user_id: string;
  readonly session_id: string | null;
  readonly actor_role: VoiceTranscriptActor;
  readonly source: VoiceTranscriptSource;
  readonly scrubbed_text: string;
  readonly region_hint: VoiceRegionHint;
  readonly safe_metadata: Record<string, unknown>;
};

// Defense in depth: after scrubSensitiveForLLM, refuse anything that still contains
// a raw phone, email, or long digit run.
const RESIDUAL_PII: readonly RegExp[] = [
  /\b0\d{8,10}\b/,
  /\b\+?84\d{8,10}\b/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b\d{9,}\b/,
];

export function scrubTranscriptForStorage(text: string): {
  readonly ok: boolean;
  readonly scrubbed: string;
} {
  const scrubbed = scrubSensitiveForLLM(text).replace(/\s+/g, " ").trim();
  const clean = RESIDUAL_PII.every((pattern) => !pattern.test(scrubbed));
  return { ok: clean && scrubbed.length > 0, scrubbed };
}

export function buildVoiceTranscriptRow(input: {
  readonly userId: string;
  readonly sessionId?: string | null;
  readonly actorRole?: VoiceTranscriptActor;
  readonly text: string;
  readonly source?: VoiceTranscriptSource;
  readonly regionHint?: VoiceRegionHint;
}): VoiceTranscriptRow | null {
  const { ok, scrubbed } = scrubTranscriptForStorage(input.text);
  if (!ok) return null;
  return {
    user_id: input.userId,
    session_id: input.sessionId ?? null,
    actor_role: input.actorRole ?? "customer",
    source: input.source ?? "on_device_stt",
    scrubbed_text: scrubbed,
    region_hint: input.regionHint ?? "unknown",
    safe_metadata: {},
  };
}
