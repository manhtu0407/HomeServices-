import {
  KAEL_CHARTER_VERSION,
  type KaelPromptParts,
} from "./system-prompt.ts";

/**
 * Hex characters kept per section. Twelve leaves collision headroom far beyond
 * the dozen sections one prompt holds while keeping the whole array inside the
 * 120-character value bound the harness metadata sanitizer applies.
 */
export const KAEL_PROMPT_SECTION_DIGEST_LENGTH = 12;

/**
 * Which prompt a model call ran under, carried as digests rather than text.
 * Field names match the harness metadata allowlist exactly, so the object can
 * be spread into a `provider.call` event without renaming.
 */
export type KaelPromptFingerprint = {
  /** Charter version the prompt was assembled under. */
  readonly charter_version: string;
  /** SHA-256 of the assembled prompt, full hex. */
  readonly prompt_digest: string;
  /** One `id:digest` entry per section, in assembly order. */
  readonly prompt_section_digests: readonly string[];
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Digests an assembled prompt so a later reader can prove which prompt version
 * produced a decision without storing what the customer wrote. Nothing derived
 * here is reversible: a changed section reports a changed digest, and the text
 * behind it stays in the source tree at that commit.
 * @param parts - the sections and joined text from `buildKaelSystemPromptParts`.
 * @returns the charter version, the whole-prompt digest, and one digest per section.
 */
export async function computeKaelPromptFingerprint(
  parts: KaelPromptParts,
): Promise<KaelPromptFingerprint> {
  const sectionDigests = await Promise.all(
    parts.sections.map(async (section) => {
      const digest = await sha256Hex(section.text);
      return `${section.id}:${digest.slice(0, KAEL_PROMPT_SECTION_DIGEST_LENGTH)}`;
    }),
  );
  return {
    charter_version: KAEL_CHARTER_VERSION,
    prompt_digest: await sha256Hex(parts.text),
    prompt_section_digests: sectionDigests,
  };
}
