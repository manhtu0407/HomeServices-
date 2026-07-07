export type RegionCode = "bac" | "trung" | "nam";
export type LexiconTier = "A" | "B" | "C";

export type LexiconMarker = {
  readonly term: string;
  readonly region: RegionCode;
  readonly mirror?: boolean;
};

export type RegionalLexicon = {
  readonly lexicon_version: string;
  readonly regions: readonly RegionCode[];
  readonly default_region: RegionCode;
  readonly scoring: {
    readonly weights: Record<LexiconTier, number>;
    readonly guess_threshold: number;
    readonly recognize_threshold: number;
    readonly conflict_penalty: number;
    // Documents the rule the detector hardcodes: a recognize needs a tier-A hit
    // or >=2 consistent tier-B hits. Carried here so the Edge copy fully mirrors
    // the charter JSON and the sync test catches any drift.
    readonly recognize_requires_tier_a_or_two_b: boolean;
  };
  readonly tiers: Record<LexiconTier, {
    readonly mirror_eligible: boolean;
    readonly markers: readonly LexiconMarker[];
  }>;
};

export const REGIONAL_LEXICON: RegionalLexicon = {
  lexicon_version: "1.0.0",
  regions: ["bac", "trung", "nam"],
  default_region: "nam",
  scoring: {
    weights: { A: 3, B: 2, C: 1 },
    guess_threshold: 3,
    recognize_threshold: 5,
    conflict_penalty: 3,
    recognize_requires_tier_a_or_two_b: true,
  },
  tiers: {
    A: {
      mirror_eligible: false,
      markers: [
        { term: "mô", region: "trung" },
        { term: "rứa", region: "trung" },
        { term: "ni", region: "trung" },
        { term: "nớ", region: "trung" },
        { term: "ri", region: "trung" },
        { term: "nỏ", region: "trung" },
        { term: "mần", region: "trung" },
        { term: "hầy", region: "trung" },
      ],
    },
    B: {
      mirror_eligible: true,
      markers: [
        { term: "chén", region: "nam" },
        { term: "muỗng", region: "nam" },
        { term: "quẹo", region: "nam" },
        { term: "hổng", region: "nam" },
        { term: "hông", region: "nam" },
        { term: "bát", region: "bac" },
        { term: "thìa", region: "bac" },
        { term: "đọi", region: "trung" },
        { term: "mạ", region: "trung" },
      ],
    },
    C: {
      mirror_eligible: true,
      markers: [
        { term: "nha", region: "nam", mirror: true },
        { term: "nghen", region: "nam", mirror: true },
        { term: "nghe", region: "nam", mirror: true },
        { term: "nè", region: "nam", mirror: true },
        { term: "hén", region: "nam", mirror: true },
        { term: "dzô", region: "nam", mirror: false },
        { term: "dzui", region: "nam", mirror: false },
        { term: "nhé", region: "bac", mirror: true },
        { term: "nhá", region: "bac", mirror: true },
        { term: "đấy", region: "bac", mirror: false },
        { term: "cơ", region: "bac", mirror: false },
        { term: "hè", region: "trung", mirror: false },
      ],
    },
  },
};
