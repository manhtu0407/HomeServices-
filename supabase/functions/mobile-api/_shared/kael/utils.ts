import { sanitizeForLLM } from "../../../_shared/domain.ts";

export function readBooleanEnvFlag(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

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

export function looksLikePrivateUnitIdentifier(value: string) {
  return /\d/u.test(value) || /^[A-Z](?:[A-Z0-9._/-]*)$/.test(value);
}

export function scrubSensitiveForLLM(input: string): string {
  return sanitizeForLLM(input)
    .replace(/(?<!\d)(?:\+?84|0)[\s().-]*(?:\d[\s().-]*){8,10}(?!\d)/g, "[phone]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{9,12}\b/g, "[id-number]")
    .replace(/\b\d{8}\b/g, "[bank-account]")
    .replace(/\b\d{13,20}\b/g, "[bank-account]")
    .replace(
      /\b(?:Vinhomes|Vincom|Masteri|Saigon Pearl|Saigon Royal|Saigon South|Sun Avenue|Sun Village|Sunwah|Estella|Lexington|Diamond Island|Empire City|Eco Green|Phu My Hung|Phú Mỹ Hưng|Hoang Anh Gia Lai|Hoàng Anh Gia Lai|Riviera Point|Vista Verde|Era Town|The Manor|Lancaster|City Garden|Lavila|Centana|Topaz|Jamila|Akari|Sunrise City|Botanica|Pearl Plaza|Landmark|The Sun|Citadines|Lumière|Lumiere)(?:\s+(?!tầng|tang|lầu|lau|căn|can|phòng|phong|block|toà|tòa|toa|số|so|STK|TK)[A-Za-zÀ-ỹ][\wÀ-ỹ.]*){0,2}/gi,
      "[building]",
    )
    .replace(/\b(?:tầng|tang|lầu|lau)\s*\d{1,3}\b/gi, "[floor]")
    .replace(
      /(?<![\p{L}\p{N}])(?:căn(?:[^\S\r\n]+hộ)?|can(?:[^\S\r\n]+ho)?|phòng|phong|block|toà|tòa|toa)[^\S\r\n]+([\p{L}\p{N}](?:[\p{L}\p{N}._/-]*[\p{L}\p{N}])?)/giu,
      (match, identifier: string) => looksLikePrivateUnitIdentifier(identifier) ? "[unit]" : match,
    )
    .replace(/\b(?:số|so)[^\S\r\n]+\d+[A-Za-z]?\b/gi, "[house-no]")
    .replace(
      /(?<![:\p{L}\p{N}])\d{1,5}[A-Za-z]?(?:[/-]\d{1,5}[A-Za-z]?)?(?=[^\S\r\n]+(?:(?:đường|duong|phố|pho|hẻm|hem)[^\S\r\n]+)?\p{Lu}[\p{L}'-]*(?:[^\S\r\n]+\p{Lu}[\p{L}'-]*){0,3}\b)/gu,
      "[house-no]",
    )
    .replace(/(?<![:\p{L}\p{N}])\d{1,5}[A-Za-z]?(?:[/-]\d{1,5}[A-Za-z]?)?(?=[^\S\r\n]+(?:đường|duong|phố|pho|hẻm|hem)[^\S\r\n]+\p{L})/giu, "[house-no]");
}

// Customer Case Work needs coarse in-home context; exact unit, building, contact,
// identity, account, and street-address fields still pass through the strict scrubber.
export function scrubCustomerCaseContextForLLM(input: string): string {
  const floors: Array<{ token: string; value: string }> = [];
  const protectedInput = sanitizeForLLM(input).replace(
    /\b(?:tầng|tang|lầu|lau|floor)\s*\d{1,3}\b/gi,
    (value) => {
      const token = `\uE000${floors.length.toString(36)}\uE001`;
      floors.push({ token, value });
      return token;
    },
  );
  let scrubbed = scrubSensitiveForLLM(protectedInput);
  for (const floor of floors) {
    scrubbed = scrubbed.replaceAll(floor.token, floor.value);
  }
  return scrubbed;
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

// Mirrors the shared Kael parsing contract for the Deno boundary. The limits
// keep recovery linear and bounded even when model output is adversarial.
const MAX_JSON_DEPTH = 100;
const MAX_JSON_INPUT_LENGTH = 64 * 1024;
const MAX_JSON_CANDIDATES = 32;

export function safeParseJSON(content: string): unknown | null {
  if (content.length > MAX_JSON_INPUT_LENGTH) return null;

  const stripped = content.trim();
  let searchFrom = 0;
  for (let attempt = 0; attempt < MAX_JSON_CANDIDATES; attempt += 1) {
    const startIdx = findJsonStart(stripped, searchFrom);
    if (startIdx === -1) return null;

    const extracted = extractBalanced(stripped, startIdx);
    if (extracted.tooDeep) return null;
    if (extracted.candidate) {
      try {
        return JSON.parse(extracted.candidate);
      } catch {
        // Bracketed prose can precede the real payload; continue within the
        // bounded candidate budget.
      }
    }
    searchFrom = startIdx + 1;
  }

  return null;
}

function findJsonStart(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === "{" || text[index] === "[") return index;
  }
  return -1;
}

function extractBalanced(
  text: string,
  start: number,
): { candidate: string | null; tooDeep: boolean } {
  const expectedClosers: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{" || char === "[") {
      expectedClosers.push(char === "{" ? "}" : "]");
      if (expectedClosers.length > MAX_JSON_DEPTH) {
        return { candidate: null, tooDeep: true };
      }
      continue;
    }
    if (char === "}" || char === "]") {
      if (expectedClosers.pop() !== char) {
        return { candidate: null, tooDeep: false };
      }
    }
    if (expectedClosers.length === 0) {
      return {
        candidate: text.slice(start, index + 1),
        tooDeep: false,
      };
    }
  }

  return { candidate: null, tooDeep: false };
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
