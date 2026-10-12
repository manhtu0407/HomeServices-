// Pure helpers for address autocomplete: query normalization, a short-lived result cache and re-ranking.
// Nothing here touches the network or the database, so it stays cheap to unit test.

import type { PlacesAutocompleteResponse } from "../contracts/catalog.ts";

type Suggestion = PlacesAutocompleteResponse["suggestions"][number];

const SUGGESTION_CACHE_TTL_MS = 120_000;
const SUGGESTION_CACHE_MAX_ENTRIES = 200;

export function foldAddressText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

/**
 * Expands the shorthand residents actually type so providers see the same words their index uses.
 * Only well-known HCMC abbreviations are expanded; anything else passes through untouched.
 */
export function normalizeAutocompleteQuery(input: string): string {
  let text = input.normalize("NFC").replace(/\s+/g, " ").trim();
  text = text
    .replace(/\b(?:q|quan)\s*\.?\s*(1[0-2]|[1-9])\b/gi, "Quận $1")
    .replace(/\b(?:p|phuong)\s*\.\s*(\d{1,2})\b/gi, "Phường $1")
    .replace(/\btp\.?\s*(?:thu duc|thủ đức)\b/gi, "Thành phố Thủ Đức")
    .replace(/\bvinhome\b/gi, "Vinhomes")
    .replace(/\bcc\b\.?/gi, "Chung cư");
  return text.replace(/\s+/g, " ").trim();
}

export function autocompleteCacheKey(query: string): string {
  return foldAddressText(normalizeAutocompleteQuery(query));
}

/**
 * Orders suggestions by how many of the typed words (and building codes such as "s1.07") they contain.
 * The provider order is the tiebreaker, so an unrelated query is never reshuffled.
 */
export function rankSuggestionsForQuery(
  query: string,
  suggestions: readonly Suggestion[],
): Suggestion[] {
  const tokens = foldAddressText(normalizeAutocompleteQuery(query))
    .split(/[^a-z0-9.]+/)
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) return [...suggestions];
  return suggestions
    .map((suggestion, index) => {
      const haystack = foldAddressText(
        `${suggestion.main_text} ${suggestion.secondary_text ?? ""} ${suggestion.label}`,
      );
      const hits = tokens.filter((token) => haystack.includes(token)).length;
      const codeHit = tokens.some((token) =>
        /\d/.test(token) && foldAddressText(suggestion.main_text).includes(token)
      );
      return { suggestion, index, score: hits / tokens.length + (codeHit ? 0.5 : 0) };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.suggestion);
}

export class AutocompleteResultCache {
  private readonly entries = new Map<string, { at: number; value: PlacesAutocompleteResponse }>();

  constructor(
    private readonly ttlMs = SUGGESTION_CACHE_TTL_MS,
    private readonly maxEntries = SUGGESTION_CACHE_MAX_ENTRIES,
  ) {}

  get(key: string, now = Date.now()): PlacesAutocompleteResponse | null {
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (now - hit.at > this.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  clear(): void {
    this.entries.clear();
  }

  set(key: string, value: PlacesAutocompleteResponse, now = Date.now()): void {
    if (value.fallback_used || value.suggestions.length === 0) return;
    this.entries.delete(key);
    this.entries.set(key, { at: now, value });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/**
 * Resolves with the first provider answer that carries suggestions; when none do, with the first
 * answer that settled at all. A provider that rejects is treated as "no answer".
 */
export async function firstUsefulAutocomplete(
  attempts: ReadonlyArray<Promise<PlacesAutocompleteResponse>>,
): Promise<PlacesAutocompleteResponse | null> {
  if (attempts.length === 0) return null;
  return await new Promise((resolve) => {
    let pending = attempts.length;
    let fallback: PlacesAutocompleteResponse | null = null;
    const settle = (value: PlacesAutocompleteResponse | null) => {
      if (value && !value.fallback_used && value.suggestions.length > 0) {
        resolve(value);
        return;
      }
      if (value && (fallback === null || (fallback.fallback_used && !value.fallback_used))) fallback = value;
      pending -= 1;
      if (pending === 0) resolve(fallback);
    };
    for (const attempt of attempts) attempt.then(settle, () => settle(null));
  });
}
