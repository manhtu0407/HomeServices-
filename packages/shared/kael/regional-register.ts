// Regional register detector (Plan.md §39 KC2). Deterministic, dependency-free,
// per-conversation. Turns Vietnamese chat text into a high-precision / low-recall
// region hint (bac / trung / nam) plus mirror-lite adaptation guidance.
//
// Design contract (docs/foundation/kael-regional-register-research.md):
//   - Region is a per-conversation REGISTER HINT only, never a stored identity
//     attribute, never spoken aloud, never used to infer demographics (RULES #9).
//   - The engine is a weighted lexicon/rule, NOT an LLM guess. It fails safe:
//     no markers or conflicting strong markers => neutral (default_region).
//   - Mirror-lite: only the customer's own everyday words and warm particles are
//     echoable. Strong (tier A) dialect is DETECT-ONLY and never mirrored, so
//     Kael never parrots a regional accent.
//
// This module is the canonical spec + reference implementation. The Edge
// conversational runtime currently adapts register through the language-rules
// prompt (mirror-lite led by the customer's own words); wiring this deterministic
// detector into the Edge path is a follow-up (it needs an Edge-local copy, same
// pattern as forbidden-language.json <-> self-check.ts).

import lexicon from "./charter/regional-lexicon.json";

export type RegionCode = "bac" | "trung" | "nam";
export type RegionResult = RegionCode | "unknown";
export type RegisterLevel = "unknown" | "guess" | "recognize";

export type RegionalMarkerHit = {
  readonly term: string;
  readonly tier: "A" | "B" | "C";
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
    // The customer's OWN words Kael may gently echo (mirror-lite). Never contains
    // tier A dialect, so Kael never over-mimics.
    readonly mirrorTerms: readonly string[];
    readonly avoidStrongDialect: true;
  };
};

const REGIONS: readonly RegionCode[] = ["bac", "trung", "nam"];
export const DEFAULT_REGION: RegionCode = asRegion(lexicon.default_region) ?? "nam";

const WEIGHTS = lexicon.scoring.weights;
const GUESS_THRESHOLD = lexicon.scoring.guess_threshold;
const RECOGNIZE_THRESHOLD = lexicon.scoring.recognize_threshold;
const CONFLICT_PENALTY = lexicon.scoring.conflict_penalty;

type MarkerEntry = {
  readonly tier: "A" | "B" | "C";
  readonly region: RegionCode;
  readonly weight: number;
  readonly mirrorEligible: boolean;
};

const MARKER_INDEX: ReadonlyMap<string, MarkerEntry> = buildMarkerIndex();

function buildMarkerIndex(): Map<string, MarkerEntry> {
  const index = new Map<string, MarkerEntry>();
  for (const tier of ["A", "B", "C"] as const) {
    const bucket = lexicon.tiers[tier];
    const tierMirror = bucket.mirror_eligible === true;
    for (const marker of bucket.markers) {
      const region = asRegion(marker.region);
      if (!region) continue;
      // A per-marker `mirror: false` (e.g. phonetic spellings) overrides the
      // tier default; tier A is always detect-only.
      const perMarkerMirror = (marker as { mirror?: boolean }).mirror;
      const mirrorEligible = tier === "A"
        ? false
        : perMarkerMirror === undefined
        ? tierMirror
        : perMarkerMirror === true;
      index.set(marker.term.toLowerCase(), {
        tier,
        region,
        weight: WEIGHTS[tier],
        mirrorEligible,
      });
    }
  }
  return index;
}

function asRegion(value: unknown): RegionCode | null {
  return value === "bac" || value === "trung" || value === "nam" ? value : null;
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

  // Strong signal = a tier A or tier B hit. Conflict when strong signals come
  // from more than one region.
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

  // Mirror-lite: only the customer's own mirror-eligible words, and only once
  // the region is at least a guess (avoid echoing stray particles on unknown).
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

function dedupe(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
