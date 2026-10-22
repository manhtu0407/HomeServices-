export const APPLIANCE_REQUEST_KEYWORDS: readonly string[] = [
  "tu lanh",
  "may giat",
  "may say",
  "may rua bat",
  "may rua chen",
  "lo vi song",
  "bep ga",
  "bep tu",
  "binh nong lanh",
  "may bom",
  "wifi",
  "internet",
];

const REPAIR_ACT_WORDS = ["sua chua", "sua", "khac phuc", "kiem tra", "bao tri", "bao duong", "bao hanh", "xem", "coi", "kham", "fix", "repair", "check", "inspect", "service"];
const REQUEST_FRAME_WORDS = ["can phai", "can", "nho", "muon", "xin", "phai", "giup", "goi", "tim", "thue", "moi", "yeu cau", "mong", "vui long", "lam on", "dang can", "dang tim"];
const REQUEST_TOKEN_WORDS = ["ky thuat", "ky su", "nhan vien", "tho", "ban", "anh", "chi", "chu", "bac", "em", "toi", "minh", "den", "qua", "ghe", "lai", "nha", "gap", "ngay", "luon", "giup", "dum", "voi", "nhe", "a", "oi", "di", "cho"];
const REPAIR_ACTS = REPAIR_ACT_WORDS.join("|");
const ANY_ACTS = `${REPAIR_ACTS}|lap dat|lap|cai dat|install|replace`;
const ACT_FILLERS = "lai|giup|dum|cho|luon|cai|chiec|may|bo|dong|gap|ngay|nhanh|som|voi|nhe|nha|ca|em|anh|chi|minh|toi|tui";
const REQUEST_FRAME = REQUEST_FRAME_WORDS.join("|");
const REQUEST_TOKENS = REQUEST_TOKEN_WORDS.join("|");
const BARE_REQUEST_PHRASES: ReadonlySet<string> = new Set([...REPAIR_ACT_WORDS, ...REQUEST_FRAME_WORDS, ...REQUEST_TOKEN_WORDS]);

const FAULT_BARE = "hu(?: hong)?|hong|loi|ro ri|ro nuoc|ro dien|chay nuoc|dong tuyet|dong bang|rung(?: lac)?|keu(?: to| la| ten| ro)?|co mui (?:la|khet|hoi)|bao loi|chap chon|mat (?:ket noi|mang|song|nuoc|dien|nguon|tin hieu)|rot (?:mang|ket noi)|co van de|co su co|gap (?:su co|van de|loi)|truc trac|ngung (?:hoat dong|chay)|khong on dinh|(?:rat |qua |hoi |kha )?(?:yeu|cham)";
const FAULT_BI = "bi (?:hu|hong|loi|ket(?! noi)|dung|treo|liet|cham|yeu|ro|rot|truc trac|mat|ngung|dong tuyet|chap)";
const FAULT_FUNCTION = "khong(?: (?:duoc|con|the|hay))? (?:chay|hoat dong|len(?: nguon| lua)?|vao dien|vao duoc|co (?:mang|song|nuoc|dien|nguon|tin hieu)|ket noi|lanh|nong|say|kho|vat|giat|xa(?: nuoc)?|thoat nuoc|cap nuoc|hut|quay|xoay|nhan(?: noi)?|danh lua|bat|tat|khoi dong|dong da|lam da|mo|sang|dung|su dung|xai|truy cap|vao mang|ra nuoc)";
const FAULT = `(?:${FAULT_BI}|${FAULT_BARE}|${FAULT_FUNCTION})`;

const FAULT_AFTER = new RegExp(`^(?: (?!(?:khong|chua|chang|dau|hay|hoac|va|voi|cung|do|vi|tai|nghi|ma|nhung|de|neu)\\b)[a-z0-9]+){0,4}(?: hay)? ${FAULT}\\b`);
const ACT_BEFORE = new RegExp(`\\b(?:${ANY_ACTS})(?: (?:${ACT_FILLERS})){0,3} $`);
const ACT_ANYWHERE = new RegExp(`\\b(?:${ANY_ACTS})\\b`, "g");
const ACT_AFTER = new RegExp(`^(?: [a-z0-9]+){0,4} (?:${REQUEST_FRAME})(?: (?:${REQUEST_TOKENS})){0,6} (${REPAIR_ACTS})\\b(?! (?:xong|roi|hoan tat))`);
const FAULT_CONTINUATION = new RegExp(`^(?:(?:no|cai do|cai nay|chung) )?(?:(?:cu|van|dang|hay|lai|rat|qua|hoi) )*${FAULT}\\b`);
const REPAIR_ACT_IN_CLAUSE = new RegExp(`\\b(?:${REPAIR_ACTS})\\b`);
const CONJUNCTION_BEFORE = /( (?:va|voi|cung|nua)(?: (?:ca|luon|them|cai|chiec))*) $/;

const NEGATED_ACT = new RegExp(`\\b(?:(?:khong|chua|chang|dau)(?: phai)? (?:can|phai|muon|nho|yeu cau|bat buoc)(?: phai)?|dung(?: co)?|khoi(?: can| phai)?|chang can)(?: (?:${REQUEST_TOKENS})){0,3} (?:${ANY_ACTS})\\b`, "g");
const FAULT_BEFORE = /\b(?:bi )?(?:hu(?: hong)?|hong|loi)(?: (?:cai|chiec))? $/;
const NEGATED_FAULT = /\b(?:khong|chua|chang|dau co|chua tung)(?: (?:bi|co|hay))? (?:hu(?: hong)?|hong|loi|van de|su co|sao|gi|truc trac|ket(?! noi))\b/g;
const NOT_FAULTY_AFTER = /\b(?:binh thuong|van (?:tot|on|chay|hoat dong|ok)|khong sao|tot lam|on dinh|con tot)\b/;
const COMPLETED_CLAUSE = /\b((?:da|vua|moi)(?: [a-z]+){0,4} )(?:sua(?: chua)?|kiem tra|bao tri|bao duong|lap(?: dat)?|xem|coi)(?: [a-z]+){0,4} (?:xong|roi|hoan tat)\b/g;
const TEMPORAL_BEFORE_ACT = /\b(?:tu luc|tu khi|ke tu khi|sau khi|truoc khi|khi|luc|hoi|nhan dip|ngay khi)\b/;
const ATTRIBUTION_BEFORE = /\b(?:do|vi|tai|boi|nghi|ngo|co the|hay la|hoac|hay|khong biet|khong ro|khong chac|chua biet|chua ro|chua chac|khong hieu|phai chang|co phai|hinh nhu|co le|chac la)(?: (?:la|rang|do|vi|cai|chiec|xem|co phai))* $/;
const PLACEMENT_BEFORE = /\b(?:gan|canh|ben canh|sat|phia (?:sau|truoc|tren|duoi)|ben (?:trai|phai|tren|duoi|trong|ngoai)|khu vuc|noi|vi tri|ngoai|trong|duoi|tren|sau|truoc|giua|doi dien|quanh|xung quanh|xuong|cho|o|tai)(?: (?:cai|chiec|vung|khu))? $/;
const PLACEMENT_AFTER = /^ (?:cua (?:toa nha|chung cu|ban quan ly|chu nha|hang xom|tang)\b|(?:dang |duoc )?(?:dat|nam|treo|de|o|tai|gan|canh|ben canh|sat|phia|ngoai|trong|duoi|tren|ben|sau|truoc|giua|doi dien|quanh|xung quanh)\b)/;
const STRONG_PLACEMENT_WORD = /\b(?:gan|canh|ben canh|sat|phia|khu vuc|quanh|xung quanh|noi|vi tri)\b/;

const CONTEXT_CHARS = 160;
const BARE_REQUEST_MAX_CHARS = 120;
const SENTENCE_SPLIT = /[.;!?:]+/;
const CLAUSE_SPLIT = /,|\b(?:ma|nhung|tuy nhien)\b/;

type Clause = { readonly text: string; readonly sentence: number };
type FinishedWork = { readonly act: number; readonly from: number; readonly to: number };

function normalizeRequestText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[\r\n]+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeKeyword(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function blank(text: string, pattern: RegExp): string {
  return text.replace(pattern, (found) => " ".repeat(found.length));
}

function splitClauses(normalized: string): Clause[] {
  const clauses: Clause[] = [];
  normalized.split(SENTENCE_SPLIT).forEach((sentence, index) => {
    for (const part of sentence.split(CLAUSE_SPLIT)) {
      const text = part.replace(/\s+/g, " ").trim();
      if (text.length > 0) clauses.push({ text: blank(blank(text, NEGATED_ACT), NEGATED_FAULT), sentence: index });
    }
  });
  return clauses;
}

function consistsOfRequestWords(text: string): boolean {
  const words = text.split(" ").filter((word) => word.length > 0);
  let at = 0;
  while (at < words.length) {
    if (at + 1 < words.length && BARE_REQUEST_PHRASES.has(`${words[at]} ${words[at + 1]}`)) at += 2;
    else if (BARE_REQUEST_PHRASES.has(words[at] as string)) at += 1;
    else return false;
  }
  return words.length > 0;
}

function isBareRequest(clause: Clause | undefined, sentence: number): boolean {
  if (!clause || clause.sentence !== sentence || clause.text.length > BARE_REQUEST_MAX_CHARS) return false;
  return REPAIR_ACT_IN_CLAUSE.test(clause.text) && consistsOfRequestWords(clause.text);
}

function continuesWithFault(next: Clause | undefined, sentence: number, suffix: string): boolean {
  if (!next || next.sentence !== sentence) return false;
  const rest = suffix.trim();
  return (rest.length === 0 ? 0 : rest.split(" ").length) <= 4 && FAULT_CONTINUATION.test(next.text);
}

function finishedWork(context: string): FinishedWork[] {
  return [...context.matchAll(COMPLETED_CLAUSE)].map((found) => {
    const from = found.index ?? 0;
    return { act: from + (found[1] as string).length, from, to: from + found[0].length };
  });
}

function coordinatedActStart(prefix: string): number {
  const joined = CONJUNCTION_BEFORE.exec(prefix);
  if (!joined) return -1;
  const head = prefix.slice(0, joined.index);
  const acts = [...head.matchAll(ACT_ANYWHERE)];
  const last = acts[acts.length - 1];
  if (!last) return -1;
  const start = last.index ?? 0;
  const between = head.slice(start + last[0].length).trim();
  const words = between.length === 0 ? 0 : between.split(" ").length;
  const coordinated = words >= 1 && words <= 5 && !STRONG_PLACEMENT_WORD.test(between) && !ATTRIBUTION_BEFORE.test(`${between} `);
  return coordinated ? start : -1;
}

function mentionIsRequested(clauses: readonly Clause[], at: number, start: number, end: number): boolean {
  const clause = clauses[at] as Clause;
  const windowStart = Math.max(0, start - CONTEXT_CHARS);
  const leading = clause.text.slice(windowStart, start);
  const prefix = windowStart > 0 ? leading.slice(leading.indexOf(" ") + 1) : leading;
  const suffix = clause.text.slice(end, end + CONTEXT_CHARS);
  if (ATTRIBUTION_BEFORE.test(prefix)) return false;

  const mentionEnd = prefix.length + (end - start);
  const finished = finishedWork(`${prefix}${clause.text.slice(start, end)}${suffix}`);
  const covered = finished.some((work) => work.from <= prefix.length && work.to >= mentionEnd);
  const unfinished = (act: number) => !covered && !finished.some((work) => work.act === act);
  const actBefore = ACT_BEFORE.exec(prefix);
  if (actBefore && unfinished(actBefore.index) && !TEMPORAL_BEFORE_ACT.test(prefix.slice(0, actBefore.index))) return true;
  const coordinated = coordinatedActStart(prefix);
  if (coordinated >= 0 && unfinished(coordinated)) return true;
  if (PLACEMENT_BEFORE.test(prefix)) return false;
  if (FAULT_BEFORE.test(prefix) || FAULT_AFTER.test(suffix)) return true;
  if (NOT_FAULTY_AFTER.test(suffix)) return false;
  const actAfter = ACT_AFTER.exec(suffix);
  if (actAfter && unfinished(mentionEnd + actAfter[0].length - (actAfter[1] as string).length)) return true;
  if (PLACEMENT_AFTER.test(suffix)) return false;
  if (continuesWithFault(clauses[at + 1], clause.sentence, suffix)) return true;
  return isBareRequest(clauses[at - 1], clause.sentence) || isBareRequest(clauses[at + 1], clause.sentence);
}

function isRequested(clauses: readonly Clause[], keyword: string): boolean {
  const pattern = new RegExp(`(?:^|[^a-z0-9])(${escapeKeyword(keyword)})(?![a-z0-9])`, "g");
  return clauses.some((clause, at) => {
    for (const match of clause.text.matchAll(pattern)) {
      const start = (match.index ?? 0) + match[0].indexOf(match[1] ?? keyword);
      if (mentionIsRequested(clauses, at, start, start + keyword.length)) return true;
    }
    return false;
  });
}

export function detectRequestedApplianceWork(text: string): ReadonlySet<string> {
  const clauses = splitClauses(normalizeRequestText(text));
  return new Set(APPLIANCE_REQUEST_KEYWORDS.filter((keyword) => isRequested(clauses, keyword)));
}
