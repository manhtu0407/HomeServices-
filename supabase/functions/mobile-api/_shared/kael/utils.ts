import { sanitizeForLLM } from "../../../_shared/domain.ts";

export function sanitizeVisionPhotoUrls(photoUrls: string[]): string[] {
  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const rawUrl of photoUrls) {
    const url = sanitizeForLLM(rawUrl).trim();
    if (seen.has(url) || !isHttpUrl(url)) continue;
    seen.add(url);
    sanitized.push(url);
    if (sanitized.length >= 5) break;
  }
  return sanitized;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function scrubSensitiveForLLM(input: string): string {
  return sanitizeForLLM(input)
    .replace(/(?<!\d)(?:\+?84|0)[\s().-]*(?:\d[\s().-]*){8,10}(?!\d)/g, "[phone]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{9,12}\b/g, "[id-number]")
    .replace(/\b\d{8}\b/g, "[bank-account]")
    .replace(/\b\d{13,15}\b/g, "[bank-account]")
    .replace(
      /\b(?:Vinhomes|Vincom|Masteri|Saigon Pearl|Saigon Royal|Saigon South|Sun Avenue|Sun Village|Sunwah|Estella|Lexington|Diamond Island|Empire City|Eco Green|Phu My Hung|Phú Mỹ Hưng|Hoang Anh Gia Lai|Hoàng Anh Gia Lai|Riviera Point|Vista Verde|Era Town|The Manor|Lancaster|City Garden|Lavila|Centana|Topaz|Jamila|Akari|Sunrise City|Botanica|Pearl Plaza|Landmark|The Sun|Citadines|Lumière|Lumiere)(?:\s+(?!tầng|tang|lầu|lau|căn|can|phòng|phong|block|toà|tòa|toa|số|so|STK|TK)[A-Za-zÀ-ỹ][\wÀ-ỹ.]*){0,2}/gi,
      "[building]",
    )
    .replace(/\b(?:tầng|tang|lầu|lau)\s*\d{1,3}\b/gi, "[floor]")
    .replace(
      /\b(?:căn(?:\s+hộ)?|can(?:\s+ho)?|phòng|phong|block|toà|tòa|toa)\s+[A-Za-z0-9.\-_/]+/gi,
      "[unit]",
    )
    .replace(/\b(?:số|so)\s+\d+[A-Za-z]?\b/gi, "[house-no]")
    .replace(
      /(?<![\p{L}\p{N}])\d{1,5}[A-Za-z]?(?:[/-]\d{1,5}[A-Za-z]?)?(?=\s+(?:(?:đường|duong|phố|pho|hẻm|hem)\s+)?\p{Lu}[\p{L}'-]*(?:\s+\p{Lu}[\p{L}'-]*){0,3}\b)/gu,
      "[house-no]",
    )
    .replace(/(?<![\p{L}\p{N}])\d{1,5}[A-Za-z]?(?:[/-]\d{1,5}[A-Za-z]?)?(?=\s+(?:đường|duong|phố|pho|hẻm|hem)\s+\p{L})/giu, "[house-no]");
}

export function hasUnsupportedRepairIntent(input: string): boolean {
  const normalized = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return [
    "tu lanh",
    "may giat",
    "internet",
    "sua khoa",
    "son nha",
  ].some((keyword) => normalized.includes(keyword));
}

export function safeParseJSON(content: string): unknown | null {
  try {
    return JSON.parse(content);
  } catch {
    // J-1 (Notes.md): AI outputs sometimes wrap JSON in a short note. Walk the
    // FIRST balanced object instead of indexOf("{")..lastIndexOf("}"), so nested
    // braces inside string values don't widen the parse window and corrupt the
    // slice. Same algorithm as cron/process-batch-results.ts parseJsonObjectFromText.
    return parseFirstBalancedJsonObject(content);
  }
}

// String-aware balanced-brace scan: returns the first complete top-level JSON
// object found in `text`, or null. Skips braces that appear inside string
// literals (honoring backslash escapes) so `{"a":"}{"}` parses correctly.
function parseFirstBalancedJsonObject(text: string): unknown | null {
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
        return JSON.parse(text.slice(start, index + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

export function positiveNumberFrom(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export async function withDbTimeout<T>(
  promise: PromiseLike<T>,
  ms = 10_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DB timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
