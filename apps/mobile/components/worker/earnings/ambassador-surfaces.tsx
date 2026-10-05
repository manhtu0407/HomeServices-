import { useState } from 'react'
import { Pressable, Text as RNText, View, type TextProps } from 'react-native'

import type { AmbassadorMilestoneView, AmbassadorRedeemReceiptView } from '@/lib/api-types/program'
import type { AppLanguage } from '@/lib/app-language'
import type { useWorkerAmbassador } from '@/lib/frontend-workflow/use-worker-ambassador'

import { formatVndDong, textByLanguage } from '../ui/format'
import {
  ambassadorOutlook,
  formatMultiplier,
  formatPoints,
  formatSignedPoints,
  milestoneTitle,
  pointEntryLabel,
} from './ambassador-model'
import { styles as lightStyles } from './ambassador-styles'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'
import { PrimaryCtaFill } from '@/components/ui/primary-cta-fill'

type AmbassadorController = ReturnType<typeof useWorkerAmbassador>

function Text({ style, ...props }: TextProps) {
  const styles = useWorkerThemedStyles(lightStyles)
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function formatDate(value: string, language: AppLanguage) {
  return new Date(value).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function redeemErrorCopy(code: string, language: AppLanguage): string {
  switch (code) {
    case 'BONUS_TAX_POLICY_MISSING':
      return textByLanguage(language, 'NestScout đang hoàn tất chính sách thuế cho thưởng. Bạn sẽ đổi được ngay khi chính sách được duyệt; điểm của bạn vẫn giữ nguyên.', 'NestScout is finalising the bonus tax policy. You can redeem as soon as it is approved; your points are kept.')
    case 'REDEMPTION_FROZEN':
      return textByLanguage(language, 'Quyền đổi thưởng đang tạm khóa do một hồ sơ vi phạm. Điểm của bạn vẫn giữ nguyên.', 'Redemption is paused by a violation case. Your points are kept.')
    case 'INSUFFICIENT_POINTS':
      return textByLanguage(language, 'Bạn chưa đủ điểm cho mốc này.', 'You do not have enough points for this milestone yet.')
    case 'MILESTONE_UNAVAILABLE':
      return textByLanguage(language, 'Mốc thưởng này vừa được cập nhật. Tải lại để xem mốc mới.', 'This milestone was just updated. Reload to see the current milestones.')
    case 'WORKER_NOT_ELIGIBLE':
      return textByLanguage(language, 'Tài khoản cần được duyệt và đang hoạt động để đổi thưởng.', 'Your account must be approved and active to redeem.')
    default:
      return textByLanguage(language, 'Chưa thể đổi thưởng. Kiểm tra kết nối rồi thử lại; điểm chưa bị trừ nếu biên nhận chưa hiện.', 'Could not redeem. Check your connection and try again; points are not spent until a receipt appears.')
  }
}

function ReceiptCard({ language, receipt }: { language: AppLanguage; receipt: AmbassadorRedeemReceiptView }) {
  const styles = useWorkerThemedStyles(lightStyles)
  return (
    <View accessibilityLiveRegion="polite" style={styles.receipt} testID="worker-v5-ambassador-receipt">
      <Text style={styles.noticeTitle}>{textByLanguage(language, 'Đã đổi thưởng', 'Reward redeemed')}</Text>
      <View style={styles.receiptRow}>
        <Text style={styles.receiptLabel}>{textByLanguage(language, 'Giá trị thưởng', 'Reward value')}</Text>
        <Text style={styles.receiptValue} testID="worker-v5-ambassador-receipt-gross">{formatVndDong(receipt.reward_vnd, language)}</Text>
      </View>
      <View style={styles.receiptRow}>
        <Text style={styles.receiptLabel}>{textByLanguage(language, 'Thuế khấu trừ', 'Tax withheld')}</Text>
        <Text style={styles.receiptValue} testID="worker-v5-ambassador-receipt-withheld">{formatVndDong(receipt.tax_withheld_vnd, language)}</Text>
      </View>
      <View style={styles.receiptRow}>
        <Text style={styles.receiptLabel}>{textByLanguage(language, 'Cộng vào số dư', 'Added to balance')}</Text>
        <Text style={styles.receiptNet} testID="worker-v5-ambassador-receipt-net">{formatVndDong(receipt.net_vnd, language)}</Text>
      </View>
    </View>
  )
}

function MilestoneRow({
  canRedeem,
  confirming,
  language,
  milestone,
  onPress,
  redeeming,
}: {
  canRedeem: boolean
  confirming: boolean
  language: AppLanguage
  milestone: AmbassadorMilestoneView
  onPress: () => void
  redeeming: boolean
}) {
  const styles = useWorkerThemedStyles(lightStyles)
  const title = milestoneTitle(milestone, language)
  const label = redeeming
    ? textByLanguage(language, 'Đang đổi', 'Redeeming')
    : confirming
      ? textByLanguage(language, 'Xác nhận', 'Confirm')
      : textByLanguage(language, 'Đổi', 'Redeem')
  return (
    <View style={styles.milestoneRow} testID={`worker-v5-ambassador-milestone-${milestone.rank}`}>
      <View style={styles.milestoneCopy}>
        <Text style={styles.milestoneTitle}>{title}</Text>
        <Text style={styles.milestoneMeta}>
          {textByLanguage(language, `${formatPoints(milestone.points_required * 1000, language)} điểm`, `${formatPoints(milestone.points_required * 1000, language)} points`)}
        </Text>
      </View>
      <Text style={styles.milestoneReward}>{formatVndDong(milestone.reward_vnd, language)}</Text>
      {canRedeem ? (
        <Pressable
          accessibilityHint={confirming
            ? textByLanguage(language, `Trừ ${formatPoints(milestone.points_required * 1000, language)} điểm và cộng thưởng vào số dư`, `Spends ${formatPoints(milestone.points_required * 1000, language)} points and adds the reward to your balance`)
            : undefined}
          accessibilityLabel={`${label} ${title}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: redeeming, busy: redeeming }}
          disabled={redeeming}
          onPress={onPress}
          style={({ pressed }) => [styles.redeemButton, confirming && styles.redeemButtonConfirm, pressed && styles.pressed]}
          testID={`worker-v5-ambassador-redeem-${milestone.rank}`}
        >
          {confirming ? <PrimaryCtaFill radius={0} /> : null}
          <Text style={[styles.redeemLabel, confirming && styles.redeemLabelConfirm]}>{label}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function WorkerV5Ambassador({
  controller,
  language,
  onOpenInviteCode,
  onOpenViolations,
}: {
  controller: AmbassadorController
  language: AppLanguage
  onOpenInviteCode: () => void
  onOpenViolations: () => void
}) {
  const styles = useWorkerThemedStyles(lightStyles)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const { summary } = controller

  if (!summary) {
    return (
      <View style={styles.card} testID="worker-v5-ambassador">
        <Text style={styles.sectionTitle}>
          {controller.loading
            ? textByLanguage(language, 'Đang tải chương trình thưởng', 'Loading the reward program')
            : textByLanguage(language, 'Chưa thể tải chương trình thưởng', 'The reward program is unavailable')}
        </Text>
        {!controller.loading ? (
          <Pressable accessibilityRole="button" onPress={() => void controller.reload()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} testID="worker-v5-ambassador-retry">
            <Text style={styles.secondaryLabel}>{textByLanguage(language, 'Thử lại', 'Try again')}</Text>
          </Pressable>
        ) : null}
      </View>
    )
  }

  const outlook = ambassadorOutlook(summary)
  const canRedeemAny = summary.tax_policy_ready && !outlook.redemptionFrozen
  const pressRedeem = (milestone: AmbassadorMilestoneView) => {
    if (confirmingId !== milestone.id) {
      setConfirmingId(milestone.id)
      return
    }
    setConfirmingId(null)
    void controller.redeem(milestone.id)
  }

  return (
    <View style={styles.stack} testID="worker-v5-ambassador">
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{textByLanguage(language, 'ĐIỂM ĐẠI SỨ', 'AMBASSADOR POINTS')}</Text>
        <Text style={styles.pointsValue} testID="worker-v5-ambassador-points">{formatPoints(summary.points_milli, language)}</Text>
        {summary.program ? (
          <Text style={styles.meta}>
            {textByLanguage(language, `1 điểm cho mỗi ${formatVndDong(summary.program.commission_vnd_per_point, language)} phí nền tảng từ đơn thanh toán trong app của khách bạn mang về.`, `1 point for every ${formatVndDong(summary.program.commission_vnd_per_point, language)} of platform fee from paid in-app orders by customers you brought in.`)}
          </Text>
        ) : null}
        {outlook.nextMilestone ? (
          <>
            <View
              accessibilityLabel={textByLanguage(language, 'Tiến độ tới mốc kế tiếp', 'Progress to the next milestone')}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(outlook.progressToNext * 100) }}
              style={styles.progressTrack}
              testID="worker-v5-ambassador-progress"
            >
              <View style={[styles.progressFill, { width: `${Math.round(outlook.progressToNext * 100)}%` }]} />
            </View>
            <Text style={styles.meta} testID="worker-v5-ambassador-next">
              {textByLanguage(
                language,
                `Còn ${formatPoints(outlook.nextMilestone.points_required * 1000 - summary.points_milli, language)} điểm tới mốc ${milestoneTitle(outlook.nextMilestone, language)} (${formatVndDong(outlook.nextMilestone.reward_vnd, language)}).`,
                `${formatPoints(outlook.nextMilestone.points_required * 1000 - summary.points_milli, language)} points to ${milestoneTitle(outlook.nextMilestone, language)} (${formatVndDong(outlook.nextMilestone.reward_vnd, language)}).`,
              )}
            </Text>
          </>
        ) : null}
        {outlook.bestRedeemable && outlook.nextMilestone ? (
          <Text style={styles.meta} testID="worker-v5-ambassador-compare">
            {textByLanguage(
              language,
              `Đổi ngay được ${formatVndDong(outlook.bestRedeemable.reward_vnd, language)}, hoặc giữ điểm để đạt ${formatVndDong(outlook.nextMilestone.reward_vnd, language)}. Điểm chưa đổi không hết hạn.`,
              `Redeem ${formatVndDong(outlook.bestRedeemable.reward_vnd, language)} now, or keep your points to reach ${formatVndDong(outlook.nextMilestone.reward_vnd, language)}. Unredeemed points never expire.`,
            )}
          </Text>
        ) : null}
        <Text style={styles.meta}>
          {textByLanguage(language, `${summary.active_customers} khách đang hoạt động · hệ số ${formatMultiplier(summary.multiplier_bps, language)}`, `${summary.active_customers} active customers · multiplier ${formatMultiplier(summary.multiplier_bps, language)}`)}
        </Text>
        {outlook.redemptionFrozen && summary.redemption_frozen_until ? (
          <View style={[styles.notice, styles.warningNotice]} testID="worker-v5-ambassador-frozen">
            <Text style={styles.noticeTitle}>{textByLanguage(language, 'Đổi thưởng đang tạm khóa', 'Redemption is paused')}</Text>
            <Text style={styles.noticeBody}>{textByLanguage(language, `Đến ${formatDate(summary.redemption_frozen_until, language)} do một hồ sơ vi phạm. Điểm vẫn được cộng bình thường.`, `Until ${formatDate(summary.redemption_frozen_until, language)} because of a violation case. Points still accrue.`)}</Text>
          </View>
        ) : null}
        {outlook.networkFrozen && summary.network_frozen_until ? (
          <View style={[styles.notice, styles.warningNotice]} testID="worker-v5-ambassador-network-frozen">
            <Text style={styles.noticeBody}>{textByLanguage(language, `Hệ số mạng lưới giữ ở ×1,0 đến ${formatDate(summary.network_frozen_until, language)}.`, `The network multiplier stays at ×1.0 until ${formatDate(summary.network_frozen_until, language)}.`)}</Text>
          </View>
        ) : null}
        {!summary.tax_policy_ready ? (
          <View style={styles.notice} testID="worker-v5-ambassador-tax-pending">
            <Text style={styles.noticeBody}>{redeemErrorCopy('BONUS_TAX_POLICY_MISSING', language)}</Text>
          </View>
        ) : null}
      </View>

      {summary.program && outlook.milestones.length > 0 ? (
        <View style={styles.card} testID="worker-v5-ambassador-milestones">
          <Text style={styles.sectionTitle}>{textByLanguage(language, 'Mốc thưởng', 'Milestones')}</Text>
          {outlook.topMilestone ? (
            <Text style={styles.sectionHint}>{textByLanguage(language, `Mốc cao nhất: ${formatVndDong(outlook.topMilestone.reward_vnd, language)}. Thưởng được cộng vào số dư có thể rút sau khi khấu trừ thuế theo quy định.`, `Top milestone: ${formatVndDong(outlook.topMilestone.reward_vnd, language)}. Rewards are added to your withdrawable balance after any required tax withholding.`)}</Text>
          ) : null}
          <View style={styles.milestoneList}>
            {outlook.milestones.map((milestone) => (
              <MilestoneRow
                canRedeem={canRedeemAny && milestone.points_required * 1000 <= summary.points_milli}
                confirming={confirmingId === milestone.id}
                key={milestone.id}
                language={language}
                milestone={milestone}
                onPress={() => pressRedeem(milestone)}
                redeeming={controller.redeemingMilestoneId === milestone.id}
              />
            ))}
          </View>
          {controller.redeemErrorCode ? (
            <Text accessibilityLiveRegion="polite" style={styles.errorText} testID="worker-v5-ambassador-redeem-error">{redeemErrorCopy(controller.redeemErrorCode, language)}</Text>
          ) : null}
          {controller.receipt ? <ReceiptCard language={language} receipt={controller.receipt} /> : null}
        </View>
      ) : (
        <View style={styles.card} testID="worker-v5-ambassador-no-program">
          <Text style={styles.sectionHint}>{textByLanguage(language, 'Chương trình mốc thưởng chưa mở. Điểm của bạn vẫn được ghi nhận.', 'The milestone program is not open yet. Your points are still recorded.')}</Text>
        </View>
      )}

      <Pressable accessibilityRole="button" onPress={onOpenInviteCode} style={({ pressed }) => [styles.card, styles.linkRow, pressed && styles.pressed]} testID="worker-v5-ambassador-open-invite-code">
        <View style={styles.milestoneCopy}>
          <Text style={styles.milestoneTitle}>{textByLanguage(language, 'Mã mời khách', 'Customer invite code')}</Text>
          <Text style={styles.milestoneMeta}>
            {summary.referral_code
              ? textByLanguage(language, `Mã ${summary.referral_code} · ${summary.linked_customers} khách đã liên kết`, `Code ${summary.referral_code} · ${summary.linked_customers} linked customers`)
              : textByLanguage(language, 'Tạo và chia sẻ mã trong Hồ sơ', 'Create and share your code in Profile')}
          </Text>
        </View>
        <Text style={styles.linkChevron}>›</Text>
      </Pressable>

      <View style={styles.card} testID="worker-v5-ambassador-history">
        <Text style={styles.sectionTitle}>{textByLanguage(language, 'Lịch sử điểm', 'Point history')}</Text>
        {summary.recent_entries.length === 0 ? (
          <Text style={styles.sectionHint}>{textByLanguage(language, 'Chưa có điểm nào. Điểm xuất hiện khi khách của bạn thanh toán đơn trong app.', 'No points yet. Points appear when your customers pay for an order in the app.')}</Text>
        ) : (
          <View style={styles.milestoneList}>
            {summary.recent_entries.map((entry) => (
              <View key={entry.id} style={styles.entryRow}>
                <Text style={styles.entryLabel}>{`${pointEntryLabel(entry.entry_kind, language)} · ${formatDate(entry.created_at, language)}`}</Text>
                <Text style={styles.entryValue}>{formatSignedPoints(entry.points_milli, language)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Pressable accessibilityRole="button" onPress={onOpenViolations} style={({ pressed }) => [styles.card, styles.linkRow, pressed && styles.pressed]} testID="worker-v5-ambassador-open-violations">
        <View style={styles.milestoneCopy}>
          <Text style={styles.milestoneTitle}>{textByLanguage(language, 'Quy định & hồ sơ vi phạm', 'Rules & violation record')}</Text>
          <Text style={styles.milestoneMeta}>{textByLanguage(language, 'Các mức xử lý và khiếu nại của bạn', 'Penalty levels and your appeals')}</Text>
        </View>
        <Text style={styles.linkChevron}>›</Text>
      </Pressable>
    </View>
  )
}
