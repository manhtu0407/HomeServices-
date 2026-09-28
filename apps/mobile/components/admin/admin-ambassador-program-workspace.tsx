import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, spacing } from '@/design/theme'
import type {
  AdminAmbassadorProgramDraftInput,
  AdminAmbassadorProgramResponse,
  AdminAmbassadorProgramVersion,
} from '@/lib/api-types/admin-program'
import type { AppLanguage } from '@/lib/app-language'
import { adminProgramService } from '@/lib/services/admin-program-service'

import { AdminSystemField, AdminSystemState } from './admin-system-controls'
import { AdminText } from './admin-text'

// Mirrors the database trigger so the editor can warn before saving; the trigger stays the
// authority and rejects any version that breaks it.
export const AMBASSADOR_PAYOUT_CAP_BPS = 6000

type Draft = AdminAmbassadorProgramDraftInput

function draftFrom(version: AdminAmbassadorProgramVersion): Draft {
  return {
    commission_vnd_per_point: version.commission_vnd_per_point,
    customer_vnd_per_point: version.customer_vnd_per_point,
    link_months: version.link_months,
    network_window_days: version.network_window_days,
    rebook_min_jobs: version.rebook_min_jobs,
    invite_claim_days: version.invite_claim_days,
    milestones: version.milestones.map(({ id: _id, ...milestone }) => milestone),
    multipliers: version.multipliers,
  }
}

export function milestonePayoutBps(draft: Draft, milestone: Draft['milestones'][number]): number {
  const maxMultiplier = Math.max(10000, ...draft.multipliers.map((tier) => tier.multiplier_bps))
  const commission = milestone.points_required * draft.commission_vnd_per_point
  if (commission <= 0) return Number.POSITIVE_INFINITY
  // Not rounded: the database compares the exact ratio, so a preview may not round a breach away.
  return (milestone.reward_vnd * maxMultiplier) / commission
}

function asInt(value: string) {
  const parsed = Number(value.replace(/\D/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function AdminAmbassadorProgramWorkspace({ language }: { language: AppLanguage }) {
  const vi = language === 'vi'
  const [program, setProgram] = useState<AdminAmbassadorProgramResponse | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const result = await adminProgramService.getAmbassadorProgram()
    if (!result.success) {
      setError(result.error || (vi ? 'Chưa tải được chương trình thưởng' : 'Could not load the reward program'))
      return
    }
    setProgram(result.data)
    const source = result.data.draft ?? result.data.approved
    setDraft(source ? draftFrom(source) : null)
  }, [vi])

  useEffect(() => {
    void load()
  }, [load])

  if (!program || !draft) {
    return error
      ? <AdminSystemState actionLabel={vi ? 'Thử lại' : 'Retry'} label={error} onAction={() => void load()} />
      : <AdminSystemState label={vi ? 'Đang tải' : 'Loading'} loading />
  }

  const overCap = draft.milestones.filter((milestone) => milestonePayoutBps(draft, milestone) > AMBASSADOR_PAYOUT_CAP_BPS)
  const setMilestone = (index: number, patch: Partial<Draft['milestones'][number]>) =>
    setDraft({ ...draft, milestones: draft.milestones.map((item, i) => i === index ? { ...item, ...patch } : item) })

  const save = async () => {
    setPending(true)
    setNotice(null)
    const result = await adminProgramService.saveAmbassadorProgramDraft(draft)
    setPending(false)
    if (!result.success) {
      setNotice(result.error || (vi ? 'Chưa lưu được bản nháp' : 'Could not save the draft'))
      return
    }
    setNotice(result.data.violations.length > 0
      ? `${vi ? 'Đã lưu, nhưng chưa thể duyệt' : 'Saved, but it cannot be approved yet'}: ${result.data.violations.join(', ')}`
      : (vi ? 'Đã lưu bản nháp. Một quản trị viên khác cần duyệt.' : 'Draft saved. Another administrator must approve it.'))
    await load()
  }

  const approve = async () => {
    if (!program.draft) return
    setPending(true)
    setNotice(null)
    const result = await adminProgramService.approveAmbassadorProgram(program.draft.id)
    setPending(false)
    setNotice(result.success ? (vi ? 'Đã duyệt. Phiên bản mới áp dụng cho các lần đổi thưởng tiếp theo.' : 'Approved. The new version applies to future redemptions.') : result.error || (vi ? 'Chưa duyệt được' : 'Could not approve'))
    if (result.success) await load()
  }

  return <ScrollView contentContainerStyle={styles.content} testID="admin-ambassador-program">
    <AdminText textRole="title2">{vi ? 'Chương trình thưởng đại sứ' : 'Ambassador reward program'}</AdminText>
    <AdminSystemField label={vi ? 'Đang áp dụng' : 'Approved'} value={program.approved ? `v${program.approved.version} · ${program.approved.approved_at ?? ''}` : (vi ? 'Chưa có' : 'None')} />
    <AdminSystemField label={vi ? 'Bản nháp' : 'Draft'} value={program.draft ? `v${program.draft.version}` : (vi ? 'Chưa có — sửa bên dưới để tạo' : 'None — edit below to create one')} />
    <AdminText textRole="caption1" style={styles.meta}>
      {vi
        ? `Trần an toàn: thưởng của mọi mốc, ở hệ số cao nhất, không vượt ${AMBASSADOR_PAYOUT_CAP_BPS / 100}% phí nền tảng mà số điểm đó đại diện.`
        : `Safety cap: no milestone, at the highest multiplier, may pay more than ${AMBASSADOR_PAYOUT_CAP_BPS / 100}% of the platform fee its points represent.`}
    </AdminText>

    <KaelTextField accessibilityLabel={vi ? 'Phí nền tảng cho 1 điểm (VND)' : 'Platform fee per point (VND)'} keyboardType="number-pad" label={vi ? 'Phí nền tảng cho 1 điểm (VND)' : 'Platform fee per point (VND)'} onChangeText={(value) => setDraft({ ...draft, commission_vnd_per_point: asInt(value) })} value={String(draft.commission_vnd_per_point)} />
    <KaelTextField accessibilityLabel={vi ? 'Khách: VND cho 1 điểm thành viên' : 'Customer VND per membership point'} keyboardType="number-pad" label={vi ? 'Khách: VND cho 1 điểm thành viên' : 'Customer VND per membership point'} onChangeText={(value) => setDraft({ ...draft, customer_vnd_per_point: asInt(value) })} value={String(draft.customer_vnd_per_point)} />

    <AdminText textRole="headline">{vi ? 'Mốc thưởng' : 'Milestones'}</AdminText>
    {draft.milestones.map((milestone, index) => {
      const bps = milestonePayoutBps(draft, milestone)
      const breaks = bps > AMBASSADOR_PAYOUT_CAP_BPS
      return <View key={index} style={styles.milestone} testID={`admin-ambassador-milestone-${index}`}>
        <KaelTextField accessibilityLabel={vi ? 'Tên mốc' : 'Milestone name'} label={vi ? 'Tên mốc' : 'Name'} onChangeText={(value) => setMilestone(index, { title_vi: value })} value={milestone.title_vi} />
        <KaelTextField accessibilityLabel={vi ? 'Tên tiếng Anh' : 'English name'} label={vi ? 'Tên tiếng Anh' : 'English name'} onChangeText={(value) => setMilestone(index, { title_en: value })} value={milestone.title_en} />
        <KaelTextField accessibilityLabel={vi ? 'Số điểm' : 'Points'} keyboardType="number-pad" label={vi ? 'Số điểm' : 'Points'} onChangeText={(value) => setMilestone(index, { points_required: asInt(value) })} value={String(milestone.points_required)} />
        <KaelTextField accessibilityLabel={vi ? 'Thưởng (VND)' : 'Reward (VND)'} keyboardType="number-pad" label={vi ? 'Thưởng (VND)' : 'Reward (VND)'} onChangeText={(value) => setMilestone(index, { reward_vnd: asInt(value) })} value={String(milestone.reward_vnd)} />
        <AdminText textRole="caption1" style={breaks ? styles.danger : styles.meta} testID={`admin-ambassador-milestone-${index}-cap`}>
          {Number.isFinite(bps)
            ? `${vi ? 'Tỷ lệ chi trả tối đa' : 'Max payout ratio'}: ${(bps / 100).toFixed(2)}%${breaks ? (vi ? ' — vượt trần' : ' — over the cap') : ''}`
            : (vi ? 'Cần số điểm và phí lớn hơn 0' : 'Points and fee must be above 0')}
        </AdminText>
        <KaelButton label={vi ? 'Xóa mốc này' : 'Remove milestone'} onPress={() => setDraft({ ...draft, milestones: draft.milestones.filter((_, i) => i !== index).map((item, i) => ({ ...item, rank: i + 1 })) })} variant="secondary" />
      </View>
    })}
    <KaelButton label={vi ? 'Thêm mốc' : 'Add milestone'} onPress={() => setDraft({ ...draft, milestones: [...draft.milestones, { rank: draft.milestones.length + 1, title_vi: '', title_en: '', points_required: 0, reward_vnd: 0 }] })} variant="secondary" />

    {overCap.length > 0 ? <AdminText accessibilityRole="alert" textRole="subheadline" style={styles.danger}>
      {vi ? `${overCap.length} mốc vượt trần; máy chủ sẽ không cho duyệt.` : `${overCap.length} milestone(s) over the cap; the server will refuse approval.`}
    </AdminText> : null}
    <KaelButton disabled={pending} label={vi ? 'Lưu bản nháp' : 'Save draft'} onPress={() => { void save() }} testID="admin-ambassador-save" variant="primary" />
    {program.draft ? <KaelButton disabled={pending || program.draft.violations.length > 0} label={vi ? 'Duyệt bản nháp' : 'Approve draft'} onPress={() => { void approve() }} testID="admin-ambassador-approve" variant="secondary" /> : null}
    {program.draft && program.draft.violations.length > 0 ? <AdminText textRole="caption1" style={styles.danger}>{program.draft.violations.join(', ')}</AdminText> : null}
    {notice ? <AdminText accessibilityRole="alert" textRole="subheadline" testID="admin-ambassador-notice">{notice}</AdminText> : null}
  </ScrollView>
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  milestone: {
    borderColor: color.surface.stroke,
    borderRadius: 16,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  meta: {
    color: color.text.muted,
  },
  danger: {
    color: color.accent.destructive,
  },
})
