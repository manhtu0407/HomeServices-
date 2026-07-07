import {
  type LexiconTier,
  REGIONAL_LEXICON,
  type RegionCode,
} from "./regional-lexicon.ts";

export type { RegionCode } from "./regional-lexicon.ts";
export type RegionResult = RegionCode | "unknown";
export type RegisterLevel = "unknown" | "guess" | "recognize";

export type RegionalMarkerHit = {
  readonly term: string;
  readonly tier: LexiconTier;
  readonly region: RegionCode;
  readonly mirrorEligible: boolean;
};

export type RegionalScores = Record<RegionCode, number>;

export type RegionalRegister = {
  readonly region: RegionResult;
  readonly level: RegisterLevel;
  readonly confidence: number;
  readonly scores: RegionalScores;
  readonly hits: readonly RegionalMarkerHit[];
  readonly adapt: {
    readonly mirrorTerms: readonly string[];
    readonly avoidStrongDialect: true;
  };
};

const REGIONS: readonly RegionCode[] = REGIONAL_LEXICON.regions;
export const DEFAULT_REGION: RegionCode = REGIONAL_LEXICON.default_region;

const WEIGHTS = REGIONAL_LEXICON.scoring.weights;
const GUESS_THRESHOLD = REGIONAL_LEXICON.scoring.guess_threshold;
const RECOGNIZE_THRESHOLD = REGIONAL_LEXICON.scoring.recognize_threshold;
const CONFLICT_PENALTY = REGIONAL_LEXICON.scoring.conflict_penalty;

type MarkerEntry = {
  readonly tier: LexiconTier;
  readonly region: RegionCode;
  readonly weight: number;
  readonly mirrorEligible: boolean;
};

const MARKER_INDEX: ReadonlyMap<string, MarkerEntry> = buildMarkerIndex();

function buildMarkerIndex(): Map<string, MarkerEntry> {
  const index = new Map<string, MarkerEntry>();
  for (const tier of ["A", "B", "C"] as const) {
    const bucket = REGIONAL_LEXICON.tiers[tier];
    const tierMirror = bucket.mirror_eligible === true;
    for (const marker of bucket.markers) {
      // Tier A is always detect-only; a per-marker `mirror: false` overrides the
      // tier default for phonetic spellings.
      const mirrorEligible = tier === "A"
        ? false
        : marker.mirror === undefined
        ? tierMirror
        : marker.mirror === true;
      index.set(marker.term.toLowerCase(), {
        tier,
        region: marker.region,
        weight: WEIGHTS[tier],
        mirrorEligible,
      });
    }
  }
  return index;
}

function emptyScores(): RegionalScores {
  return { bac: 0, trung: 0, nam: 0 };
}

// Unicode-aware token split that preserves Vietnamese diacritics (tier A markers
// like "rứa", "nỏ" are only distinctive WITH their diacritics).
function tokenize(text: string): string[] {
  const matched = text.toLowerCase().match(/\p{L}+/gu);
  return matched ?? [];
}

export function scoreRegionalMarkers(text: string): {
  scores: RegionalScores;
  hits: RegionalMarkerHit[];
} {
  const scores = emptyScores();
  const hits: RegionalMarkerHit[] = [];
  const seen = new Set<string>();
  for (const token of tokenize(text)) {
    const entry = MARKER_INDEX.get(token);
    if (!entry) continue;
    scores[entry.region] += entry.weight;
    if (!seen.has(token)) {
      seen.add(token);
      hits.push({
        term: token,
        tier: entry.tier,
        region: entry.region,
        mirrorEligible: entry.mirrorEligible,
      });
    }
  }
  return { scores, hits };
}

export function accumulateRegionalScores(
  base: RegionalScores,
  next: RegionalScores,
): RegionalScores {
  return {
    bac: base.bac + next.bac,
    trung: base.trung + next.trung,
    nam: base.nam + next.nam,
  };
}

export function resolveRegionalRegister(
  scores: RegionalScores,
  hits: readonly RegionalMarkerHit[],
): RegionalRegister {
  const ranked = [...REGIONS].sort((a, b) => scores[b] - scores[a]);
  const top = ranked[0];
  const topScore = scores[top];
  const runnerScore = scores[ranked[1]];

  const strongRegions = new Set(
    hits.filter((hit) => hit.tier === "A" || hit.tier === "B").map((hit) => hit.region),
  );
  const conflicted = strongRegions.size >= 2 &&
    topScore - runnerScore < CONFLICT_PENALTY;

  const topTierBCount = hits.filter(
    (hit) => hit.region === top && hit.tier === "B",
  ).length;
  const topHasTierA = hits.some((hit) => hit.region === top && hit.tier === "A");

  let level: RegisterLevel = "unknown";
  if (!conflicted && topScore >= RECOGNIZE_THRESHOLD && (topHasTierA || topTierBCount >= 2)) {
    level = "recognize";
  } else if (!conflicted && topScore >= GUESS_THRESHOLD) {
    level = "guess";
  }

  const region: RegionResult = level === "unknown" ? "unknown" : top;
  const confidence = level === "unknown"
    ? 0
    : Math.min(1, round2(topScore / (RECOGNIZE_THRESHOLD + WEIGHTS.A)));

  const mirrorTerms = level === "unknown"
    ? []
    : dedupe(hits.filter((hit) => hit.mirrorEligible).map((hit) => hit.term));

  return {
    region,
    level,
    confidence,
    scores,
    hits,
    adapt: { mirrorTerms, avoidStrongDialect: true },
  };
}

export function detectRegionalRegister(text: string): RegionalRegister {
  const { scores, hits } = scoreRegionalMarkers(text);
  return resolveRegionalRegister(scores, hits);
}

// Builds the mirror-lite hint that is injected into the system prompt. It NEVER
// contains the region code or tier-A dialect — only the customer's own everyday
// words to echo — so the prompt cannot become a stereotyping vector and Kael
// cannot parrot an accent. Returns null when the register is neutral (unknown),
// in which case the standing LANGUAGE_RULES neutral default applies.
export function buildRegisterHint(register: RegionalRegister): string | null {
  if (register.level === "unknown") return null;
  const terms = register.adapt.mirrorTerms;
  if (terms.length > 0) {
    return [
      "Register hint (mirror-lite, deterministic)",
      `The customer used these everyday words — reuse them naturally when you touch those ideas: ${terms.join(", ")}.`,
      "Keep the same warmth; never mimic a regional accent, never mention, ask, or infer the customer's region or background.",
    ].join("\n");
  }
  return [
    "Register hint (mirror-lite, deterministic)",
    "Match the customer's warm, natural Vietnamese wording.",
    "Never mimic a regional accent, never mention, ask, or infer the customer's region or background.",
  ].join("\n");
}

function dedupe(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
