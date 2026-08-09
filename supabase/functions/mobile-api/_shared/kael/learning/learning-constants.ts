// Single source for the learning evidence-gate thresholds (STRUCTURES.md
// §10C). The SQL twin lives in migration 20260714101000 and is pinned to
// these numbers by a schema test; change both together or CI goes red.
export const EDGE_MIN_EVIDENCE = 5;
export const EDGE_CONFIDENCE_THRESHOLD = 0.6;
export const CONTRADICTION_MAX_RATIO = 0.2;
export const ROLLING_WINDOW_DAYS = 90;

// How far back a candidate still counts as "recent" for the contradiction check, and
// the smallest directional sample the ratio may be read from. The pair is what keeps a
// scope from being locked out permanently: the floor stops a 1-row history from reading
// as a 100% contradiction, and the window lets old disagreements age out of the sample.
// Neither alone is enough — at n=3 a single disagreement is still 33% and still blocks.
export const CONTRADICTION_WINDOW_DAYS = 90;
export const CONTRADICTION_MIN_SAMPLE = 3;
