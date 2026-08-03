export type WorkerPerformanceInsightReviewRow = {
  rating: number | null;
  tags: string[];
};

export type WorkerPerformanceInsightIncidentCaseRow = {
  kael_review: Record<string, unknown> | null;
  status: string;
};

const positiveWorkResponseTags = new Set([
  "chuyên nghiệp",
  "professional",
  "giải thích rõ ràng",
  "explained clearly",
  "phản hồi nhanh",
  "responsive",
  "trao đổi rõ ràng",
  "clear communication",
]);

const negativeWorkResponseTags = new Set([
  "phản hồi chậm",
  "slow response",
  "khó trao đổi",
  "unclear communication",
]);

export function calculateKaelWorkResponseScore(reviews: WorkerPerformanceInsightReviewRow[]) {
  const reviewScores = reviews
    .filter((review) => typeof review.rating === "number" && Number.isFinite(review.rating) && review.rating > 0 && review.rating <= 5)
    .map((review) => {
      const tags = new Set(review.tags.map(normalizeWorkerPerformanceTag));
      const hasPositiveSignal = Array.from(positiveWorkResponseTags).some((tag) => tags.has(tag));
      const hasNegativeSignal = Array.from(negativeWorkResponseTags).some((tag) => tags.has(tag));
      const baseScore = Math.round(((review.rating ?? 0) / 5) * 80);
      const tagAdjustment = (hasPositiveSignal ? 20 : 0) - (hasNegativeSignal ? 20 : 0);
      return Math.max(0, Math.min(100, baseScore + tagAdjustment));
    });
  return {
    reviewCount: reviewScores.length,
    score: reviewScores.length > 0
      ? Math.round(reviewScores.reduce((total, score) => total + score, 0) / reviewScores.length)
      : null,
  };
}

export function isWorkerPerformanceResolvedIncidentCase(row: WorkerPerformanceInsightIncidentCaseRow) {
  return ["approved_by_customer", "rejected_by_customer"].includes(row.status) && row.kael_review !== null;
}

function normalizeWorkerPerformanceTag(value: string) {
  return value.trim().toLocaleLowerCase();
}
