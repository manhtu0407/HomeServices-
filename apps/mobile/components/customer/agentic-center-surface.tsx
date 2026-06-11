import type { ReactNode } from 'react'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { hasLocalDealCompletionEvidence, orderWorkflowPhaseSectionsForSummary, workflowAllowedActionsLabel, workflowArtifactModeLabel, workflowBlockedReasonLabel, workflowEventLabel, workflowSourceOfTruthLabel, type LocalDeal, type LocalDealStatus, type ServiceType, type WorkflowPhaseContext } from '@home-services/shared'
import { getCustomerThemeTokens, getReducedTransparencyCustomerTokens, useCustomerThemeMode, type CustomerThemeTokens } from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassSurface } from '@/components/ui/glass-surface'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { NESTSCOUT_BRAND } from '@/design/brand'
import { color, component, radius, spacing, typography } from '@/design/theme'
import { languageDisplayName, localizedServiceLabel, localizedStatusLabel, useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { useServiceWorkflow } from '@/lib/use-service-workflow'
import type { KaelMemoryPayload } from '@/lib/api-types'

const kaelHead = require('../../assets/kael-model-8a-head.png')
const KAEL_CHAT_PATH = '/(customer)/kael-chat'
const CUSTOMER_HISTORY_PATH = '/(customer)/history'
const CUSTOMER_PROFILE_PATH = '/(customer)/profile'

type AgenticApprovalRow = {
  actionLabel: string
  actionPath: string
  id: string
  label: string
  primaryAction?: 'approve_scope' | 'confirm_completion'
  primaryLabel?: string
  scopeChangeId?: string
  value: string
}

type AgenticPreferenceRow = {
  label: string
  value: string
}

const memoryServiceKeys = ['preferred_service', 'service_type', 'last_service_type', 'service'] as const
const memoryAreaKeys = ['preferred_district', 'district_label', 'district', 'area', 'service_area'] as const
const memoryTimeKeys = ['preferred_time_window', 'time_window', 'schedule_preference', 'preferred_time'] as const
const supportedMemoryServices: ServiceType[] = ['electrical', 'plumbing', 'cleaning']

const copy = {
  vi: {
    title: 'Trung tâm Kael',
    kicker: 'NestScout',
    subtitle: 'Kael gom việc đang chạy, hàng đợi cần duyệt và thông tin cá nhân thật của bạn.',
    startChat: 'Mở chat Kael',
    startRequest: 'Tạo yêu cầu mới',
    heroReady: 'Kael đang sẵn sàng hỗ trợ bạn.',
    activity: 'Xem hoạt động',
    profile: 'Hồ sơ',
    editProfile: 'Chỉnh sửa hồ sơ',
    summaryActive: 'Việc đang chạy',
    summaryApprovals: 'Cần duyệt',
    summaryNotifications: 'Thông báo',
    summaryEmpty: 'Chưa có',
    activeCase: 'Việc đang chạy',
    activeEmptyTitle: 'Chưa có yêu cầu đang chạy',
    activeEmptyBody: 'Bắt đầu bằng chat Kael để tạo phiếu thật cho điện, nước hoặc vệ sinh.',
    caseId: 'Mã phiếu',
    caseMessage: 'Nhắn Kael',
    caseJourney: 'Xem hành trình',
    approvalQueue: 'Hàng đợi cần duyệt',
    approvalEmptyTitle: 'Không có mục cần duyệt',
    approvalEmptyBody: 'Khi có đổi phạm vi, hoàn tất, thanh toán hoặc thông báo thật, Kael sẽ đưa vào đây.',
    memory: 'Bộ nhớ và tùy chọn',
    memoryEmptyTitle: 'Chưa có dữ liệu tùy chọn',
    memoryEmptyBody: 'Địa chỉ và tên hiển thị sẽ hiện ở đây sau khi được lưu trong hồ sơ thật.',
    memoryUnavailableTitle: 'Chưa tải được bộ nhớ Kael',
    memoryUnavailableBody: 'Kael sẽ hiển thị lại khi kết nối hệ thống ổn định.',
    memorySummary: 'Bộ nhớ Kael',
    languagePreference: 'Ngôn ngữ',
    servicePreference: 'Dịch vụ ưu tiên',
    preferredArea: 'Khu vực ưu tiên',
    timePreference: 'Khung giờ ưu tiên',
    lastUpdated: 'Cập nhật lần cuối',
    service: 'Dịch vụ',
    status: 'Trạng thái',
    estimate: 'Ước tính',
    area: 'Khu vực',
    description: 'Mô tả',
    address: 'Địa chỉ',
    displayName: 'Tên hiển thị',
    scopeChange: 'Đổi phạm vi đang chờ Kael',
    completion: 'Hoàn tất cần xác nhận',
    payment: 'Thanh toán đang chờ',
    approveScope: 'Đồng ý',
    confirmCompletion: 'Xác nhận',
    noEstimate: 'Chưa có ước tính',
    noArea: 'Chưa có khu vực',
    noDescription: 'Chưa có mô tả',
  },
  en: {
    title: 'Agentic Center',
    kicker: 'NestScout',
    subtitle: 'Kael gathers the active job, approval queue, and real saved preferences in one place.',
    startChat: 'Open Kael chat',
    startRequest: 'Start request',
    heroReady: 'Kael is ready to support you.',
    activity: 'View activity',
    profile: 'Profile',
    editProfile: 'Edit profile',
    summaryActive: 'Active case',
    summaryApprovals: 'Approvals',
    summaryNotifications: 'Notifications',
    summaryEmpty: 'None',
    activeCase: 'Active case',
    activeEmptyTitle: 'No active request',
    activeEmptyBody: 'Start with Kael chat to create a real ticket for electrical, plumbing, or cleaning.',
    caseId: 'Case ID',
    caseMessage: 'Message Kael',
    caseJourney: 'View journey',
    approvalQueue: 'Approval queue',
    approvalEmptyTitle: 'Nothing needs approval',
    approvalEmptyBody: 'Scope, completion, payment, or real unread notices appear here when they exist.',
    memory: 'Memory and preferences',
    memoryEmptyTitle: 'No saved preference data',
    memoryEmptyBody: 'Address and display name appear here after they are saved on the real profile.',
    memoryUnavailableTitle: 'Kael memory unavailable',
    memoryUnavailableBody: 'Kael memory appears again after the system connection recovers.',
    memorySummary: 'Kael memory',
    languagePreference: 'Language',
    servicePreference: 'Service preference',
    preferredArea: 'Preferred area',
    timePreference: 'Time preference',
    lastUpdated: 'Last updated',
    service: 'Service',
    status: 'Status',
    estimate: 'Estimate',
    area: 'Area',
    description: 'Description',
    address: 'Address',
    displayName: 'Display name',
    scopeChange: 'Scope change waiting for Kael',
    completion: 'Completion needs confirmation',
    payment: 'Payment pending',
    approveScope: 'Accept',
    confirmCompletion: 'Confirm',
    noEstimate: 'No estimate yet',
    noArea: 'No area yet',
    noDescription: 'No description yet',
  },
} as const

export function CustomerAgenticCenterSurface() {
  const { replace } = useRouter()
  const language = useAppLanguage()
  const text = copy[language]
  const { session } = useAuth()
  const { actions, customerKaelMemory, customerKaelMemoryStatus, state, selectors, notificationUnreadCount } = useFrontendWorkflow()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const themeMode = useCustomerThemeMode()
  const baseTokens = getCustomerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  const { width } = useWindowDimensions()
  const frameWidth = Math.min(width, component.agenticCenter.maxWidth)
  const deal = state.deal
  const workflow = useServiceWorkflow({
    status: selectors.currentBackendStatus,
    hasAiNotes: Boolean(deal?.estimate?.advisory),
    hasCompletionEvidence: hasLocalDealCompletionEvidence(deal),
    hasCustomerInput: Boolean(deal),
    hasEstimate: Boolean(deal?.estimate),
    hasScopeChange: Boolean(deal?.scopeChange),
  })
  const metadata = session?.user.user_metadata ?? {}
  const displayName = readMetadataString(metadata, 'nickname', 'preferred_name', 'full_name', 'name')
  const heroTitle = displayName ? `${language === 'en' ? 'Hi, ' : 'Xin chào, '}${localizedProfileValue(displayName, language)}` : text.title
  const heroSubtitle = displayName ? text.heroReady : text.subtitle
  const preferences = getPreferenceRows(metadata, language, text, customerKaelMemory)
  const memoryEmptyTitle = customerKaelMemoryStatus === 'unavailable' ? text.memoryUnavailableTitle : text.memoryEmptyTitle
  const memoryEmptyBody = customerKaelMemoryStatus === 'unavailable' ? text.memoryUnavailableBody : text.memoryEmptyBody
  const approvals = getApprovalRows({
    canConfirmCompletion: workflow.allowedActions.confirmCompletion && selectors.canCustomerConfirmCompletion,
    deal,
    language,
    status: selectors.currentStatus,
    text,
  })
  const summaryRows = getSummaryRows({ approvals, deal, notificationUnreadCount, text })
  const runApprovalPrimaryAction = (item: AgenticApprovalRow) => {
    if (item.primaryAction === 'approve_scope' && item.scopeChangeId) {
      void actions.decideScopeChange(item.scopeChangeId, { decision: 'approve' })
      return
    }
    if (item.primaryAction === 'confirm_completion') {
      void actions.customerConfirmCompletion()
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.canvas }]} testID="customer-agentic-center-screen">
      <ScrollView contentContainerStyle={[styles.scrollContent, { width: frameWidth }]} showsVerticalScrollIndicator={false}>
        <GlassSurface material="liquid" mode={tokens.mode} style={[styles.hero, centerGlassSurface(tokens)]} testID="customer-agentic-center-hero" variant="hero">
          <View style={styles.heroCopy}>
            <Text style={[styles.kicker, { color: tokens.primary }]}>{NESTSCOUT_BRAND.appName}</Text>
            <Text style={[styles.title, { color: tokens.text }]}>{heroTitle}</Text>
            <Text style={[styles.subtitle, { color: tokens.muted }]}>{heroSubtitle}</Text>
          </View>
          <View style={[styles.kaelOrb, centerOrbSurface(tokens)]}>
            <Image contentFit="contain" source={kaelHead} style={styles.kaelImage} />
          </View>
        </GlassSurface>

        <View style={styles.actionRow}>
          <CenterButton label={deal ? text.startChat : text.startRequest} onPress={() => replace(KAEL_CHAT_PATH)} primary reduceMotion={reduceMotion} tokens={tokens} />
          <CenterButton label={text.activity} onPress={() => replace(CUSTOMER_HISTORY_PATH)} reduceMotion={reduceMotion} tokens={tokens} />
          <CenterButton label={text.profile} onPress={() => replace(CUSTOMER_PROFILE_PATH)} reduceMotion={reduceMotion} tokens={tokens} />
        </View>

        <CommandSummary rows={summaryRows} tokens={tokens} />

        <CenterSection title={text.activeCase} tokens={tokens}>
          {deal ? (
            <View style={styles.stack}>
              <ActiveCaseCard deal={deal} language={language} status={selectors.currentStatus} text={text} tokens={tokens} />
              <WorkflowPhaseCommandCard language={language} phaseContext={workflow.phaseContext} tokens={tokens} />
              <View style={styles.activeCaseActions}>
                <CenterButton label={text.caseMessage} onPress={() => replace(KAEL_CHAT_PATH)} reduceMotion={reduceMotion} testID="customer-agentic-center-active-chat-action" tokens={tokens} />
                <CenterButton label={text.caseJourney} onPress={() => replace(CUSTOMER_HISTORY_PATH)} reduceMotion={reduceMotion} testID="customer-agentic-center-active-history-action" tokens={tokens} />
              </View>
            </View>
          ) : <EmptyState body={text.activeEmptyBody} title={text.activeEmptyTitle} tokens={tokens} />}
        </CenterSection>

        <CenterSection title={text.approvalQueue} tokens={tokens}>
          {approvals.length > 0
            ? approvals.map((item) => (
              <ApprovalActionRow
                key={item.id}
                item={item}
                onPress={() => replace(item.actionPath)}
                onPrimaryPress={item.primaryAction ? () => runApprovalPrimaryAction(item) : undefined}
                reduceMotion={reduceMotion}
                tokens={tokens}
              />
            ))
            : <EmptyState body={text.approvalEmptyBody} title={text.approvalEmptyTitle} tokens={tokens} />}
        </CenterSection>

        <CenterSection title={text.memory} tokens={tokens}>
          {preferences.length > 0 ? preferences.map((item) => <InfoRow key={item.label} label={item.label} tokens={tokens} value={item.value} />) : <EmptyState body={memoryEmptyBody} title={memoryEmptyTitle} tokens={tokens} />}
        </CenterSection>

        <Pressable accessibilityLabel={text.editProfile} accessibilityRole="button" onPress={() => replace(CUSTOMER_PROFILE_PATH)} style={({ pressed }) => [styles.homeLink, centerOutlineSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-agentic-center-memory-edit-action">
          <Text style={[styles.homeLinkText, { color: tokens.primary }]}>{text.editProfile}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function CenterSection({ children, title, tokens }: { children: ReactNode; title: string; tokens: CustomerThemeTokens }) {
  return (
    <View style={[styles.section, centerCardSurface(tokens)]}>
      <Text style={[styles.sectionTitle, { color: tokens.text }]}>{title}</Text>
      {children}
    </View>
  )
}

function ActiveCaseCard({ deal, language, status, text, tokens }: { deal: LocalDeal; language: AppLanguage; status: LocalDealStatus | null; text: (typeof copy)[AppLanguage]; tokens: CustomerThemeTokens }) {
  const description = deal.draft.description.trim()
  const area = deal.draft.districtLabel || deal.draft.addressLabel.trim()
  const service = localizedServiceLabel(deal.draft.serviceType, language)
  const statusLabel = localizedStatusLabel(status, language)
  const estimateLabel = deal.estimate?.priceRangeLabel ?? text.noEstimate

  return (
    <View style={styles.stack}>
      <InfoRow label={text.caseId} tokens={tokens} value={deal.id} />
      <InfoRow label={text.service} tokens={tokens} value={service} />
      <InfoRow label={text.status} tokens={tokens} value={statusLabel} />
      <InfoRow label={text.estimate} tokens={tokens} value={estimateLabel} />
      <InfoRow label={text.area} tokens={tokens} value={area || text.noArea} />
      <InfoRow label={text.description} tokens={tokens} value={description || text.noDescription} />
    </View>
  )
}

function EmptyState({ body, title, tokens }: { body: string; title: string; tokens: CustomerThemeTokens }) {
  return (
    <View style={[styles.emptyState, centerEmptySurface(tokens)]}>
      <Text style={[styles.emptyTitle, { color: tokens.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: tokens.muted }]}>{body}</Text>
    </View>
  )
}

function WorkflowPhaseCommandCard({ language, phaseContext, tokens }: { language: AppLanguage; phaseContext: WorkflowPhaseContext; tokens: CustomerThemeTokens }) {
  const visibleSections = orderWorkflowPhaseSectionsForSummary(phaseContext, phaseContext.sections.filter((section) => section.visible && section.role !== 'worker'))
  const primarySection = visibleSections.find((section) => section.id === phaseContext.primaryArtifact?.id) ?? visibleSections[0] ?? null
  const primaryArtifact = primarySection?.title[language] ?? (language === 'en' ? 'No live artifact' : 'Chưa có dấu mốc sống')
  const nextEvent = phaseContext.nextExpectedEvent
    ? workflowEventLabel(phaseContext.nextExpectedEvent, language)
    : language === 'en' ? 'No pending event' : 'Không có sự kiện chờ'
  const gate = phaseContext.blockedReason
    ? workflowBlockedReasonLabel(phaseContext.blockedReason, language)
    : workflowAllowedActionsLabel(phaseContext.allowedActions, language)

  return (
    <View style={[styles.phaseCard, centerInfoRowSurface(tokens)]} testID="customer-agentic-center-phase-card">
      <Text style={[styles.phaseTitle, { color: tokens.text }]}>
        {language === 'en' ? 'Kael workflow' : 'Luồng Kael'}
      </Text>
      <Text style={[styles.phaseIntent, { color: tokens.muted }]}>
        {phaseContext.intent[language]}
      </Text>
      <WorkflowPhaseRail language={language} phaseContext={phaseContext} tokens={tokens} />
      <View style={styles.phaseGrid}>
        <InfoRow label={language === 'en' ? 'Source' : 'Nguồn'} testID="customer-agentic-center-phase-source" tokens={tokens} value={workflowSourceOfTruthLabel(phaseContext.sourceOfTruth, language)} />
        <InfoRow label={language === 'en' ? 'Phase' : 'Giai đoạn'} testID="customer-agentic-center-phase-title" tokens={tokens} value={phaseContext.title[language]} />
        <InfoRow label={language === 'en' ? 'Artifact' : 'Dấu mốc'} testID="customer-agentic-center-phase-artifact" tokens={tokens} value={primaryArtifact} />
        <InfoRow label={language === 'en' ? 'Next' : 'Tiếp theo'} testID="customer-agentic-center-phase-next" tokens={tokens} value={nextEvent} />
        <InfoRow label={language === 'en' ? 'Action gate' : 'Cổng hành động'} testID="customer-agentic-center-phase-gate" tokens={tokens} value={gate} />
      </View>
    </View>
  )
}

function WorkflowPhaseRail({ language, phaseContext, tokens }: { language: AppLanguage; phaseContext: WorkflowPhaseContext; tokens: CustomerThemeTokens }) {
  const visibleSections = orderWorkflowPhaseSectionsForSummary(phaseContext, phaseContext.sections.filter((section) => section.visible && section.role !== 'worker'))
  if (visibleSections.length === 0) return null
  const primaryId = phaseContext.primaryArtifact?.id

  return (
    <View style={styles.phaseRail} testID="customer-agentic-center-phase-rail">
      {visibleSections.map((section) => {
        const primary = section.id === primaryId
        const statusLabel = workflowPhaseSectionStatusLabel(section, language)
        return (
          <View key={section.id} style={[styles.phaseStep, centerInfoRowSurface(tokens), primary ? centerPhaseStepPrimarySurface(tokens) : null]} testID={`customer-agentic-center-phase-step-${section.id}`}>
            <View style={styles.phaseStepHeader}>
              <View style={[styles.phaseStepDot, primary ? centerPhaseStepPrimaryDotSurface(tokens) : centerPhaseStepDotSurface(tokens)]} />
              <Text style={[styles.phaseStepTitle, { color: tokens.text }]} numberOfLines={2}>
                {section.title[language]}
              </Text>
            </View>
            <Text style={[styles.phaseStepMode, { color: primary ? tokens.primary : tokens.muted }]} numberOfLines={2} testID={`customer-agentic-center-phase-step-${section.id}-mode`}>
              {statusLabel}
            </Text>
            {primary ? (
              <View style={[styles.phaseStepActivePill, centerPhaseStepActivePillSurface(tokens)]}>
                <Text style={[styles.phaseStepActiveText, { color: tokens.primary }]} numberOfLines={1} testID={`customer-agentic-center-phase-step-${section.id}-primary`}>
                  {language === 'en' ? 'Active' : 'Đang chạy'}
                </Text>
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

function workflowPhaseSectionStatusLabel(section: WorkflowPhaseContext['sections'][number], language: AppLanguage) {
  if (section.lockedReason) return workflowBlockedReasonLabel(section.lockedReason, language)
  if (section.mode) return workflowArtifactModeLabel(section.mode, language)
  return workflowSourceOfTruthLabel(section.sourceOfTruth, language)
}

function InfoRow({ label, testID, tokens, value }: { label: string; testID?: string; tokens: CustomerThemeTokens; value: string }) {
  return (
    <View style={[styles.infoRow, centerInfoRowSurface(tokens)]} testID={testID}>
      <Text style={[styles.infoLabel, { color: tokens.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: tokens.text }]} testID={testID ? `${testID}-value` : undefined}>{value}</Text>
    </View>
  )
}

function ApprovalActionRow({ item, onPress, onPrimaryPress, reduceMotion, tokens }: { item: AgenticApprovalRow; onPress: () => void; onPrimaryPress?: () => void; reduceMotion: boolean; tokens: CustomerThemeTokens }) {
  return (
    <View style={[styles.approvalRow, centerInfoRowSurface(tokens)]} testID={`customer-agentic-center-approval-${item.id}`}>
      <View style={styles.approvalCopy}>
        <Text style={[styles.infoLabel, { color: tokens.muted }]}>{item.label}</Text>
        <Text style={[styles.infoValue, { color: tokens.text }]} testID={`customer-agentic-center-approval-${item.id}-value`}>{item.value}</Text>
      </View>
      <View style={styles.approvalActions}>
        {item.primaryLabel && onPrimaryPress ? (
          <Pressable accessibilityLabel={item.primaryLabel} accessibilityRole="button" onPress={onPrimaryPress} style={({ pressed }) => [styles.approvalButton, centerPrimaryButtonSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID={`customer-agentic-center-approval-${item.id}-primary-action`}>
            <Text style={[styles.approvalButtonText, { color: tokens.primaryText }]}>{item.primaryLabel}</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityLabel={item.actionLabel} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.approvalButton, centerOutlineSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID={`customer-agentic-center-approval-${item.id}-action`}>
          <Text style={[styles.approvalButtonText, { color: tokens.primary }]}>{item.actionLabel}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function CenterButton({ label, onPress, primary = false, reduceMotion, testID, tokens }: { label: string; onPress: () => void; primary?: boolean; reduceMotion: boolean; testID?: string; tokens: CustomerThemeTokens }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionButton, primary ? centerPrimaryButtonSurface(tokens) : centerOutlineSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID={testID}>
      <Text style={[styles.actionButtonText, { color: primary ? tokens.primaryText : tokens.primary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function CommandSummary({ rows, tokens }: { rows: Array<{ id: string; label: string; value: string }>; tokens: CustomerThemeTokens }) {
  return (
    <View style={styles.summaryRow} testID="customer-agentic-center-summary">
      {rows.map((row) => (
        <View key={row.id} style={[styles.summaryCell, centerInfoRowSurface(tokens)]} testID={`customer-agentic-center-summary-${row.id}`}>
          <Text style={[styles.summaryValue, { color: tokens.primary }]} numberOfLines={1} testID={`customer-agentic-center-summary-${row.id}-value`}>
            {row.value}
          </Text>
          <Text style={[styles.summaryLabel, { color: tokens.muted }]} numberOfLines={1}>
            {row.label}
          </Text>
        </View>
      ))}
    </View>
  )
}

function getSummaryRows({
  approvals,
  deal,
  notificationUnreadCount,
  text,
}: {
  approvals: AgenticApprovalRow[]
  deal: LocalDeal | null
  notificationUnreadCount: number
  text: (typeof copy)[AppLanguage]
}) {
  return [
    { id: 'active', label: text.summaryActive, value: deal ? '1' : text.summaryEmpty },
    { id: 'approvals', label: text.summaryApprovals, value: approvals.length > 0 ? String(approvals.length) : text.summaryEmpty },
    { id: 'notifications', label: text.summaryNotifications, value: notificationUnreadCount > 0 ? String(notificationUnreadCount) : text.summaryEmpty },
  ]
}

function getApprovalRows({
  canConfirmCompletion,
  deal,
  language,
  status,
  text,
}: {
  canConfirmCompletion: boolean
  deal: LocalDeal | null
  language: AppLanguage
  status: LocalDealStatus | null
  text: (typeof copy)[AppLanguage]
}) {
  const rows: AgenticApprovalRow[] = []
  const reviewLabel = language === 'en' ? 'Review' : 'Xem xét'
  if (deal?.scopeChange && ['requested_by_worker', 'reviewing_by_kael', 'waiting_customer_decision'].includes(deal.scopeChange.status)) {
    rows.push({
      actionLabel: reviewLabel,
      actionPath: `${CUSTOMER_HISTORY_PATH}?tab=price&scope_change=${encodeURIComponent(deal.scopeChange.id)}`,
      id: 'scope_change',
      label: text.scopeChange,
      primaryAction: deal.scopeChange.status === 'waiting_customer_decision' ? 'approve_scope' : undefined,
      primaryLabel: deal.scopeChange.status === 'waiting_customer_decision' ? text.approveScope : undefined,
      scopeChangeId: deal.scopeChange.id,
      value: deal.scopeChange.requestedDescription?.trim() || localizedStatusLabel(status, language),
    })
  }
  if (status === 'completed_by_worker') {
    rows.push({
      actionLabel: reviewLabel,
      actionPath: `${CUSTOMER_HISTORY_PATH}?tab=done`,
      id: 'completion',
      label: text.completion,
      primaryAction: canConfirmCompletion ? 'confirm_completion' : undefined,
      primaryLabel: canConfirmCompletion ? text.confirmCompletion : undefined,
      value: localizedStatusLabel(status, language),
    })
  }
  if (deal?.backendStatus === 'payment_pending') {
    rows.push({
      actionLabel: reviewLabel,
      actionPath: `${CUSTOMER_HISTORY_PATH}?tab=price`,
      id: 'payment',
      label: text.payment,
      value: text.payment,
    })
  }
  return rows
}

function getPreferenceRows(metadata: Record<string, unknown>, language: AppLanguage, text: (typeof copy)[AppLanguage], customerKaelMemory: KaelMemoryPayload | null) {
  const rows: AgenticPreferenceRow[] = []
  if (customerKaelMemory) {
    const summary = readMemoryString(customerKaelMemory, 'preference_summary')
    const memoryLanguage = readMemoryString(customerKaelMemory, 'language')
    const servicePreferences = readMemoryRecord(customerKaelMemory, 'service_preferences')
    const serviceType = readMemoryServiceType(servicePreferences)
    const preferredArea = servicePreferences ? readFirstMemoryString(servicePreferences, memoryAreaKeys) : ''
    const timePreference = servicePreferences ? readFirstMemoryString(servicePreferences, memoryTimeKeys) : ''
    const lastObservedAt = formatMemoryDate(readMemoryString(customerKaelMemory, 'last_observed_at'), language)

    if (summary) rows.push({ label: text.memorySummary, value: summary })
    if (memoryLanguage === 'vi' || memoryLanguage === 'en') {
      rows.push({ label: text.languagePreference, value: languageDisplayName(memoryLanguage) })
    }
    if (serviceType) rows.push({ label: text.servicePreference, value: localizedServiceLabel(serviceType, language) })
    if (preferredArea) rows.push({ label: text.preferredArea, value: localizedProfileValue(preferredArea, language) })
    if (timePreference) rows.push({ label: text.timePreference, value: localizedProfileValue(timePreference, language) })
    if (lastObservedAt) rows.push({ label: text.lastUpdated, value: lastObservedAt })
  }
  const name = readMetadataString(metadata, 'nickname', 'preferred_name', 'full_name', 'name')
  const address = readMetadataString(metadata, 'default_address', 'address_label', 'address')
  const phone = readMetadataString(metadata, 'phone_number', 'phone', 'contact_phone')
  if (name) rows.push({ label: text.displayName, value: localizedProfileValue(name, language) })
  if (address) rows.push({ label: text.address, value: localizedProfileValue(address, language) })
  if (phone) rows.push({ label: language === 'en' ? 'Contact phone' : 'Số liên hệ', value: phone })
  return rows
}

function readMemoryString(memory: Record<string, unknown>, key: string) {
  const value = memory[key]
  if (typeof value !== 'string') return ''
  return sanitizeMemoryDisplayValue(value)
}

function readMemoryRecord(memory: Record<string, unknown>, key: string) {
  const value = memory[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readFirstMemoryString(memory: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = readMemoryString(memory, key)
    if (value) return value
  }
  return ''
}

function readMemoryServiceType(memory: Record<string, unknown> | null) {
  if (!memory) return null
  const serviceType = readFirstMemoryString(memory, memoryServiceKeys)
  if (supportedMemoryServices.includes(serviceType as ServiceType)) return serviceType as ServiceType
  return null
}

function readMetadataString(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function sanitizeMemoryDisplayValue(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/g, '[phone]')
    .replace(/\b\d{11,12}\b/g, '[id-number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

function formatMemoryDate(value: string, language: AppLanguage) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function localizedProfileValue(value: string, language: AppLanguage) {
  if (language === 'en') return value.replace(/TP\.?\s*HCM|Thanh pho Ho Chi Minh|Thành phố Hồ Chí Minh/gi, 'HCMC')
  return value
}

function centerGlassSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.glass,
    borderColor: tokens.glassBorder,
    boxShadow: tokens.glassShadow,
  } as any
}

function centerCardSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.raised,
    borderColor: tokens.border,
    boxShadow: tokens.mode === 'dark' ? 'none' : component.agenticCenter.cardShadow,
  } as any
}

function centerEmptySurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? tokens.depthSurface : color.surface.soft,
    borderColor: tokens.border,
  } as any
}

function centerInfoRowSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? tokens.depthSurface : color.surface.soft,
    borderColor: tokens.border,
  } as any
}

function centerPrimaryButtonSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.primary,
    borderColor: tokens.mode === 'dark' ? component.agenticCenter.primaryButtonBorderDark : component.agenticCenter.primaryButtonBorderLight,
    boxShadow: tokens.mode === 'dark' ? 'none' : component.agenticCenter.primaryButtonShadow,
  } as any
}

function centerOutlineSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? tokens.depthSurface : color.mint.white,
    borderColor: tokens.borderStrong,
  } as any
}

function centerPhaseStepPrimarySurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? tokens.depthSurface : color.mint.white,
    borderColor: tokens.primary,
  } as any
}

function centerPhaseStepDotSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.borderStrong,
    borderColor: tokens.borderStrong,
  } as any
}

function centerPhaseStepPrimaryDotSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.primary,
    borderColor: tokens.primary,
  } as any
}

function centerPhaseStepActivePillSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? tokens.depthSurface : color.mint.mint50,
    borderColor: tokens.borderStrong,
  } as any
}

function centerOrbSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.primary,
    borderColor: tokens.mode === 'dark' ? component.agenticCenter.orbBorderDark : component.agenticCenter.orbBorderLight,
    boxShadow: tokens.mode === 'dark' ? component.agenticCenter.orbShadowDark : component.agenticCenter.orbShadowLight,
  } as any
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    alignSelf: 'center',
    gap: spacing.sectionGap,
    paddingBottom: component.agenticCenter.scrollPaddingBottom,
    paddingHorizontal: spacing.screenHorizontalPadding,
    paddingTop: spacing.screenVerticalPadding,
  },
  hero: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.lg,
    minHeight: component.agenticCenter.heroMinHeight,
    overflow: 'hidden',
    padding: spacing.cardPaddingLarge,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  kicker: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: typography.h1.fontSize,
    fontWeight: typography.h1.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.h1.lineHeight,
  },
  subtitle: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.body.lineHeight,
  },
  kaelOrb: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: component.bottomNav.orb.outerSize,
    justifyContent: 'center',
    overflow: 'hidden',
    width: component.bottomNav.orb.outerSize,
  },
  kaelImage: {
    height: component.agenticCenter.mascotImageSize,
    width: component.agenticCenter.mascotImageSize,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  activeCaseActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: component.button.primary.radius,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: component.button.primary.height,
    minWidth: component.agenticCenter.actionMinWidth,
    paddingHorizontal: component.button.primary.paddingX,
  },
  actionButtonText: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.label.lineHeight,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryCell: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: 104,
    flexGrow: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 76,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  summaryValue: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.h3.lineHeight,
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
    textAlign: 'center',
  },
  section: {
    borderCurve: 'continuous',
    borderRadius: component.card.radius,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.cardPadding,
  },
  sectionTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.h3.lineHeight,
  },
  stack: {
    gap: spacing.sm,
  },
  phaseCard: {
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  phaseTitle: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.label.lineHeight,
  },
  phaseIntent: {
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
  },
  phaseRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  phaseStep: {
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: component.agenticCenter.phaseRailStepMinWidth,
    padding: spacing.sm,
  },
  phaseStepHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  phaseStepDot: {
    borderRadius: radius.pill,
    borderWidth: 1,
    height: component.agenticCenter.phaseRailDotSize,
    width: component.agenticCenter.phaseRailDotSize,
  },
  phaseStepTitle: {
    flex: 1,
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
    minWidth: 0,
  },
  phaseStepMode: {
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
  },
  phaseStepActivePill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    minWidth: component.agenticCenter.phaseRailActivePillMinWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  phaseStepActiveText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
    textAlign: 'center',
  },
  phaseGrid: {
    gap: spacing.sm,
  },
  infoRow: {
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  approvalRow: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  approvalCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  approvalActions: {
    alignItems: 'stretch',
    gap: spacing.xs,
  },
  approvalButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: component.button.small.height,
    minWidth: component.agenticCenter.approvalActionMinWidth,
    paddingHorizontal: spacing.md,
  },
  approvalButtonText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
  },
  infoLabel: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
  },
  infoValue: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.label.lineHeight,
  },
  emptyState: {
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.label.lineHeight,
  },
  emptyBody: {
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
  },
  homeLink: {
    alignItems: 'center',
    alignSelf: 'center',
    borderCurve: 'continuous',
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: component.agenticCenter.homeLinkMinHeight,
    minWidth: component.agenticCenter.homeLinkMinWidth,
    paddingHorizontal: spacing.lg,
  },
  homeLinkText: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.label.lineHeight,
  },
})
