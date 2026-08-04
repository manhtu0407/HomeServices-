export const KAEL_DETERMINISTIC_DECISION_SURFACES = [
  "price_lock",
  "job_status_transition",
  "scope_change_decision",
  "cancellation_outcome",
  "dispute_outcome",
  "penalty_or_compensation",
  "evidence_lock",
] as const;

export type KaelDeterministicDecisionSurface =
  (typeof KAEL_DETERMINISTIC_DECISION_SURFACES)[number];

export type KaelAiBoundaryViolation = {
  readonly surface: KaelDeterministicDecisionSurface;
  readonly reason: string;
};

export type KaelAiBoundaryDecision = {
  readonly allowed: boolean;
  readonly violations: readonly KaelAiBoundaryViolation[];
};

const PRICE_OR_PAYMENT_PATTERNS: Array<[KaelDeterministicDecisionSurface, RegExp, string]> = [
  ["price_lock", /\b(?:final\s*price|exact\s*price|ch[o\u1ed1]t\s*gi[a\u00e1]|gi[a\u00e1]\s*cu[\u1ed1]i|set\s*price|lock\s*price)\b/i, "price_lock_claim"],
  ["price_lock", /\b\d{2,9}\s*(?:vnd|vn\u0111|dong|d|\u0111|k)\b/i, "exact_money_amount"],
  ["penalty_or_compensation", /\b(?:refund|compensation|penalty|fine|chargeback|ho[a\u00e0]n\s*ti[e\u1ec1]n|b[o\u1ed3]i\s*th[u\u01b0]\u1eddng|ph[a\u1ea1]t|t[i\u00ed]nh\s*ph[i\u00ed])\b/i, "penalty_or_compensation_claim"],
];

const STATUS_OR_SCOPE_PATTERNS: Array<[KaelDeterministicDecisionSurface, RegExp, string]> = [
  ["job_status_transition", /\b(?:mark|set|update|change|confirm|complete)\b.{0,32}\b(?:status|tr[a\u1ea1]ng\s*th[a\u00e1]i|completed|ho[a\u00e0]n\s*t[a\u1ea5]t)\b/i, "status_mutation_claim"],
  ["job_status_transition", /\b(?:c[a\u1ead]p\s*nh[a\u1ead]t|chuy[e\u1ec3]n|b[a\u00e1]o|x[a\u00e1]c\s*nh[a\u1ead]n)\b.{0,32}\b(?:tr[a\u1ea1]ng\s*th[a\u00e1]i|ho[a\u00e0]n\s*t[a\u1ea5]t)\b/i, "status_mutation_claim"],
  ["scope_change_decision", /\b(?:approve|reject|duy[e\u1ec7]t|t[\u1eeb]\s*ch[\u1ed1]i|ch[a\u1ea5]p\s*nh[a\u1ead]n|b[a\u00e1]c)\b.{0,40}\b(?:scope|ph[a\u1ea1]m\s*vi|ph[a\u00e1]t\s*sinh)\b/i, "scope_decision_claim"],
  ["scope_change_decision", /\b(?:scope|ph[a\u1ea1]m\s*vi|ph[a\u00e1]t\s*sinh)\b.{0,40}\b(?:approved|rejected|duy[e\u1ec7]t|t[\u1eeb]\s*ch[\u1ed1]i)\b/i, "scope_decision_claim"],
];

const OUTCOME_PATTERNS: Array<[KaelDeterministicDecisionSurface, RegExp, string]> = [
  ["cancellation_outcome", /\b(?:cancel|h[u\u1ef7]y)\b.{0,36}\b(?:approved|rejected|duy[e\u1ec7]t|t[\u1eeb]\s*ch[\u1ed1]i|no\s*charge|kh[o\u00f4]ng\s*t[i\u00ed]nh\s*ph[i\u00ed])\b/i, "cancellation_outcome_claim"],
  ["dispute_outcome", /\b(?:dispute|tranh\s*ch[a\u1ea5]p|khi[e\u1ebf]u\s*n[a\u1ea1]i)\b.{0,48}\b(?:resolved|decided|win|lose|refund|compensation|th[a\u1eaf]ng|thua|ho[a\u00e0]n\s*ti[e\u1ec1]n|b[o\u1ed3]i\s*th[u\u01b0]\u1eddng)\b/i, "dispute_outcome_claim"],
  ["dispute_outcome", /\b(?:customer|worker|kh[a\u00e1]ch|th[o\u1ee3])\b.{0,24}\b(?:wins?|loses?|th[a\u1eaf]ng|thua|fault|l[o\u1ed7]i)\b/i, "party_fault_claim"],
  ["evidence_lock", /\b(?:lock|seal|finalize|kh[o\u00f3]a|ch[o\u1ed1]t)\b.{0,36}\b(?:evidence|b[a\u1eb1]ng\s*ch[\u1ee9]ng)\b/i, "evidence_lock_claim"],
];

const NEGATED_DECISION_PREFIX =
  /\b(?:do\s*not|don't|cannot|can't|kh[o\u00f4]ng|ch\u01b0a|kh[o\u00f4]ng\s*\u0111\u01b0\u1ee3c|khong|khong duoc)\b.{0,28}$/i;

export function detectForbiddenAiDecisionText(
  text: string,
): KaelAiBoundaryDecision {
  const violations: KaelAiBoundaryViolation[] = [];
  for (const [surface, pattern, reason] of [
    ...PRICE_OR_PAYMENT_PATTERNS,
    ...STATUS_OR_SCOPE_PATTERNS,
    ...OUTCOME_PATTERNS,
  ]) {
    const match = pattern.exec(text);
    if (!match) continue;
    const before = text.slice(Math.max(0, match.index - 36), match.index);
    if (NEGATED_DECISION_PREFIX.test(before)) continue;
    violations.push({ surface, reason });
  }
  return {
    allowed: violations.length === 0,
    violations,
  };
}

