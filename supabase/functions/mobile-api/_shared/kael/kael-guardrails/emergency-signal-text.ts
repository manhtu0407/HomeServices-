// Safety-cue text that keeps Vietnamese tone marks aligned with an accent-free twin. Matching runs
// on the plain text so unaccented typing still works; tone marks decide the words the plain text
// cannot tell apart (cháy / chạy / chảy, khói / khối / khởi, lửa / lừa).

export type SignalText = {
  readonly plain: string;
  readonly accented: string;
};

export type Segment = {
  readonly start: number;
  readonly end: number;
};

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const KEPT_PUNCTUATION = new Set([".", ",", ";", ":", "!", "?", "-", "\u2013", "\u2014", '"']);
const QUOTE_MARKS = new Set(["\u201c", "\u201d"]);
const SEGMENT_BOUNDARY =
  /[.;!?:]+|\s[-\u2013\u2014]+\s|[\u2013\u2014]|\b(?:nhung|tuy nhien|tuy vay|ma|but|however|although|though)\b/g;
const SENTENCE_BOUNDARY = /[.;!?:]+|\s[-\u2013\u2014]+\s|[\u2013\u2014]/g;

// A tone mark keeps a cue only when it spells the safety word; an unmarked spelling is accepted.
const TONE_RULES: Readonly<Record<string, RegExp>> = {
  chay: /^ch[a\u00e1]y$/u,
  khoi: /^kh[o\u00f3]i$/u,
  lua: /^l[u\u1eed]a$/u,
  kho: /^kh[o\u00f3]$/u,
  tho: /^th[o\u1edf]$/u,
  giat: /^gi[a\u1ead]t$/u,
};
const BLEEDING_TONE = /^ch[a\u1ea3]y$/u;

export function buildSignalText(input: string): SignalText {
  let plain = "";
  let accented = "";
  const push = (plainChar: string, accentedChar: string) => {
    if (plainChar === "." && plain.endsWith(" ")) {
      // A sentence stop typed after a space still ends the sentence.
      plain = plain.slice(0, -1) + ".";
      accented = accented.slice(0, -1) + ".";
      return;
    }
    const lastIsGap = plain.endsWith(" ") || plain.endsWith(".");
    if ((plainChar === " " || plainChar === ".") && lastIsGap) return;
    plain += plainChar;
    accented += accentedChar;
  };
  for (const char of input.normalize("NFC").toLowerCase()) {
    if (char === "\n" || char === "\r") {
      push(".", ".");
    } else if (/\s/u.test(char) || char === "'" || char === "\u2019" || char.length !== 1) {
      push(" ", " ");
    } else if (QUOTE_MARKS.has(char)) {
      push('"', '"');
    } else if (KEPT_PUNCTUATION.has(char)) {
      push(char, char);
    } else {
      const base = char.normalize("NFD").replace(COMBINING_MARKS, "").replace("\u0111", "d");
      if (base.length === 0) continue;
      if (base.length === 1 && /[\p{L}\p{N}]/u.test(base)) push(base, char);
      else push(" ", " ");
    }
  }
  return { plain, accented };
}

export function segmentRanges(plain: string, boundary: RegExp = SEGMENT_BOUNDARY): Segment[] {
  const ranges: Segment[] = [];
  let start = 0;
  for (const match of plain.matchAll(new RegExp(boundary.source, "g"))) {
    const index = match.index ?? 0;
    if (index > start) ranges.push({ start, end: index });
    start = index + match[0].length;
  }
  if (start < plain.length) ranges.push({ start, end: plain.length });
  return ranges;
}

export function sentenceRanges(plain: string): Segment[] {
  return segmentRanges(plain, SENTENCE_BOUNDARY);
}

export function segmentAt(ranges: readonly Segment[], index: number): Segment {
  return ranges.find((range) => index >= range.start && index < range.end) ??
    { start: index, end: index };
}

// Replaces every match with spaces in both twins so indices stay aligned.
export function blankMatches(text: SignalText, pattern: RegExp): SignalText {
  let plain = text.plain;
  let accented = text.accented;
  for (const match of text.plain.matchAll(new RegExp(pattern.source, "gu"))) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const blank = " ".repeat(match[0].length);
    plain = plain.slice(0, start) + blank + plain.slice(end);
    accented = accented.slice(0, start) + blank + accented.slice(end);
  }
  return { plain, accented };
}

export type ToneCheck = "tolerant" | "acute";

// Tone rules a single cue adds for words it shares letters with; they never apply to other cues.
export type ToneRules = Readonly<Record<string, RegExp>>;

// `plainSlice` and `accentedSlice` cover the same cue match, so their tokens line up one to one.
export function tonesAgree(
  plainSlice: string,
  accentedSlice: string,
  check: ToneCheck,
  extraRules: ToneRules = {},
): boolean {
  const plainWords = plainSlice.split(" ");
  const accentedWords = accentedSlice.split(" ");
  for (let index = 0; index < plainWords.length; index += 1) {
    const word = plainWords[index] ?? "";
    const spelled = accentedWords[index] ?? "";
    const bleeding = word === "chay" && plainWords[index + 1] === "mau";
    const rule = bleeding ? BLEEDING_TONE : (extraRules[word] ?? TONE_RULES[word]);
    if (!rule) continue;
    if (!rule.test(spelled)) return false;
    if (check === "acute" && word === "chay" && !bleeding && spelled !== "ch\u00e1y") return false;
  }
  return true;
}

// True when the index sits inside a quotation that names text rather than reports an event,
// such as: the screen shows the word "fire".
export function insideNamedQuote(plain: string, index: number): boolean {
  const before = plain.slice(0, index);
  const quoteCount = (before.match(/"/g) ?? []).length;
  if (quoteCount % 2 === 0) return false;
  const opening = before.lastIndexOf('"');
  return NAMING_WORDS_BEFORE_QUOTE.test(before.slice(Math.max(0, opening - 32), opening));
}

const NAMING_WORDS_BEFORE_QUOTE =
  /\b(?:chu|tu|cum tu|dong chu|nhan|bao|hien thi|ghi|word|term|label|text|message|says?|reads?|displays?|shows?|called|named|error)\s*$/;
