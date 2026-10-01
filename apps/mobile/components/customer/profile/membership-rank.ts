import type { CustomerProfileInsightsResponse } from '@/lib/api-types'
import type { AppLanguage } from '@/lib/app-language'

const MAX_RANK = 5

export type MembershipRank = {
  rank: number | null
  points: number | null
  pointsLabel: string | null
  progressPercent: number
  levelProgressPercent: number
  nextRank: number | null
  pointsToNext: number | null
}

function formatNumber(value: number, language: AppLanguage) {
  return new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US').format(value)
}

// Membership points come from the paid-order ledger and the level thresholds come from the
// server, so the screen never assumes a fixed number of points per level.
export function membershipRank(
  insights: CustomerProfileInsightsResponse | null | undefined,
  language: AppLanguage,
): MembershipRank {
  const rank = typeof insights?.usage_rank_level === 'number' ? Math.max(0, Math.min(MAX_RANK, insights.usage_rank_level)) : null
  const points = typeof insights?.usage_rank_points === 'number' ? Math.max(0, insights.usage_rank_points) : null
  const floor = typeof insights?.usage_rank_level_floor_points === 'number' ? insights.usage_rank_level_floor_points : null
  const next = typeof insights?.usage_rank_next_level_points === 'number' ? insights.usage_rank_next_level_points : null
  if (rank === null || points === null) {
    return { rank, points, pointsLabel: null, progressPercent: 0, levelProgressPercent: 0, nextRank: null, pointsToNext: null }
  }
  const unit = language === 'vi' ? 'điểm' : 'points'
  const pointsLabel = next !== null
    ? `${formatNumber(points, language)} / ${formatNumber(next, language)} ${unit}`
    : `${formatNumber(points, language)} ${unit}`
  const span = next !== null && floor !== null ? next - floor : 0
  const fraction = rank >= MAX_RANK ? 1 : span > 0 && floor !== null ? Math.min(1, Math.max(0, (points - floor) / span)) : 0
  const hasNext = rank >= 1 && rank < MAX_RANK && next !== null
  return {
    rank,
    points,
    pointsLabel,
    progressPercent: rank > 0 ? Math.round(fraction * 100) : 0,
    levelProgressPercent: rank > 0 ? Math.min(100, Math.round(((rank - 1 + fraction) / (MAX_RANK - 1)) * 100)) : 0,
    nextRank: hasNext ? rank + 1 : null,
    pointsToNext: hasNext && next !== null ? Math.max(0, next - points) : null,
  }
}
