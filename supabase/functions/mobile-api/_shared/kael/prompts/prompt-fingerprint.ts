import type { AIMessage, AIRequest } from "../contracts/types.ts";
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

/**
 * Provenance for one model call. Field names match the harness metadata
 * allowlist exactly; an unset sampling field is absent, never defaulted.
 */
export type KaelRequestProvenance = {
  readonly charter_version: string;
  readonly prompt_digest: string;
  readonly prompt_section_digests: readonly string[];
  readonly max_output_tokens?: number;
  readonly temperature?: number;
  readonly effort?: string;
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

// Control characters, so no message text can forge a boundary: a customer who
// types the literal separator still lands inside one field.
const FIELD = "\u0000";
const BLOCK = "\u0001";
const ROLE = "\u0002";
const MESSAGE = "\u0003";

async function canonicalMessage(message: AIMessage): Promise<string> {
  if (typeof message.content === "string") {
    return `${message.role}${ROLE}text${FIELD}${message.content}`;
  }
  const blocks = await Promise.all(message.content.map(async (block) => {
    if (block.type === "text") {
      const cache = block.cache_control ? `${FIELD}cache=${block.cache_control.type}` : "";
      return `text${FIELD}${block.text}${cache}`;
    }
    return block.source.type === "url"
      ? `image-url${FIELD}${block.source.url}`
      // Base64 evidence is digested, never carried: the canonical string this
      // feeds is itself hashed, but an intermediate holding megabytes of
      // private image data is what RULES Multimodal Evidence Privacy forbids.
      : `image-b64${FIELD}${block.source.media_type}${FIELD}${await sha256Hex(block.source.data)}`;
  }));
  return `${message.role}${ROLE}${blocks.join(BLOCK)}`;
}

/**
 * Provenance for one model call, derived from the request the seam is about to
 * send rather than from anything a caller passes down. Every purpose is covered
 * that way, including the six `prompts.ts` builders that assemble their own
 * messages and never reach the charter prompt.
 *
 * Field names match the harness metadata allowlist, so the result spreads
 * straight into a `provider.call` event. A config field the request left unset
 * is omitted rather than defaulted: a recorded value the caller never sent
 * would be fabricated evidence.
 * @param request - the provider request, read but never mutated.
 * @returns charter version, request digest, per-message digests, and the sampling config actually set.
 */
export async function buildKaelRequestProvenance(
  request: AIRequest,
): Promise<KaelRequestProvenance> {
  const canonicals = await Promise.all(request.messages.map(canonicalMessage));
  const sectionDigests = await Promise.all(canonicals.map(async (canonical, index) => {
    const digest = await sha256Hex(canonical);
    return `${request.messages[index].role}${index}:${digest.slice(0, KAEL_PROMPT_SECTION_DIGEST_LENGTH)}`;
  }));
  return {
    charter_version: KAEL_CHARTER_VERSION,
    prompt_digest: await sha256Hex(canonicals.join(MESSAGE)),
    prompt_section_digests: sectionDigests,
    ...(request.maxTokens !== undefined ? { max_output_tokens: request.maxTokens } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.effort !== undefined ? { effort: request.effort } : {}),
  };
}
