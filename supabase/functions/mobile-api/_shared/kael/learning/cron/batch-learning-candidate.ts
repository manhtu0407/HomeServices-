import {
  learningSkillCandidateSchema,
  type LearningSkillCandidate,
} from "../skills/registry.ts";

export function parseBatchLearningCandidate(
  message: unknown,
): { ok: true; candidate: LearningSkillCandidate } | { ok: false; reason: string } {
  const direct = parseCandidateObject(readCandidateContainer(message));
  if (direct.ok) return direct;

  const text = extractBatchMessageText(message);
  if (!text) return { ok: false, reason: "LEARNING_RESULT_EMPTY" };

  const parsed = parseJsonObjectFromText(text);
  if (!parsed.ok) return { ok: false, reason: "LEARNING_RESULT_JSON_INVALID" };
  return parseCandidateObject(readCandidateContainer(parsed.value));
}

function parseCandidateObject(
  value: unknown,
): { ok: true; candidate: LearningSkillCandidate } | { ok: false; reason: string } {
  const result = learningSkillCandidateSchema.safeParse(value);
  return result.success
    ? { ok: true, candidate: result.data }
    : { ok: false, reason: "LEARNING_CANDIDATE_SCHEMA_INVALID" };
}

function readCandidateContainer(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (isRecord(value.candidate)) return value.candidate;
  if (isRecord(value.learning_candidate)) return value.learning_candidate;
  return value;
}

function extractBatchMessageText(message: unknown): string | null {
  if (typeof message === "string") return message;
  if (!isRecord(message)) return null;
  if (typeof message.text === "string") return message.text;
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return null;
  const text = message.content
    .map((item) => isRecord(item) && typeof item.text === "string" ? item.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
}

function parseJsonObjectFromText(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    // Anthropic batch outputs may wrap JSON in a short note. Walk the first
    // balanced object so braces inside strings do not widen the parse window.
  }

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char !== "}") continue;
    depth -= 1;
    if (depth === 0 && start >= 0) {
      try {
        return { ok: true, value: JSON.parse(text.slice(start, index + 1)) };
      } catch {
        return { ok: false };
      }
    }
  }
  return { ok: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
