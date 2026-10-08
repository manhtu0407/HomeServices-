import { useCallback, useEffect, useReducer } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native'

import { color, radius, spacing, typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import {
  adminControlService,
  type AdminIntakePolicy,
  type AdminIntakePolicyPreview,
  type AdminPriceBaselineVersion,
} from '@/lib/services/admin-control-service'

import { AdminText } from './admin-text'
import { withoutInputLineHeight } from '@/components/ui/input-text-style'

const copy = {
  vi: {
    actionError: 'Không thể hoàn tất thao tác. Hãy tải lại dữ liệu và thử lại.',
    approve: 'Phê duyệt',
    blocked: 'Chặn nhận yêu cầu',
    draft: 'Tạo bản nháp',
    empty: 'Chưa có chính sách quản trị.',
    evidence: 'Nguồn bằng chứng',
    evidenceLocks: 'Điều kiện bằng chứng khóa theo phiên bản',
    highTrustSources: 'Số nguồn tin cậy cao tối thiểu',
    activeBaseline: 'Bắt buộc nền tảng giá đang hoạt động',
    safetyLocks: 'Khóa an toàn và năng lực',
    sourceCount: 'Tổng số nguồn tối thiểu',
    inspection: 'Chỉ khảo sát',
    loading: 'Đang tải chính sách...',
    missing: 'Thông tin còn thiếu',
    policies: 'Chính sách tiếp nhận',
    preview: 'Xem trước khi thiếu dữ liệu',
    pricePolicies: 'Phiên bản nền tảng giá',
    publish: 'Kích hoạt',
    reason: 'Lý do thay đổi (bắt buộc)',
    refresh: 'Tải lại',
    rfq: 'Mời thợ báo giá',
    rollback: 'Hoàn tác về phiên bản này',
    routed: 'Kael báo giá có kiểm chứng',
    status: 'Trạng thái',
    success: 'Đã lưu thay đổi. Một quản trị viên khác phải thực hiện bước kiểm tra độc lập.',
    version: 'Phiên bản',
  },
  en: {
    actionError: 'Unable to complete the action. Refresh and try again.',
    approve: 'Approve',
    blocked: 'Block intake',
    draft: 'Create draft',
    empty: 'No governed policy is available.',
    evidence: 'Evidence sources',
    evidenceLocks: 'Version-locked evidence requirements',
    highTrustSources: 'Minimum high-trust sources',
    activeBaseline: 'Require an active price baseline',
    safetyLocks: 'Safety and capability locks',
    sourceCount: 'Minimum total sources',
    inspection: 'Inspection only',
    loading: 'Loading policies...',
    missing: 'Missing information',
    policies: 'Intake policies',
    preview: 'Preview with missing data',
    pricePolicies: 'Price baseline versions',
    publish: 'Activate',
    reason: 'Change reason (required)',
    refresh: 'Refresh',
    rfq: 'Request worker quotes',
    rollback: 'Roll back to this version',
    routed: 'Kael verified quote',
    status: 'Status',
    success: 'Change saved. A different administrator must perform the independent check.',
    version: 'Version',
  },
} as const

type AdminPolicyState = {
  acting: boolean
  baselines: AdminPriceBaselineVersion[]
  error: string | null
  evidenceRequirements: AdminIntakePolicy['evidence_requirements']
  loading: boolean
  message: string | null
  policies: AdminIntakePolicy[]
  preview: AdminIntakePolicyPreview | null
  quoteMode: AdminIntakePolicy['quote_mode']
  reason: string
  selectedPolicyId: string | null
}

type AdminPolicyAction = { type: 'patch'; patch: Partial<AdminPolicyState> }

function initialAdminPolicyState(): AdminPolicyState {
  return {
    acting: false,
    baselines: [],
    error: null,
    evidenceRequirements: defaultEvidenceRequirements('rfq'),
    loading: true,
    message: null,
    policies: [],
    preview: null,
    quoteMode: 'rfq',
    reason: '',
    selectedPolicyId: null,
  }
}

function adminPolicyReducer(state: AdminPolicyState, action: AdminPolicyAction): AdminPolicyState {
  return { ...state, ...action.patch }
}

export function AdminPolicyGovernance({ language }: { language: AppLanguage }) {
  const labels = copy[language]
  const [state, dispatch] = useReducer(adminPolicyReducer, undefined, initialAdminPolicyState)
  const {
    acting, baselines, error, evidenceRequirements, loading, message, policies,
    preview, quoteMode, reason, selectedPolicyId,
  } = state

  const load = useCallback(async () => {
    dispatch({ type: 'patch', patch: { error: null, loading: true } })
    const [policyResult, priceResult] = await Promise.all([
      adminControlService.listIntakePolicies(),
      adminControlService.listPriceBaselineVersions(),
    ])
    const patch: Partial<AdminPolicyState> = {
      error: !priceResult.success
        ? priceResult.error
        : !policyResult.success ? policyResult.error : null,
      loading: false,
    }
    if (policyResult.success) {
      patch.policies = policyResult.data.policies
      const current = policyResult.data.policies.find((item) => item.id === selectedPolicyId)
        ?? policyResult.data.policies.find((item) => item.status === 'active')
        ?? policyResult.data.policies[0]
      if (current) {
        patch.selectedPolicyId = current.id
        patch.quoteMode = current.quote_mode
        patch.evidenceRequirements = current.evidence_requirements
      }
    }
    if (priceResult.success) patch.baselines = priceResult.data.baselines
    dispatch({ type: 'patch', patch })
  }, [selectedPolicyId])

  useEffect(() => {
    let active = true
    void Promise.all([
      adminControlService.listIntakePolicies(),
      adminControlService.listPriceBaselineVersions(),
    ]).then(([policyResult, priceResult]) => {
      if (!active) return
      const patch: Partial<AdminPolicyState> = {
        error: !priceResult.success
          ? priceResult.error
          : !policyResult.success ? policyResult.error : null,
        loading: false,
      }
      if (policyResult.success) {
        patch.policies = policyResult.data.policies
        const current = policyResult.data.policies.find((item) => item.status === 'active')
          ?? policyResult.data.policies[0]
        if (current) {
          patch.selectedPolicyId = current.id
          patch.quoteMode = current.quote_mode
          patch.evidenceRequirements = current.evidence_requirements
        }
      }
      if (priceResult.success) patch.baselines = priceResult.data.baselines
      dispatch({ type: 'patch', patch })
    })
    return () => { active = false }
  }, [])

  const selectedPolicy = policies.find((item) => item.id === selectedPolicyId) ?? null
  const run = async (action: () => Promise<{ success: boolean; error?: string }>) => {
    if (reason.trim().length < 8) {
      dispatch({ type: 'patch', patch: { error: labels.reason } })
      return
    }
    dispatch({ type: 'patch', patch: { acting: true, error: null, message: null } })
    const result = await action()
    if (!result.success) dispatch({ type: 'patch', patch: { error: result.error ?? labels.actionError } })
    else {
      dispatch({ type: 'patch', patch: { message: labels.success, reason: '' } })
      await load()
    }
    dispatch({ type: 'patch', patch: { acting: false } })
  }

  const transitionPolicy = (action: 'approve' | 'publish' | 'rollback') => {
    if (!selectedPolicy) return
    void run(() => adminControlService.transitionIntakePolicy(selectedPolicy.id, action, {
      expected_revision: selectedPolicy.service_intake_policy_heads.revision,
      reason,
    }))
  }

  const draftPolicy = () => {
    if (!selectedPolicy) return
    void run(() => adminControlService.createIntakePolicyDraft({
      problem_id: selectedPolicy.service_problem_id,
      expected_revision: selectedPolicy.service_intake_policy_heads.revision,
      quote_mode: quoteMode,
      tier_a_fields: selectedPolicy.tier_a_fields,
      tier_b_slots: selectedPolicy.tier_b_slots,
      question_overrides: selectedPolicy.question_overrides,
      safety_requirements: selectedPolicy.safety_requirements,
      capability_requirements: selectedPolicy.capability_requirements,
      evidence_requirements: evidenceRequirements,
      reason,
    }))
  }

  const selectPolicy = (policy: AdminIntakePolicy) => {
    dispatch({
      type: 'patch',
      patch: {
        evidenceRequirements: policy.evidence_requirements,
        preview: null,
        quoteMode: policy.quote_mode,
        selectedPolicyId: policy.id,
      },
    })
  }

  const selectQuoteMode = (mode: AdminIntakePolicy['quote_mode']) => {
    const nextEvidenceRequirements = mode === 'kael_auto_quote'
      ? {
          minimum_source_count: Math.max(2, evidenceRequirements.minimum_source_count),
          minimum_high_trust_source_count: Math.max(1, evidenceRequirements.minimum_high_trust_source_count),
          requires_active_baseline: true,
        }
      : evidenceRequirements
    dispatch({ type: 'patch', patch: { evidenceRequirements: nextEvidenceRequirements, quoteMode: mode } })
  }

  const updateEvidenceRequirements = (patch: Partial<AdminIntakePolicy['evidence_requirements']>) => {
    dispatch({ type: 'patch', patch: { evidenceRequirements: { ...evidenceRequirements, ...patch } } })
  }

  const previewPolicy = () => {
    if (!selectedPolicy) return
    void adminControlService.previewIntakePolicy({
      problem_id: selectedPolicy.service_problem_id,
      version: selectedPolicy.version,
      provided_fields: [],
      provided_slots: [],
    }).then((result) => dispatch({
      type: 'patch',
      patch: result.success ? { preview: result.data } : { error: result.error },
    }))
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={color.brand.primary} /><AdminText textRole="subheadline" style={styles.secondary}>{labels.loading}</AdminText></View>

  return <View style={styles.stack} testID="admin-policy-governance">
    <View style={styles.heading}><AdminText textRole="title2" style={styles.sectionTitle}>{labels.policies}</AdminText><Action label={labels.refresh} onPress={() => { void load() }} /></View>
    {error ? <AdminText accessibilityRole="alert" textRole="subheadline" style={styles.error}>{error || labels.actionError}</AdminText> : null}
    {message ? <AdminText accessibilityRole="alert" textRole="subheadline" style={styles.success}>{message}</AdminText> : null}
    {policies.length === 0 ? <AdminText textRole="subheadline" style={styles.empty}>{labels.empty}</AdminText> : <>
      <View accessibilityRole="tablist" style={styles.chips}>
        {policies.map((policy) => <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: policy.id === selectedPolicyId }}
          key={policy.id}
          onPress={() => selectPolicy(policy)}
          style={[styles.chip, policy.id === selectedPolicyId && styles.chipSelected]}
        ><AdminText textRole="footnote" style={styles.chipText}>{policy.problem_slug} · v{policy.version}</AdminText></Pressable>)}
      </View>
      {selectedPolicy ? <View style={styles.card}>
        <AdminText textRole="headline" style={styles.cardTitle}>{selectedPolicy.problem_slug}</AdminText>
        <AdminText textRole="footnote" style={styles.secondary}>{labels.version} {selectedPolicy.version} · {labels.status}: {selectedPolicy.status}</AdminText>
        <View style={styles.chips}>
          {([
            ['kael_auto_quote', labels.routed], ['rfq', labels.rfq], ['inspection_only', labels.inspection], ['blocked', labels.blocked],
          ] as const).map(([mode, label]) => <Pressable key={mode} onPress={() => selectQuoteMode(mode)} style={[styles.chip, quoteMode === mode && styles.chipSelected]}><AdminText textRole="footnote" style={styles.chipText}>{label}</AdminText></Pressable>)}
        </View>
        <AdminText textRole="headline" style={styles.cardTitle}>{labels.evidenceLocks}</AdminText>
        <AdminText textRole="footnote" style={styles.secondary}>{labels.sourceCount}</AdminText>
        <TextInput spellCheck={false} accessibilityLabel={labels.sourceCount} editable={!acting} inputMode="numeric" onChangeText={(value) => updateEvidenceRequirements({ minimum_source_count: boundedCount(value) })} style={withoutInputLineHeight(styles.input)} value={String(evidenceRequirements.minimum_source_count)} />
        <AdminText textRole="footnote" style={styles.secondary}>{labels.highTrustSources}</AdminText>
        <TextInput spellCheck={false} accessibilityLabel={labels.highTrustSources} editable={!acting} inputMode="numeric" onChangeText={(value) => updateEvidenceRequirements({ minimum_high_trust_source_count: boundedCount(value) })} style={withoutInputLineHeight(styles.input)} value={String(evidenceRequirements.minimum_high_trust_source_count)} />
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: evidenceRequirements.requires_active_baseline, disabled: acting || quoteMode === 'kael_auto_quote' }} disabled={acting || quoteMode === 'kael_auto_quote'} onPress={() => updateEvidenceRequirements({ requires_active_baseline: !evidenceRequirements.requires_active_baseline })} style={[styles.switchRow, quoteMode === 'kael_auto_quote' && styles.buttonMuted]}>
          <AdminText textRole="footnote" style={styles.secondary}>{labels.activeBaseline}</AdminText><AdminText textRole="title2" style={styles.switchValue}>{evidenceRequirements.requires_active_baseline ? '✓' : '○'}</AdminText>
        </Pressable>
        <AdminText textRole="headline" style={styles.cardTitle}>{labels.safetyLocks}</AdminText>
        <AdminText textRole="footnote" style={styles.secondary}>{[...selectedPolicy.safety_requirements, ...selectedPolicy.capability_requirements].join(' · ')}</AdminText>
        <TextInput spellCheck={false} accessibilityLabel={labels.reason} editable={!acting} onChangeText={(value) => dispatch({ type: 'patch', patch: { reason: value } })} placeholder={labels.reason} style={withoutInputLineHeight(styles.input)} value={reason} />
        <View style={styles.actions}>
          <Action disabled={acting} label={labels.draft} onPress={draftPolicy} />
          <Action disabled={acting || selectedPolicy.status !== 'draft'} label={labels.approve} onPress={() => transitionPolicy('approve')} />
          <Action disabled={acting || selectedPolicy.status !== 'approved'} label={labels.publish} onPress={() => transitionPolicy('publish')} />
          <Action disabled={acting || selectedPolicy.status !== 'retired'} label={labels.rollback} onPress={() => transitionPolicy('rollback')} />
          <Action disabled={acting} label={labels.preview} onPress={previewPolicy} />
        </View>
        {preview ? <AdminText textRole="footnote" style={styles.secondary}>{labels.missing}: {[...preview.missing_tier_a, ...preview.missing_tier_b].join(', ')} · {labels.evidence}: {preview.evidence_requirements.minimum_source_count}/{preview.evidence_requirements.minimum_high_trust_source_count}</AdminText> : null}
      </View> : null}
    </>}
    <AdminText textRole="title2" style={styles.sectionTitle}>{labels.pricePolicies}</AdminText>
    {baselines.map((baseline) => <View key={baseline.id} style={styles.card}>
      <AdminText textRole="headline" style={styles.cardTitle}>{baseline.service_type} · {baseline.complexity}</AdminText>
      <AdminText textRole="footnote" style={styles.secondary}>{labels.version} {baseline.version} · {labels.status}: {baseline.status} · {labels.evidence}: {evidenceCount(baseline.price_evidence)}</AdminText>
      <View style={styles.actions}>
        <Action disabled={acting} label={labels.draft} onPress={() => { void run(() => adminControlService.createPriceBaselineDraft({ problem_id: baseline.service_problem_id, district_code: baseline.district_code, complexity: baseline.complexity, expected_revision: baseline.price_baseline_governance_heads.revision, price_min: baseline.price_min, price_max: baseline.price_max, source: baseline.source, price_evidence: baseline.price_evidence, reason })) }} />
        <Action disabled={acting || baseline.status !== 'draft'} label={labels.approve} onPress={() => { void run(() => adminControlService.transitionPriceBaseline(baseline.id, 'approve', { expected_revision: baseline.price_baseline_governance_heads.revision, reason })) }} />
        <Action disabled={acting || baseline.status !== 'approved'} label={labels.publish} onPress={() => { void run(() => adminControlService.transitionPriceBaseline(baseline.id, 'publish', { expected_revision: baseline.price_baseline_governance_heads.revision, reason })) }} />
        <Action disabled={acting || baseline.status !== 'retired'} label={labels.rollback} onPress={() => { void run(() => adminControlService.transitionPriceBaseline(baseline.id, 'rollback', { expected_revision: baseline.price_baseline_governance_heads.revision, reason })) }} />
      </View>
    </View>)}
  </View>
}

function Action({ disabled = false, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, (disabled || pressed) && styles.buttonMuted]}><AdminText textRole="headline" style={styles.buttonText}>{label}</AdminText></Pressable>
}

function evidenceCount(value: Record<string, unknown>): number {
  return Array.isArray(value.sources) ? value.sources.length : 0
}

function defaultEvidenceRequirements(mode: AdminIntakePolicy['quote_mode']) {
  return mode === 'kael_auto_quote'
    ? { minimum_source_count: 2, minimum_high_trust_source_count: 1, requires_active_baseline: true }
    : { minimum_source_count: 0, minimum_high_trust_source_count: 0, requires_active_baseline: false }
}

function boundedCount(value: string): number {
  const parsed = Number.parseInt(value.replace(/\D/gu, ''), 10)
  return Number.isFinite(parsed) ? Math.min(50, Math.max(0, parsed)) : 0
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: { alignItems: 'center', backgroundColor: color.mint.mint50, borderColor: color.mint.mint300, borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md },
  buttonMuted: { opacity: 0.55 },
  buttonText: { ...typography.footnote, color: color.brand.primaryDark, fontWeight: '600' },
  card: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  cardTitle: { ...typography.headline, color: color.text.strong },
  center: { alignItems: 'center', gap: spacing.sm, justifyContent: 'center', minHeight: 160 },
  chip: { borderColor: color.surface.stroke, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing.sm },
  chipSelected: { backgroundColor: color.mint.mint50, borderColor: color.brand.primary },
  chipText: { ...typography.caption, color: color.text.strong },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  empty: { ...typography.callout, color: color.text.secondary, paddingVertical: spacing.lg, textAlign: 'center' },
  error: { ...typography.footnote, color: color.accent.destructive },
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  input: { ...typography.body, backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: radius.md, borderWidth: 1, color: color.text.strong, minHeight: 48, paddingHorizontal: spacing.md },
  secondary: { ...typography.footnote, color: color.text.secondary },
  sectionTitle: { ...typography.title3, color: color.text.strong },
  stack: { gap: spacing.md },
  success: { ...typography.footnote, color: color.brand.primaryDark },
  switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  switchValue: { ...typography.title3, color: color.brand.primary },
})
