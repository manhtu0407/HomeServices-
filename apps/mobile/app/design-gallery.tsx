import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { KaelMascot } from '@/components/kael/kael-mascot'
import { FloatingGlassTabBar, type FloatingGlassTabItem } from '@/components/ui/floating-glass-tab-bar'
import {
  KaelButton,
  KaelCard,
  KaelChip,
  KaelInlineStepper,
  KaelMediaUploadTray,
  KaelSegmentedControl,
  KaelTextField,
  KaelVoiceInputCapsule,
  MintAura,
} from '@/components/ui/kael-primitives'
import { color, component, radius, shadow, spacing, typography } from '@/design/theme'

type GalleryTab = 'home' | 'services' | 'activity' | 'profile'

const galleryTabs: Array<FloatingGlassTabItem<GalleryTab>> = [
  { key: 'home', label: 'Trang chủ' },
  { key: 'services', label: 'Dịch vụ' },
  { key: 'activity', label: 'Hoạt động' },
  { key: 'profile', label: 'Hồ sơ' },
]

export default function DesignGalleryRoute() {
  const [segment, setSegment] = useState<'all' | 'doing' | 'done'>('all')
  const [activeTab, setActiveTab] = useState<GalleryTab>('home')

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <MintAura intensity="page" />
          <View style={styles.brandLockup}>
            <View style={styles.kTile}>
              <Text style={styles.kText}>K</Text>
            </View>
            <View>
              <Text style={styles.title}>Kael Component Gallery</Text>
              <Text style={styles.subtitle}>NestScout UI foundation</Text>
            </View>
          </View>
        </View>

        <GallerySection title="Action Buttons">
          <View style={styles.grid}>
            <KaelButton label="Primary" onPress={() => {}} />
            <KaelButton label="Secondary" variant="secondary" onPress={() => {}} />
            <KaelButton label="Ghost" variant="ghost" onPress={() => {}} />
            <KaelButton label="Destructive" variant="destructive" onPress={() => {}} />
            <KaelButton disabled label="Disabled" onPress={() => {}} />
            <KaelButton label="Đang xử lý" loading onPress={() => {}} />
          </View>
        </GallerySection>

        <GallerySection title="Toggles & Selection">
          <KaelSegmentedControl
            onChange={setSegment}
            options={[
              { label: 'Tất cả', value: 'all' },
              { label: 'Đang làm', value: 'doing' },
              { label: 'Hoàn thành', value: 'done' },
            ]}
            value={segment}
          />
          <View style={styles.chipRow}>
            <KaelChip label="Đã chọn" variant="selected" />
            <KaelChip label="Chưa chọn" />
            <KaelChip label="Đang hoạt động" variant="successStatus" />
            <KaelChip label="Cần kiểm tra" variant="warning" />
            <KaelChip label="Cần xử lý" variant="error" />
          </View>
        </GallerySection>

        <GallerySection title="Input Components">
          <KaelTextField label="Text Field" placeholder="Nhập nội dung..." />
          <KaelTextField label="Search Field" mode="search" placeholder="Tìm kiếm thiết bị..." />
          <KaelInlineStepper onDecrement={() => {}} onIncrement={() => {}} value={2} />
          <KaelVoiceInputCapsule />
          <KaelMediaUploadTray />
        </GallerySection>

        <GallerySection title="Cards, Glass & Aura">
          <KaelCard large raised style={styles.formulaCard}>
            <MintAura intensity="component" />
            <Text style={styles.cardTitle}>Lớp kính lỏng</Text>
            <Text style={styles.cardBody}>Nền trắng tinh, aura mint nhẹ, bo tròn lớn và bóng trong mềm.</Text>
          </KaelCard>
          <View style={styles.cardPair}>
            <KaelCard style={styles.smallFormulaCard}>
              <Text style={styles.cardTitle}>Aura mint</Text>
              <Text style={styles.cardBody}>Ánh sáng nhẹ bên ngoài.</Text>
            </KaelCard>
            <KaelCard style={styles.smallFormulaCard}>
              <Text style={styles.cardTitle}>Viền sáng mềm</Text>
              <Text style={styles.cardBody}>Cạnh trên sạch và tinh tế.</Text>
            </KaelCard>
          </View>
        </GallerySection>

        <GallerySection title="Kael Mascot Shell">
          <View style={styles.mascotRow}>
            {(['welcome', 'thinking', 'analyzing', 'success', 'warning'] as const).map((state) => (
              <View key={state} style={styles.mascotCell}>
                <KaelMascot showFallbackBadge size={92} state={state} />
                <Text style={styles.mascotLabel}>{state}</Text>
              </View>
            ))}
          </View>
        </GallerySection>

        <GallerySection title="Navigation Components">
          <View style={styles.navDemo}>
            <FloatingGlassTabBar
              activeKey={activeTab}
              appearance="signature"
              iconForItem={(item, focused) => <GalleryNavIcon focused={focused} label={item.label ?? item.key} />}
              items={galleryTabs}
              material="liquid"
              mode="light"
              onItemPress={(item) => setActiveTab(item.key)}
              testID="design-gallery-bottom-nav"
            />
            <Pressable accessibilityLabel="Kael Orb" accessibilityRole="button" style={styles.kaelOrb}>
              <Text style={styles.kaelOrbText}>K</Text>
            </Pressable>
          </View>
        </GallerySection>
      </ScrollView>
    </SafeAreaView>
  )
}

function GallerySection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  )
}

function GalleryNavIcon({ focused, label }: { focused: boolean; label: string }) {
  return (
    <View style={styles.navIconShell}>
      <View style={[styles.navIconDot, focused ? styles.navIconDotActive : null]} />
      <Text style={[styles.navIconLabel, focused ? styles.navIconLabelActive : null]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  brandLockup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    zIndex: 1,
  },
  cardBody: {
    color: color.text.secondary,
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
  },
  cardPair: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cardTitle: {
    color: color.text.strong,
    fontSize: typography.label.fontSize,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: typography.label.lineHeight,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.screenHorizontalPadding,
    paddingBottom: 120,
  },
  formulaCard: {
    minHeight: 132,
  },
  grid: {
    gap: spacing.md,
  },
  header: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.xl,
    borderWidth: 1,
    minHeight: 108,
    overflow: 'hidden',
    padding: spacing.lg,
    position: 'relative',
    ...shadow.soft,
  },
  kText: {
    color: color.text.inverse,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 34,
  },
  kTile: {
    alignItems: 'center',
    backgroundColor: component.button.primary.gradient[1],
    borderRadius: radius.md,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  kaelOrb: {
    alignItems: 'center',
    backgroundColor: component.bottomNav.orb.bg,
    borderColor: color.surface.base,
    borderRadius: component.bottomNav.orb.radius,
    borderWidth: 2,
    height: component.bottomNav.orb.size,
    justifyContent: 'center',
    width: component.bottomNav.orb.size,
    ...shadow.orb,
  },
  kaelOrbText: {
    color: color.text.inverse,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 34,
  },
  mascotCell: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 108,
  },
  mascotLabel: {
    color: color.text.secondary,
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.caption.lineHeight,
    textAlign: 'center',
  },
  mascotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  navDemo: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  navIconDot: {
    backgroundColor: color.text.muted,
    borderRadius: radius.pill,
    height: 18,
    width: 18,
  },
  navIconDotActive: {
    backgroundColor: color.brand.primary,
  },
  navIconLabel: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 12,
  },
  navIconLabelActive: {
    color: color.brand.primaryDark,
  },
  navIconShell: {
    alignItems: 'center',
    gap: 4,
    minWidth: 56,
  },
  safe: {
    backgroundColor: color.background,
    flex: 1,
  },
  section: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  sectionBody: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: color.brand.primaryDark,
    fontSize: typography.h3.fontSize,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: typography.h3.lineHeight,
  },
  smallFormulaCard: {
    flex: 1,
    minHeight: 108,
  },
  subtitle: {
    color: color.text.secondary,
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: typography.label.lineHeight,
  },
  title: {
    color: color.text.primary,
    fontSize: typography.h2.fontSize,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: typography.h2.lineHeight,
  },
})
