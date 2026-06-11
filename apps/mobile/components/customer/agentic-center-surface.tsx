import type { ReactNode } from 'react'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { LocalDeal, LocalDealStatus } from '@home-services/shared'
import { getCustomerThemeTokens, getReducedTransparencyCustomerTokens, useCustomerThemeMode, type CustomerThemeTokens } from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassSurface } from '@/components/ui/glass-surface'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { NESTSCOUT_BRAND } from '@/design/brand'
import { color, component, radius, spacing, typography } from '@/design/theme'
import { localizedServiceLabel, localizedStatusLabel, useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

const kaelHead = require('../../assets/kael-model-8a-head.png')
const KAEL_CHAT_PATH = '/(customer)/kael-chat'
const CUSTOMER_HOME_PATH = '/(customer)/home'
const CUSTOMER_HISTORY_PATH = '/(customer)/history'
const CUSTOMER_PROFILE_PATH = '/(customer)/profile'

const copy = {
  vi: {
    title: 'Trung tâm Kael',
    kicker: 'NestScout',
    subtitle: 'Kael gom việc đang chạy, hàng đợi cần duyệt và thông tin cá nhân thật của bạn.',
    startChat: 'Mở chat Kael',
    startRequest: 'Tạo yêu cầu mới',
    activity: 'Xem hoạt động',
    profile: 'Hồ sơ',
    summaryActive: 'Việc đang chạy',
    summaryApprovals: 'Cần duyệt',
    summaryMemory: 'Tùy chọn',
    summaryEmpty: 'Chưa có',
    activeCase: 'Việc đang chạy',
    activeEmptyTitle: 'Chưa có yêu cầu đang chạy',
    activeEmptyBody: 'Bắt đầu bằng chat Kael để tạo phiếu thật cho điện, nước hoặc vệ sinh.',
    approvalQueue: 'Hàng đợi cần duyệt',
    approvalEmptyTitle: 'Không có mục cần duyệt',
    approvalEmptyBody: 'Khi có đổi phạm vi, hoàn tất, thanh toán hoặc thông báo thật, Kael sẽ đưa vào đây.',
    memory: 'Bộ nhớ và tùy chọn',
    memoryEmptyTitle: 'Chưa có dữ liệu tùy chọn',
    memoryEmptyBody: 'Địa chỉ và tên hiển thị sẽ hiện ở đây sau khi được lưu trong hồ sơ thật.',
    service: 'Dịch vụ',
    status: 'Trạng thái',
    estimate: 'Ước tính',
    area: 'Khu vực',
    description: 'Mô tả',
    address: 'Địa chỉ',
    displayName: 'Tên hiển thị',
    unread: 'Thông báo chưa đọc',
    scopeChange: 'Đổi phạm vi đang chờ Kael',
    completion: 'Hoàn tất cần xác nhận',
    payment: 'Thanh toán đang chờ',
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
    activity: 'View activity',
    profile: 'Profile',
    summaryActive: 'Active case',
    summaryApprovals: 'Approvals',
    summaryMemory: 'Preferences',
    summaryEmpty: 'None',
    activeCase: 'Active case',
    activeEmptyTitle: 'No active request',
    activeEmptyBody: 'Start with Kael chat to create a real ticket for electrical, plumbing, or cleaning.',
    approvalQueue: 'Approval queue',
    approvalEmptyTitle: 'Nothing needs approval',
    approvalEmptyBody: 'Scope, completion, payment, or real unread notices appear here when they exist.',
    memory: 'Memory and preferences',
    memoryEmptyTitle: 'No saved preference data',
    memoryEmptyBody: 'Address and display name appear here after they are saved on the real profile.',
    service: 'Service',
    status: 'Status',
    estimate: 'Estimate',
    area: 'Area',
    description: 'Description',
    address: 'Address',
    displayName: 'Display name',
    unread: 'Unread notices',
    scopeChange: 'Scope change waiting for Kael',
    completion: 'Completion needs confirmation',
    payment: 'Payment pending',
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
  const { state, selectors, notificationUnreadCount } = useFrontendWorkflow()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const themeMode = useCustomerThemeMode()
  const baseTokens = getCustomerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  const { width } = useWindowDimensions()
  const frameWidth = Math.min(width, 720)
  const deal = state.deal
  const metadata = session?.user.user_metadata ?? {}
  const preferences = getPreferenceRows(metadata, language, text)
  const approvals = getApprovalRows({
    deal,
    language,
    notificationUnreadCount,
    status: selectors.currentStatus,
    text,
  })
  const summaryRows = getSummaryRows({ approvals, deal, preferences, text })

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: tokens.canvas }]} testID="customer-agentic-center-screen">
      <ScrollView contentContainerStyle={[styles.scrollContent, { width: frameWidth }]} showsVerticalScrollIndicator={false}>
        <GlassSurface material="liquid" mode={tokens.mode} style={[styles.hero, centerGlassSurface(tokens)]} testID="customer-agentic-center-hero" variant="hero">
          <View style={styles.heroCopy}>
            <Text style={[styles.kicker, { color: tokens.primary }]}>{NESTSCOUT_BRAND.appName}</Text>
            <Text style={[styles.title, { color: tokens.text }]}>{text.title}</Text>
            <Text style={[styles.subtitle, { color: tokens.muted }]}>{text.subtitle}</Text>
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
          {deal ? <ActiveCaseCard deal={deal} language={language} status={selectors.currentStatus} text={text} tokens={tokens} /> : <EmptyState body={text.activeEmptyBody} title={text.activeEmptyTitle} tokens={tokens} />}
        </CenterSection>

        <CenterSection title={text.approvalQueue} tokens={tokens}>
          {approvals.length > 0 ? approvals.map((item) => <InfoRow key={item.label} label={item.label} tokens={tokens} value={item.value} />) : <EmptyState body={text.approvalEmptyBody} title={text.approvalEmptyTitle} tokens={tokens} />}
        </CenterSection>

        <CenterSection title={text.memory} tokens={tokens}>
          {preferences.length > 0 ? preferences.map((item) => <InfoRow key={item.label} label={item.label} tokens={tokens} value={item.value} />) : <EmptyState body={text.memoryEmptyBody} title={text.memoryEmptyTitle} tokens={tokens} />}
        </CenterSection>

        <Pressable accessibilityLabel={language === 'en' ? 'Back to home' : 'Về trang chủ'} accessibilityRole="button" onPress={() => replace(CUSTOMER_HOME_PATH)} style={({ pressed }) => [styles.homeLink, centerOutlineSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-agentic-center-home">
          <Text style={[styles.homeLinkText, { color: tokens.primary }]}>{language === 'en' ? 'Home' : 'Trang chủ'}</Text>
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

function InfoRow({ label, tokens, value }: { label: string; tokens: CustomerThemeTokens; value: string }) {
  return (
    <View style={[styles.infoRow, centerInfoRowSurface(tokens)]}>
      <Text style={[styles.infoLabel, { color: tokens.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: tokens.text }]}>{value}</Text>
    </View>
  )
}

function CenterButton({ label, onPress, primary = false, reduceMotion, tokens }: { label: string; onPress: () => void; primary?: boolean; reduceMotion: boolean; tokens: CustomerThemeTokens }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionButton, primary ? centerPrimaryButtonSurface(tokens) : centerOutlineSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]}>
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
  preferences,
  text,
}: {
  approvals: Array<{ label: string; value: string }>
  deal: LocalDeal | null
  preferences: Array<{ label: string; value: string }>
  text: (typeof copy)[AppLanguage]
}) {
  return [
    { id: 'active', label: text.summaryActive, value: deal ? '1' : text.summaryEmpty },
    { id: 'approvals', label: text.summaryApprovals, value: approvals.length > 0 ? String(approvals.length) : text.summaryEmpty },
    { id: 'memory', label: text.summaryMemory, value: preferences.length > 0 ? String(preferences.length) : text.summaryEmpty },
  ]
}

function getApprovalRows({
  deal,
  language,
  notificationUnreadCount,
  status,
  text,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  notificationUnreadCount: number
  status: LocalDealStatus | null
  text: (typeof copy)[AppLanguage]
}) {
  const rows: Array<{ label: string; value: string }> = []
  if (deal?.scopeChange && ['requested_by_worker', 'reviewing_by_kael', 'waiting_customer_decision'].includes(deal.scopeChange.status)) {
    rows.push({ label: text.scopeChange, value: deal.scopeChange.requestedDescription?.trim() || localizedStatusLabel(status, language) })
  }
  if (status === 'completed_by_worker') {
    rows.push({ label: text.completion, value: localizedStatusLabel(status, language) })
  }
  if (deal?.backendStatus === 'payment_pending') {
    rows.push({ label: text.payment, value: text.payment })
  }
  if (notificationUnreadCount > 0) {
    rows.push({ label: text.unread, value: String(notificationUnreadCount) })
  }
  return rows
}

function getPreferenceRows(metadata: Record<string, unknown>, language: AppLanguage, text: (typeof copy)[AppLanguage]) {
  const rows: Array<{ label: string; value: string }> = []
  const name = readMetadataString(metadata, 'nickname', 'preferred_name', 'full_name', 'name')
  const address = readMetadataString(metadata, 'default_address', 'address_label', 'address')
  if (name) rows.push({ label: text.displayName, value: localizedProfileValue(name, language) })
  if (address) rows.push({ label: text.address, value: localizedProfileValue(address, language) })
  return rows
}

function readMetadataString(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
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
    boxShadow: tokens.mode === 'dark' ? 'none' : '0 12px 26px rgba(8,95,87,0.07)',
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
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.62)',
    boxShadow: tokens.mode === 'dark' ? 'none' : '0 12px 22px rgba(13,174,154,0.22)',
  } as any
}

function centerOutlineSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? tokens.depthSurface : color.mint.white,
    borderColor: tokens.borderStrong,
  } as any
}

function centerOrbSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.primary,
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.20)' : 'rgba(255,255,255,0.76)',
    boxShadow: tokens.mode === 'dark' ? '0 16px 32px rgba(0,0,0,0.30)' : '0 16px 34px rgba(13,174,154,0.28)',
  } as any
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    alignSelf: 'center',
    gap: spacing.sectionGap,
    paddingBottom: 34,
    paddingHorizontal: spacing.screenHorizontalPadding,
    paddingTop: spacing.screenVerticalPadding,
  },
  hero: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.lg,
    minHeight: 184,
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
    height: 54,
    width: 54,
  },
  actionRow: {
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
    minWidth: 126,
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
  infoRow: {
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
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
    minHeight: 42,
    minWidth: 116,
    paddingHorizontal: spacing.lg,
  },
  homeLinkText: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.label.lineHeight,
  },
})
