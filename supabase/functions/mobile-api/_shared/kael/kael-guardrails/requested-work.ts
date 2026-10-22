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

const REPAIR_VERB = /\b(?:sua(?: chua)?|lap(?: dat)?|cai dat|bao tri|bao duong|bao hanh|kiem tra|khac phuc|fix|repair|install|replace)\b/;
const REPAIR_VERB_BEFORE = /\b(?:sua(?: chua)?|lap(?: dat)?|cai dat|bao tri|bao duong|bao hanh|kiem tra|khac phuc|fix|repair|install|replace)(?: (?:lai|giup|cho|luon|cai|chiec|may|bo|dong)){0,3} $/;
const FAULT_AFTER = /^ (?:[a-z]+ ){0,2}(?:bi (?:hong|loi|ho|ket|ro|cham|yeu|mat|dung|ngung)|hong|loi|ho|ngung|khong (?:chay|hoat dong|len|vao duoc|ket noi|lanh|nong|say|vat|giat|bat|dung|khoi dong|cap|mat)|chap chon|keu to|ro nuoc|ro ri|mat (?:ket noi|mang)|rot mang)\b/;
const ATTRIBUTION_BEFORE = /\b(?:do|vi|tai|boi|nghi|ngo|co the|hay la|hoac|khong biet|khong ro|khong chac|phai chang)(?: (?:cai|chiec))? $/;
const PLACEMENT_AFTER = /^ (?:cua (?:toa nha|chung cu|ban quan ly|chu nha|hang xom|tang)\b|(?:dat|nam|treo|de|o|tai|gan|canh|ben canh|sat|phia|ngoai|trong|duoi|tren)\b)/;
const PLACEMENT_BEFORE = /\b(?:gan|canh|ben canh|sat|phia sau|phia truoc|khu vuc|cho|noi|vi tri|ngoai|trong|duoi|tren|o|tai)(?: (?:cai|chiec))? $/;

const CLAUSE_MARKS = [".", ";", ",", "!", "?", "\n"] as const;
const SENTENCE_MARKS = [".", ";", "!", "?", "\n"] as const;

function normalizeRequestText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeKeyword(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lastMarkBefore(text: string, index: number, marks: readonly string[]): number {
  const before = text.slice(0, index);
  return Math.max(...marks.map((mark) => before.lastIndexOf(mark))) + 1;
}

function firstMarkFrom(text: string, index: number, marks: readonly string[]): number {
  const found = marks.map((mark) => text.indexOf(mark, index)).filter((at) => at >= 0);
  return found.length > 0 ? Math.min(...found) : text.length;
}

function isRequested(normalized: string, keyword: string): boolean {
  const pattern = new RegExp(`(?:^|[^a-z0-9])(${escapeKeyword(keyword)})(?![a-z0-9])`, "g");
  for (const match of normalized.matchAll(pattern)) {
    const start = (match.index ?? 0) + match[0].indexOf(match[1] ?? keyword);
    const end = start + keyword.length;
    const prefix = normalized.slice(lastMarkBefore(normalized, start, CLAUSE_MARKS), start);
    const suffix = normalized.slice(end, firstMarkFrom(normalized, end, CLAUSE_MARKS));
    if (ATTRIBUTION_BEFORE.test(prefix)) continue;
    if (REPAIR_VERB_BEFORE.test(prefix) || FAULT_AFTER.test(suffix)) return true;
    const sentence = normalized.slice(
      lastMarkBefore(normalized, start, SENTENCE_MARKS),
      firstMarkFrom(normalized, end, SENTENCE_MARKS),
    );
    const placed = PLACEMENT_BEFORE.test(prefix) || PLACEMENT_AFTER.test(suffix);
    if (!placed && REPAIR_VERB.test(sentence)) return true;
  }
  return false;
}

export function detectRequestedApplianceWork(text: string): ReadonlySet<string> {
  const normalized = normalizeRequestText(text);
  return new Set(APPLIANCE_REQUEST_KEYWORDS.filter((keyword) => isRequested(normalized, keyword)));
}
