const THOUSAND = 1_000;
const MILLION = 1_000_000;

export function canonicalizeVN(text: string): string {
  return normalizeVietnamese(text)
    .replace(/\b(\d+(?:[.,]\d+)?)\s*trieu\b(?!\s+chung\b)/g, (_, amount: string) =>
      canonicalVndAmount(amount, MILLION)
    )
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(?:nghin|ngan)\b/g, (_, amount: string) =>
      canonicalVndAmount(amount, THOUSAND)
    )
    .replace(/\b(\d+(?:[.,]\d+)?)\s*k\b/g, (_, amount: string) =>
      canonicalVndAmount(amount, THOUSAND)
    )
    .replace(/\bmet\s+vuong\b/g, "m2")
    .replace(/\bm\s*(?:\^\s*)?[2²](?=$|[\s/.,;:()])/g, "m2")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVietnamese(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase();
}

function canonicalVndAmount(rawAmount: string, multiplier: number): string {
  const amount = Number(rawAmount.replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) return `${rawAmount} vnd`;
  return `${Math.round(amount * multiplier)} vnd`;
}
