// Single source for the learning evidence-gate thresholds (STRUCTURES.md
// §10C). The SQL twin lives in migration 20260714101000 and is pinned to
// these numbers by a schema test; change both together or CI goes red.
export const EDGE_MIN_EVIDENCE = 5;
export const EDGE_CONFIDENCE_THRESHOLD = 0.6;
export const CONTRADICTION_MAX_RATIO = 0.2;
export const ROLLING_WINDOW_DAYS = 90;
