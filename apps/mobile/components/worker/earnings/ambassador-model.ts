import type {
  AmbassadorMilestoneView,
  AmbassadorPointEntryKind,
  WorkerAmbassadorSummary,
} from '@/lib/api-types/program'
import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'

export type AmbassadorOutlook = {
  points: number
  milestones: AmbassadorMilestoneView[]
  topMilestone: AmbassadorMilestoneView | null
  nextMilestone: AmbassadorMilestoneView | null
  bestRedeemable: AmbassadorMilestoneView | null
  pointsToNext: number | null
  progressToNext: number
  redemptionFrozen: boolean
  networkFrozen: boolean
}

// Points are held in thousandths on the server. The screen shows one decimal, rounded toward
// zero, so it never shows a fraction of a point the ledger cannot back.
export function displayPoints(pointsMilli: number): number {
  return Math.trunc(pointsMilli / 100) / 10
}

export function formatPoints(pointsMilli: number, language: AppLanguage): string {
  return displayPoints(pointsMilli).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 1 })
}

function isFuture(value: string | null, now: number): boolean {
  return value !== null && Date.parse(value) > now
}

export function ambassadorOutlook(summary: WorkerAmbassadorSummary, now = Date.now()): AmbassadorOutlook {
  const points = summary.points_milli / 1000
  const milestones = [...(summary.program?.milestones ?? [])].sort((a, b) => a.points_required - b.points_required)
  const nextMilestone = milestones.find((milestone) => milestone.points_required > points) ?? null
  const redeemable = milestones.filter((milestone) => milestone.points_required <= points)
  const previousFloor = redeemable.at(-1)?.points_required ?? 0
  const span = nextMilestone ? nextMilestone.points_required - previousFloor : 0
  return {
    points,
    milestones,
    topMilestone: milestones.at(-1) ?? null,
    nextMilestone,
    bestRedeemable: redeemable.at(-1) ?? null,
    pointsToNext: nextMilestone ? nextMilestone.points_required - points : null,
    progressToNext: nextMilestone && span > 0
      ? Math.min(1, Math.max(0, (points - previousFloor) / span))
      : milestones.length > 0 ? 1 : 0,
    redemptionFrozen: isFuture(summary.redemption_frozen_until, now),
    networkFrozen: isFuture(summary.network_frozen_until, now),
  }
}

export function formatMultiplier(multiplierBps: number, language: AppLanguage): string {
  const value = multiplierBps / 10000
  return `×${value.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2, minimumFractionDigits: 1 })}`
}

export function milestoneTitle(milestone: AmbassadorMilestoneView, language: AppLanguage): string {
  return language === 'vi' ? milestone.title_vi : milestone.title_en
}

export function pointEntryLabel(kind: AmbassadorPointEntryKind, language: AppLanguage): string {
  switch (kind) {
    case 'order_accrual':
      return textByLanguage(language, 'Khách của bạn thanh toán trong app', 'Your customer paid in the app')
    case 'accrual_reversal':
      return textByLanguage(language, 'Đơn được hoàn hoặc hủy ghi nhận', 'Order refunded or reversed')
    case 'redemption':
      return textByLanguage(language, 'Đổi thưởng', 'Reward redeemed')
    case 'penalty_debit':
      return textByLanguage(language, 'Trừ điểm do vi phạm', 'Points deducted for a violation')
    case 'penalty_forfeit':
      return textByLanguage(language, 'Mất điểm do vi phạm nghiêm trọng', 'Points forfeited for a serious violation')
    case 'appeal_restore':
      return textByLanguage(language, 'Khôi phục sau khiếu nại', 'Restored after appeal')
    case 'admin_correction':
      return textByLanguage(language, 'Điều chỉnh bởi quản trị viên', 'Adjusted by an administrator')
  }
}

export function formatSignedPoints(pointsMilli: number, language: AppLanguage): string {
  const unit = textByLanguage(language, 'điểm', 'pts')
  return `${pointsMilli > 0 ? '+' : ''}${formatPoints(pointsMilli, language)} ${unit}`
}
