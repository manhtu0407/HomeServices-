import type { KaelPromptActor, KaelPromptLanguage } from "./system-prompt.ts";

export type KaelSelfCheckReason =
  | "empty"
  | "fear_language"
  | "absolute_claim"
  | "ai_self_reference"
  | "casual_slang"
  | "buzzword"
  | "accusatory_in_dispute"
  | "aggressive_response"
  | "exact_vnd"
  | "language_mismatch"
  | "sentence_too_long"
  | "semantic_guardrail";

export type KaelSelfCheckInput = {
  readonly text: string;
  readonly actor: KaelPromptActor;
  readonly language?: KaelPromptLanguage;
  readonly semanticGuardEnabled?: boolean;
  readonly semanticClassifier?: KaelSemanticGuardClassifier;
};

export type KaelSelfCheckResult = {
  readonly allowed: boolean;
  readonly text: string;
  readonly reason?: KaelSelfCheckReason;
  readonly guardrailLabel?: KaelSemanticGuardLabel;
};

export type KaelSelfCheckPipelineInput = KaelSelfCheckInput & {
  readonly regenerate?: () => string;
  readonly fallbackText: string;
};

export type KaelSelfCheckPipelineResult = KaelSelfCheckResult & {
  readonly used_regeneration: boolean;
  readonly used_fallback: boolean;
};

export type KaelSemanticGuardLabel =
  | "fear_language"
  | "absolute_claim"
  | "ai_self_reference"
  | "exact_price"
  | "accusatory_dispute"
  | "pii_or_secret";

export type KaelSemanticGuardClassifier = (input: {
  readonly text: string;
  readonly actor: KaelPromptActor;
  readonly language?: KaelPromptLanguage;
  readonly suspicionLabels: readonly KaelSemanticGuardLabel[];
}) => { allowed: boolean; label?: KaelSemanticGuardLabel };

export type KaelGuardrailTripClient = {
  from(table: string): {
    insert(value: Record<string, unknown>): PromiseLike<unknown>;
  };
};

const FORBIDDEN_PHRASES: Record<Exclude<KaelSelfCheckReason, "empty" | "exact_vnd" | "language_mismatch" | "sentence_too_long" | "semantic_guardrail">, readonly string[]> = {
  fear_language: [
    "nguy hiem chet nguoi",
    "chay no tuc thi",
    "tu vong",
    "khong cuu kip",
    "pha huy hoan toan",
  ],
  absolute_claim: [
    "chac chan 100%",
    "khong bao gio",
    "tuyet doi an toan",
    "guaranteed",
    "dam bao khong loi",
  ],
  ai_self_reference: [
    "as an ai",
    "toi la ai",
    "toi la chatbot",
    "ai language model",
  ],
  casual_slang: [
    "ok dm",
    "vai",
    "om",
    "a uh",
  ],
  buzzword: [
    "synergy",
    "leverage",
    "paradigm shift",
    "revolutionary",
    "game-changing",
  ],
  accusatory_in_dispute: [
    "ban dang de doa",
    "hanh vi khong chap nhan",
    "vui long dung viec",
    "kael phat hien ban dang",
    "yeu cau cua ban khong hop ly",
    "ban dang lua kael",
    "khong the chap nhan",
    "ban can binh tinh",
  ],
  aggressive_response: [
    "toi se khong tra loi",
    "day la yeu cau vo ly",
    "ban can kiem che",
    "toi tu choi",
    "he thong khong cho phep dieu do",
    "ban da sai",
  ],
};

export const KAEL_SELF_CHECK_FORBIDDEN_PHRASES = FORBIDDEN_PHRASES;

const EXACT_VND_PATTERN = /\b\d+(?:[.,]\d+)*\s*(?:vnd|dong)\b/i;
const CUSTOMER_SENTENCE_WORD_CAP = 20;
const ENGLISH_SIGNAL_WORDS = [
  "this",
  "answer",
  "english",
  "only",
  "cannot",
  "help",
  "please",
  "provide",
  "customer",
  "worker",
];

export function checkKaelResponse(input: KaelSelfCheckInput): KaelSelfCheckResult {
  const text = input.text.trim();
  if (!text) {
    return { allowed: false, text, reason: "empty" };
  }

  const lower = text.toLowerCase();
  for (const [reason, phrases] of Object.entries(FORBIDDEN_PHRASES) as Array<[
    Exclude<KaelSelfCheckReason, "empty" | "exact_vnd" | "language_mismatch" | "sentence_too_long" | "semantic_guardrail">,
    readonly string[],
  ]>) {
    if (phrases.some((phrase) => lower.includes(phrase))) {
      return { allowed: false, text, reason };
    }
  }

  if (EXACT_VND_PATTERN.test(text)) {
    return { allowed: false, text, reason: "exact_vnd" };
  }

  if ((input.language ?? "vi") === "vi" && looksEnglishOnly(lower)) {
    return { allowed: false, text, reason: "language_mismatch" };
  }

  if (input.semanticGuardEnabled) {
    const suspicionLabels = detectSemanticGuardSuspicion(text);
    if (suspicionLabels.length > 0) {
      const decision = input.semanticClassifier
        ? input.semanticClassifier({
          text,
          actor: input.actor,
          language: input.language,
          suspicionLabels,
        })
        : defaultSemanticGuardClassifier(suspicionLabels);
      if (!decision.allowed) {
        return {
          allowed: false,
          text,
          reason: "semantic_guardrail",
          guardrailLabel: decision.label ?? suspicionLabels[0],
        };
      }
    }
  }

  if (input.actor === "customer" && hasSentenceOverWordCap(text, CUSTOMER_SENTENCE_WORD_CAP)) {
    return { allowed: false, text, reason: "sentence_too_long" };
  }

  return { allowed: true, text };
}

export function runKaelSelfCheckPipeline(
  input: KaelSelfCheckPipelineInput,
): KaelSelfCheckPipelineResult {
  const first = checkKaelResponse(input);
  if (first.allowed) {
    return {
      ...first,
      used_regeneration: false,
      used_fallback: false,
    };
  }

  if (input.regenerate) {
    const regeneratedText = input.regenerate();
    const regenerated = checkKaelResponse({
      text: regeneratedText,
      actor: input.actor,
      language: input.language,
      semanticGuardEnabled: input.semanticGuardEnabled,
      semanticClassifier: input.semanticClassifier,
    });
    if (regenerated.allowed) {
      return {
        ...regenerated,
        used_regeneration: true,
        used_fallback: false,
      };
    }
  }

  return {
    allowed: false,
    text: input.fallbackText,
    reason: first.reason,
    used_regeneration: Boolean(input.regenerate),
    used_fallback: true,
  };
}

export async function auditKaelGuardrailTrip(
  client: KaelGuardrailTripClient,
  input: {
    readonly jobId?: string | null;
    readonly actorId?: string | null;
    readonly actorRole: KaelPromptActor;
    readonly surface: string;
    readonly reason: KaelSelfCheckReason | string;
    readonly guardrailLabel?: string | null;
    readonly source: "self_check" | "semantic_self_check" | "boundary_guard" | "autonomy_gate";
    readonly safeMetadata?: Record<string, unknown>;
  },
) {
  await client.from("kael_guardrail_trip_audit").insert({
    job_id: input.jobId ?? null,
    actor_id: input.actorId ?? null,
    actor_role: input.actorRole,
    surface: input.surface,
    reason_code: input.reason,
    guardrail_label: input.guardrailLabel ?? null,
    source: input.source,
    safe_metadata: input.safeMetadata ?? {},
  });
}

function looksEnglishOnly(lower: string): boolean {
  const signalCount = ENGLISH_SIGNAL_WORDS.reduce(
    (count, word) => count + (new RegExp(`\\b${word}\\b`, "i").test(lower) ? 1 : 0),
    0,
  );
  const vietnameseServiceSignal = /\b(kael|ghi|nhan|thong|tin|huong|dan|buoc|tiep|theo|sua|dien|nuoc|don|dep|tho|khach)\b/i.test(lower);
  return signalCount >= 3 && !vietnameseServiceSignal;
}

function hasSentenceOverWordCap(text: string, cap: number): boolean {
  return text
    .split(/[.!?;\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .some((sentence) => sentence.split(/\s+/).filter(Boolean).length > cap);
}

function detectSemanticGuardSuspicion(text: string): KaelSemanticGuardLabel[] {
  const normalized = normalizeText(text);
  const labels: KaelSemanticGuardLabel[] = [];

  if (
    /neu khong (?:sua|lam|xu ly) ngay/.test(normalized) ||
    /co the (?:lam sap|gay chay lon|gay hau qua nghiem trong)/.test(normalized) ||
    /nha ban se (?:hong|chay|ngap|hu) (?:het|nang)/.test(normalized)
  ) {
    labels.push("fear_language");
  }
  if (
    /khong co bat ky rui ro nao/.test(normalized) ||
    /luon luon (?:dung|an toan|chinh xac)/.test(normalized) ||
    /cam ket (?:khong loi|ket qua chinh xac)/.test(normalized)
  ) {
    labels.push("absolute_claim");
  }
  if (
    /toi chi la (?:mo hinh|tro ly ao)/.test(normalized) ||
    /vi toi duoc lap trinh/.test(normalized) ||
    /he thong ai cua toi/.test(normalized)
  ) {
    labels.push("ai_self_reference");
  }
  if (
    /gia chot dung (?:nam tram|mot trieu|hai trieu|ba trieu)/.test(normalized) ||
    /tra dung so tien nay/.test(normalized)
  ) {
    labels.push("exact_price");
  }
  if (
    /ben kia dang noi doi/.test(normalized) ||
    /tho da lua ban/.test(normalized) ||
    /khach dang co tinh an van/.test(normalized)
  ) {
    labels.push("accusatory_dispute");
  }
  if (
    /\b(?:0|\+?84)[1-9]\d{8,9}\b/.test(text) ||
    /\bpplx-[A-Za-z0-9_-]{20,}\b/.test(text) ||
    /\bsk-[A-Za-z0-9_-]{20,}\b/.test(text)
  ) {
    labels.push("pii_or_secret");
  }

  return Array.from(new Set(labels));
}

function defaultSemanticGuardClassifier(
  suspicionLabels: readonly KaelSemanticGuardLabel[],
) {
  return {
    allowed: suspicionLabels.length === 0,
    label: suspicionLabels[0],
  };
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
