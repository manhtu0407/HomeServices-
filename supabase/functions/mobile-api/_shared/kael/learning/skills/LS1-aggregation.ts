export type LS1PriceSample = {
  market_range_min?: number | null;
  market_range_max?: number | null;
  price_min?: number | null;
  price_max?: number | null;
  final_price?: number | null;
  confidence?: number | null;
  trust_score?: number | null;
  effective_trust_score?: number | null;
};

export type LS1AggregationResult = {
  method: "median_2sigma_weighted";
  evidence_count: number;
  rejected_outlier_count: number;
  suggested_min: number;
  suggested_max: number;
  weighted_midpoint: number;
};

type NormalizedSample = {
  min: number;
  max: number;
  midpoint: number;
  weight: number;
};

export function buildLS1Aggregation(
  samples: readonly LS1PriceSample[],
): LS1AggregationResult | null {
  const normalized = samples
    .map(normalizeSample)
    .filter((sample): sample is NormalizedSample => sample !== null);
  if (normalized.length === 0) return null;

  const filtered = rejectOutliersMedianSigma(normalized);
  if (filtered.length === 0) return null;

  const suggestedMin = weightedMedian(
    filtered.map((sample) => ({ value: sample.min, weight: sample.weight })),
  );
  const suggestedMax = weightedMedian(
    filtered.map((sample) => ({ value: sample.max, weight: sample.weight })),
  );
  const weightedMidpoint = weightedMedian(
    filtered.map((sample) => ({
      value: sample.midpoint,
      weight: sample.weight,
    })),
  );
  if (suggestedMin === null || suggestedMax === null || weightedMidpoint === null) {
    return null;
  }

  return {
    method: "median_2sigma_weighted",
    evidence_count: filtered.length,
    rejected_outlier_count: normalized.length - filtered.length,
    suggested_min: Math.round(Math.min(suggestedMin, suggestedMax)),
    suggested_max: Math.round(Math.max(suggestedMin, suggestedMax)),
    weighted_midpoint: Math.round(weightedMidpoint),
  };
}

export function rejectOutliersMedianSigma<T extends { midpoint: number }>(
  samples: readonly T[],
): T[] {
  if (samples.length < 3) return [...samples];
  const midpointMedian = median(samples.map((sample) => sample.midpoint));
  if (midpointMedian === null) return [];
  const sigma = standardDeviation(samples.map((sample) => sample.midpoint));
  if (sigma === 0) return [...samples];
  const lower = midpointMedian - 2 * sigma;
  const upper = midpointMedian + 2 * sigma;
  return samples.filter((sample) =>
    sample.midpoint >= lower && sample.midpoint <= upper
  );
}

export function weightedMedian(
  values: ReadonlyArray<{ value: number; weight?: number | null }>,
): number | null {
  const normalized = values
    .map((item) => ({
      value: finiteNumber(item.value),
      weight: finiteNumber(item.weight ?? 1),
    }))
    .filter((item): item is { value: number; weight: number } =>
      item.value !== null && item.weight !== null && item.weight > 0
    )
    .sort((left, right) => left.value - right.value);
  if (normalized.length === 0) return null;

  const totalWeight = normalized.reduce((sum, item) => sum + item.weight, 0);
  let cumulative = 0;
  for (const item of normalized) {
    cumulative += item.weight;
    if (cumulative >= totalWeight / 2) return item.value;
  }
  return normalized[normalized.length - 1]?.value ?? null;
}

export function median(values: readonly number[]): number | null {
  const sorted = values
    .map(finiteNumber)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeSample(sample: LS1PriceSample): NormalizedSample | null {
  const explicitMin = finiteNumber(sample.market_range_min ?? sample.price_min);
  const explicitMax = finiteNumber(sample.market_range_max ?? sample.price_max);
  const finalPrice = finiteNumber(sample.final_price);
  const min = explicitMin ?? finalPrice;
  const max = explicitMax ?? finalPrice;
  if (min === null || max === null || min <= 0 || max <= 0) return null;
  const trustWeight = finiteNumber(
    sample.effective_trust_score ?? sample.trust_score,
  ) ?? 1;
  const confidence = finiteNumber(sample.confidence) ?? 1;
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    midpoint: (min + max) / 2,
    weight: Math.max(0.1, Math.min(1, trustWeight) * Math.min(1, confidence)),
  };
}

function standardDeviation(values: readonly number[]): number {
  const valid = values
    .map(finiteNumber)
    .filter((value): value is number => value !== null);
  if (valid.length === 0) return 0;
  const avg = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const variance = valid.reduce(
    (sum, value) => sum + (value - avg) ** 2,
    0,
  ) / valid.length;
  return Math.sqrt(variance);
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
