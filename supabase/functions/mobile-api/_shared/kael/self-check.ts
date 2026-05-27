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
  | "sentence_too_long";

export type KaelSelfCheckInput = {
  readonly text: string;
  readonly actor: KaelPromptActor;
  readonly language?: KaelPromptLanguage;
};

export type KaelSelfCheckResult = {
  readonly allowed: boolean;
  readonly text: string;
  readonly reason?: KaelSelfCheckReason;
};

export type KaelSelfCheckPipelineInput = KaelSelfCheckInput & {
  readonly regenerate?: () => string;
  readonly fallbackText: string;
};

export type KaelSelfCheckPipelineResult = KaelSelfCheckResult & {
  readonly used_regeneration: boolean;
  readonly used_fallback: boolean;
};

const FORBIDDEN_PHRASES: Record<Exclude<KaelSelfCheckReason, "empty" | "exact_vnd" | "language_mismatch" | "sentence_too_long">, readonly string[]> = {
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
    Exclude<KaelSelfCheckReason, "empty" | "exact_vnd" | "language_mismatch" | "sentence_too_long">,
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
