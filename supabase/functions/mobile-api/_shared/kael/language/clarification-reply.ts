// Reads a customer reply to a pending Kael question as two independent signals: does it ask for an
// explanation, and does it carry case content. The explanation route is taken only for the first
// without the second, so a unit, a count or a correction in the same message is never dropped.
// Every phrase matches whole words at the start of a clause (after politeness fillers), which is what
// keeps "Sao Mai 1HP", "tại Sao Mai" and "Thợ trước giải thích là hỏng tụ" out of the question route.

export type ClarificationReplyReading = {
  readonly asksQuestion: boolean;
  readonly carriesFacts: boolean;
};

export const UNKNOWN_REPLY_PATTERNS = [
  "khong biet",
  "khong ro",
  "chua ro",
  "chua biet",
  "khong chac",
  "not sure",
  "unsure",
  "do not know",
  "dont know",
  "don't know",
] as const;

// A longer message is never a bare explanation request; treating it as carrying facts keeps it on the
// answer path and bounds the work done per reply.
const MAX_READ_CHARS = 1_000;
const MAX_LEAD_FILLERS = 6;
const CLAUSE_PATTERN = /[^.!?;,\r\n]+[.!?;,\r\n]*/g;

const LEAD_FILLERS = new Set([
  "ua", "u", "a", "da", "vang", "oi", "nhe", "vay", "the", "ma", "nhung", "thi", "co", "cho",
  "toi", "minh", "em", "anh", "chi", "ban", "kael", "xin", "loi", "hoi", "hay", "vui", "long", "giup",
  "um", "uh", "hey", "hi", "so", "but", "and", "well", "ok", "okay", "sorry", "please", "pls", "wait", "hmm",
]);

const ACK_WORDS = new Set([
  "da", "vang", "u", "uh", "a", "ah", "oi", "ne", "nhe", "nha", "nhi", "ha", "vay", "the", "day", "luon",
  "ok", "oke", "okay", "xin", "loi", "cam", "on", "thanks", "thank", "you", "please", "sorry",
  "kael", "anh", "chi", "em", "ban", "minh",
]);

const OPEN_WHY_LEADS = ["why", "how come"];
const VIETNAMESE_WHY_LEADS = ["tai sao", "vi sao"];
const EXPLAIN_LEADS = ["giai thich", "noi ro", "explain", "clarify"];
const MEANING_PHRASES = [
  " nghia la sao ", " nghia la gi ", " y la gi ", " y ban la gi ", " y anh la gi ", " y chi la gi ",
  " la nhu nao ", " la sao ", " what do you mean ", " what does that mean ", " what does it mean ",
];

// Words that make "tại sao ..." / "vì sao ..." / "sao ..." a question about Kael's process rather than a
// place or building name that happens to start with "Sao".
const WHY_CONTEXT = new Set([
  "chua", "van", "con", "thieu", "du", "gia", "bao", "hoi", "can", "phai", "lai", "cu", "hoai",
  "khong", "vay", "the", "nay", "kia", "duoc", "nua", "co", "ma", "tinh", "ra", "kael", "quote", "price",
]);
const SAO_FOLLOWERS = new Set([
  "chua", "van", "con", "lai", "cu", "hoai", "khong", "phai", "can", "thieu", "vay", "the", "ma", "hoi",
  "bao", "du", "nua", "kael", "ra",
]);
// "I do not understand" is a reaction to the question, not information about the case.
const CONFUSION_PHRASES = ["khong hieu", "chua hieu", "kho hieu", "dont understand", "do not understand", "dont get", "confused"];
const INFO_WORDS = new Set(["thong", "tin", "lieu", "kien", "tiet"]);
const MISSING_WORDS = new Set(["missing", "need", "needed", "required", "lacking"]);
const NEED_QUESTION =
  /^(?:con )?can (?:them |nhung |cai )?(?:biet )?(?:(?:thong tin|chi tiet|du lieu|du kien) )?(?:gi|nao)\b/;

export function normalizeClarificationReply(value: string) {
  return value.trim().toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

export function readClarificationReply(message: string): ClarificationReplyReading {
  if (message.length > MAX_READ_CHARS) return { asksQuestion: false, carriesFacts: true };
  let asksQuestion = false;
  let carriesFacts = false;
  for (const clause of message.match(CLAUSE_PATTERN) ?? []) {
    const tokens = tokensOf(clause);
    if (tokens.length === 0) continue;
    if (clauseAsksQuestion(tokens, clause.includes("?"))) asksQuestion = true;
    else if (!isNonFactClause(tokens) && !tokens.every((token) => ACK_WORDS.has(token))) carriesFacts = true;
  }
  return { asksQuestion, carriesFacts };
}

function tokensOf(clause: string) {
  return normalizeClarificationReply(clause)
    .replace(/['’`]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isNonFactClause(tokens: readonly string[]) {
  const joined = tokens.join(" ");
  if (UNKNOWN_REPLY_PATTERNS.some((pattern) => joined.includes(pattern))) return true;
  return !tokens.some((token) => /\d/.test(token)) && CONFUSION_PHRASES.some((phrase) => joined.includes(phrase));
}

function skipLeadFillers(tokens: readonly string[]) {
  let index = 0;
  while (index < tokens.length && index < MAX_LEAD_FILLERS) {
    const token = tokens[index];
    if (LEAD_FILLERS.has(token)) index += 1;
    else if ((token === "can" || token === "could" || token === "would") && tokens[index + 1] === "you") {
      index += 2;
    } else break;
  }
  return tokens.slice(index);
}

function startsWithPhrase(tokens: readonly string[], phrase: string) {
  return phrase.split(" ").every((word, index) => tokens[index] === word);
}

function clauseAsksQuestion(tokens: readonly string[], hasQuestionMark: boolean) {
  const rest = skipLeadFillers(tokens);
  if (rest.length === 0) return false;
  const hasDigit = rest.some((token) => /\d/.test(token));

  if (OPEN_WHY_LEADS.some((lead) => startsWithPhrase(rest, lead))) return true;
  const whyLead = VIETNAMESE_WHY_LEADS.find((lead) => startsWithPhrase(rest, lead));
  if (whyLead) {
    const tail = rest.slice(2);
    return tail.length === 0 || tail.some((token) => WHY_CONTEXT.has(token));
  }
  if (rest[0] === "sao") {
    if (rest.length === 1) return true;
    // "mai" is both the name "Sao Mai" and "mãi" (all the time), so it counts only when a process word follows.
    if (rest[1] === "mai") return WHY_CONTEXT.has(rest[2] ?? "");
    return SAO_FOLLOWERS.has(rest[1]);
  }

  const joined = rest.join(" ");
  const missingStart = rest[0] === "thieu" || (rest[0] === "con" && rest[1] === "thieu");
  if (
    missingStart && !hasDigit &&
    (rest.some((token) => token === "gi" || token === "nao") ||
      (hasQuestionMark && rest.some((token) => INFO_WORDS.has(token))))
  ) return true;
  if (NEED_QUESTION.test(joined)) return true;
  if (
    rest[0] === "what" && rest[1] !== "i" && !hasDigit &&
    rest.some((token) => MISSING_WORDS.has(token))
  ) return true;

  if (EXPLAIN_LEADS.some((lead) => startsWithPhrase(rest, lead))) return !hasDigit;
  const padded = ` ${tokens.join(" ")} `;
  return tokens.length <= 8 && !tokens.some((token) => /\d/.test(token)) &&
    MEANING_PHRASES.some((phrase) => padded.includes(phrase));
}
