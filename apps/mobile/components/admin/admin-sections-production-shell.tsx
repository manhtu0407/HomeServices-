import { useState, type ReactNode } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'

import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
} from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { radius, spacing, typography } from '@/design/theme'

import type { AdminProductionSectionId } from './admin-sections-production-registry'
import { AdminText } from './admin-text'

type AdminProductionNavigationItem = {
  id: AdminProductionSectionId
  label: string
  testID: string
}

export function AdminSectionsProductionShell({
  activeSection,
  children,
  navigation,
  navigationLabel,
  onSelectSection,
  onSignOut,
  signOutLabel,
  title,
}: {
  activeSection: AdminProductionSectionId
  children: ReactNode
  navigation: readonly AdminProductionNavigationItem[]
  navigationLabel: string
  onSelectSection: (section: AdminProductionSectionId) => void
  onSignOut: () => void
  signOutLabel: string
  title: string
}) {
  const { width } = useWindowDimensions()
  const themeMode = useCustomerThemeMode()
  const { reduceTransparency } = useGlassAccessibility()
  const baseTokens = getCustomerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  const wide = width >= 840
  const [signOutFocused, setSignOutFocused] = useState(false)

  return <View style={[styles.shell, { backgroundColor: tokens.canvas }]} testID="admin-sections-production-shell">
    <View style={[styles.header, { backgroundColor: tokens.base, borderBottomColor: tokens.border }]}>
      <AdminText textRole="headline" style={[styles.title, { color: tokens.text }]} testID="admin-sections-title">{title}</AdminText>
      <Pressable
        accessibilityLabel={signOutLabel}
        accessibilityRole="button"
        onBlur={() => setSignOutFocused(false)}
        onFocus={() => setSignOutFocused(true)}
        onPress={onSignOut}
        style={({ pressed }) => [
          styles.signOut,
          {
            backgroundColor: pressed || signOutFocused ? tokens.service : 'transparent',
            borderColor: signOutFocused ? tokens.primary : 'transparent',
            opacity: pressed ? 0.7 : 1,
            outlineColor: 'transparent',
          },
        ]}
        testID="admin-sign-out"
      >
        <AdminText textRole="headline" style={[styles.signOutLabel, { color: tokens.primary }]}>{signOutLabel}</AdminText>
        <SignOutIcon color={tokens.primary} />
      </Pressable>
    </View>

    {!wide ? <HorizontalNavigation
      activeSection={activeSection}
      items={navigation}
      onSelect={onSelectSection}
      tokens={tokens}
    /> : null}

    <View style={styles.workspace}>
      {wide ? <SidebarNavigation
        activeSection={activeSection}
        items={navigation}
        label={navigationLabel}
        onSelect={onSelectSection}
        tokens={tokens}
      /> : null}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.contentScroll}
        testID="admin-sections-content-scroll"
      >
        {children}
      </ScrollView>
    </View>
  </View>
}

type ThemeTokens = ReturnType<typeof getCustomerThemeTokens>

function HorizontalNavigation({
  activeSection,
  items,
  onSelect,
  tokens,
}: {
  activeSection: AdminProductionSectionId
  items: readonly AdminProductionNavigationItem[]
  onSelect: (section: AdminProductionSectionId) => void
  tokens: ThemeTokens
}) {
  return <View style={[styles.mobileNavigationShell, { backgroundColor: tokens.base, borderBottomColor: tokens.border }]} testID="admin-sections-primary-navigation">
    <View
      accessibilityRole="tablist"
      style={styles.mobileNavigationContent}
      testID="admin-sections-primary-navigation-scroll"
    >
      {items.map((item) => <MobileNavigationTab
        item={item}
        key={item.id}
        onSelect={onSelect}
        selected={item.id === activeSection}
        tokens={tokens}
      />)}
    </View>
  </View>
}

function MobileNavigationTab({ item, onSelect, selected, tokens }: {
  item: AdminProductionNavigationItem
  onSelect: (section: AdminProductionSectionId) => void
  selected: boolean
  tokens: ThemeTokens
}) {
  return <Pressable
    accessibilityRole="tab"
    accessibilityState={{ selected }}
    onPress={() => onSelect(item.id)}
    style={({ pressed }) => [
      styles.mobileNavigationItem,
      { borderBottomColor: selected ? tokens.primary : 'transparent', opacity: pressed ? 0.62 : 1 },
    ]}
    testID={item.testID}
  >
    <AdminText
      textRole="subheadline"
      style={[styles.mobileNavigationLabel, { color: selected ? tokens.text : tokens.muted }]}
    >
      {item.label}
    </AdminText>
  </Pressable>
}

function SidebarNavigation({
  activeSection,
  items,
  label,
  onSelect,
  tokens,
}: {
  activeSection: AdminProductionSectionId
  items: readonly AdminProductionNavigationItem[]
  label: string
  onSelect: (section: AdminProductionSectionId) => void
  tokens: ThemeTokens
}) {
  return <View style={[styles.sidebar, { backgroundColor: tokens.base, borderRightColor: tokens.border }]} testID="admin-sections-sidebar">
    <AdminText textRole="caption1" style={[styles.navigationEyebrow, { color: tokens.subtleText }]}>{label}</AdminText>
    <View accessibilityRole="tablist" style={styles.sidebarNavigation}>
      {items.map((item, index) => {
        const selected = item.id === activeSection
        return <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected }}
          key={item.id}
          onPress={() => onSelect(item.id)}
          style={({ pressed }) => [
            styles.sidebarItem,
            { backgroundColor: selected ? tokens.service : 'transparent', opacity: pressed ? 0.68 : 1 },
          ]}
          testID={item.testID}
        >
          {selected ? <View style={[styles.sidebarAccent, { backgroundColor: tokens.primary }]} /> : null}
          <AdminText numeric textRole="caption1" style={[styles.sidebarIndex, { color: selected ? tokens.primary : tokens.subtleText }]}>
            {String(index + 1).padStart(2, '0')}
          </AdminText>
          <AdminText textRole="subheadline" style={[styles.sidebarLabel, { color: selected ? tokens.text : tokens.muted }]}>{item.label}</AdminText>
        </Pressable>
      })}
    </View>
  </View>
}

function SignOutIcon({ color }: { color: string }) {
  return <Svg height={18} pointerEvents="none" testID="admin-sign-out-icon" viewBox="0 0 24 24" width={18}>
    <Path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M13 8l4 4-4 4M17 12H9" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
  </Svg>
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing.lg,
    maxWidth: 1080,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    width: '100%',
  },
  contentScroll: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.lg,
  },
  mobileNavigationContent: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xs,
    width: '100%',
  },
  mobileNavigationItem: {
    alignItems: 'center',
    borderBottomWidth: 2,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: 'center',
    minHeight: 50,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
  },
  mobileNavigationLabel: {
    fontWeight: '600',
    textAlign: 'center',
  },
  mobileNavigationShell: {
    borderBottomWidth: 1,
  },
  navigationEyebrow: {
    ...typography.caption1,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    textTransform: 'uppercase',
  },
  shell: {
    flex: 1,
  },
  sidebar: {
    borderRightWidth: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    width: 224,
  },
  sidebarAccent: {
    borderRadius: radius.pill,
    bottom: 10,
    left: 0,
    position: 'absolute',
    top: 10,
    width: 3,
  },
  sidebarIndex: {
    ...typography.caption1,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    width: 24,
  },
  sidebarItem: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    position: 'relative',
  },
  sidebarLabel: {
    flex: 1,
    fontWeight: '600',
  },
  sidebarNavigation: {
    gap: spacing.xs,
  },
  signOut: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    outlineStyle: 'solid',
    outlineWidth: 0,
    paddingHorizontal: spacing.sm,
  },
  signOutLabel: {
    fontWeight: '600',
    includeFontPadding: false,
  },
  title: {
    ...typography.headline,
    flex: 1,
    fontWeight: '600',
    includeFontPadding: false,
    textAlign: 'left',
  },
  workspace: {
    flex: 1,
    flexDirection: 'row',
  },
})
