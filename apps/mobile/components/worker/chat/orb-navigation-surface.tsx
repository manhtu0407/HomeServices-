import { Text as RNText, View, type TextProps, type ViewStyle } from 'react-native'
import Animated, { type AnimatedStyle } from 'react-native-reanimated'
import type { AppLanguage } from '@/lib/app-language'
import { KaelLiquidPressable } from '@/components/customer/kael-chat/kael-liquid-pressable'
import { GlassSurface } from '@/components/ui/glass-surface'
import { LiquidBackButton, LiquidSurfaceOverlay } from '@/components/ui/liquid-back-button'
import { textByLanguage } from '../ui/format'
import { styles } from '../worker-v5-flow-styles'
import { WorkerV5KaelSessionMenu } from './session-menu'
import { WorkerV5KaelSessionIcon } from './session-menu-icons'
import { useWorkerKaelOrbPalette } from './orb-palette'
import { useWorkerV5KaelOrbChat } from './use-kael-orb-chat'

type WorkerV5KaelOrbMode = 'intake' | 'normal'
type ModeOption = {
  description: string
  label: string
  value: WorkerV5KaelOrbMode
}
type OrbChat = ReturnType<typeof useWorkerV5KaelOrbChat>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5KaelOrbNavigationSurface({
  activeMode,
  animatedModeMenuContentStyle,
  animatedModeMenuStyle,
  animatedModeTriggerStyle,
  chat,
  language,
  mode,
  modeMenuOpen,
  modeOptions,
  onBack,
  onOpenSession,
  onSelectMode,
  onStartNewSession,
  onToggleModeMenu,
  onToggleSessionMenu,
  reduceMotion,
  reduceTransparency,
  sessionMenuOpen,
  showMenus = true,
}: {
  activeMode: ModeOption
  animatedModeMenuContentStyle: AnimatedStyle<ViewStyle>
  animatedModeMenuStyle: AnimatedStyle<ViewStyle>
  animatedModeTriggerStyle: AnimatedStyle<ViewStyle>
  chat: OrbChat
  language: AppLanguage
  mode: WorkerV5KaelOrbMode
  modeMenuOpen: boolean
  modeOptions: ModeOption[]
  onBack: () => void
  onOpenSession: (sessionId: string) => void
  onSelectMode: (mode: WorkerV5KaelOrbMode) => void
  onStartNewSession: () => void
  onToggleModeMenu: () => void
  onToggleSessionMenu: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
  sessionMenuOpen: boolean
  showMenus?: boolean
}) {
  const palette = useWorkerKaelOrbPalette()
  return <>
    <View style={[styles.kaelOrbCustomerTopBar, reduceTransparency && [styles.opaqueCard, palette.mode === 'dark' ? { backgroundColor: palette.opaqueFill } : null]]} testID="worker-v5-kael-source-header">
      <LiquidBackButton
        iconColor={palette.icon}
        mode={palette.mode}
        label={language === 'vi' ? 'Quay lại' : 'Back'}
        onPress={onBack}
        testID="worker-v5-back"
      />
      <View style={styles.kaelOrbCustomerTopSpacer} />
      <GlassSurface
        backgroundColor={palette.headerFill}
        borderColor={palette.headerBorder}
        material="liquid"
        mode={palette.mode}
        showEdgeHighlight={false}
        style={[
          styles.kaelOrbCustomerHeaderActions,
          !reduceTransparency ? styles.kaelOrbCustomerHeaderActionsLiquid : null,
          modeMenuOpen || sessionMenuOpen ? styles.kaelOrbCustomerHeaderActionsOpen : null,
        ]}
        testID="worker-v5-kael-header-actions"
        variant="control"
      >
        {!reduceTransparency ? (
          <LiquidSurfaceOverlay
            designHeight={44}
            designWidth={158}
            mode={palette.mode}
            radius={22}
            testID="worker-v5-kael-header-actions-liquid"
          />
        ) : null}
        <KaelLiquidPressable
          accessibilityLabel={textByLanguage(language, 'Quản lý các phiên Kael', 'Manage Kael conversations')}
          accessibilityRole="button"
          accessibilityState={{ expanded: sessionMenuOpen }}
          onPress={onToggleSessionMenu}
          reduceMotion={reduceMotion}
          selected={sessionMenuOpen}
          style={[
            styles.kaelOrbCustomerSessionTrigger,
            sessionMenuOpen ? styles.kaelOrbCustomerSessionTriggerOpen : null,
          ]}
          testID="worker-v5-kael-session-toggle"
        >
          <WorkerV5KaelSessionIcon kind="plus" strokeColor={palette.icon} strokeWidth={2.7} />
        </KaelLiquidPressable>
        <Animated.View
          style={[
            styles.kaelOrbCustomerModeTrigger,
            modeMenuOpen ? styles.kaelOrbCustomerModeTriggerOpen : null,
            animatedModeTriggerStyle,
          ]}
          testID="worker-v5-kael-mode-trigger-frame"
        >
          <KaelLiquidPressable
            accessibilityLabel={textByLanguage(
              language,
              `Chế độ Kael: ${activeMode.label}. Nhấn để đổi chế độ`,
              `Kael mode: ${activeMode.label}. Press to switch mode`,
            )}
            accessibilityRole="button"
            accessibilityState={{ expanded: modeMenuOpen }}
            onPress={onToggleModeMenu}
            reduceMotion={reduceMotion}
            selected={modeMenuOpen}
            style={styles.kaelOrbCustomerModeTriggerPressTarget}
            testID="worker-v5-kael-mode-toggle"
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              numberOfLines={1}
              style={[styles.kaelOrbCustomerModeTriggerText, { color: palette.ink }]}
              testID="worker-v5-kael-active-mode"
            >
              {activeMode.label}
            </Text>
          </KaelLiquidPressable>
        </Animated.View>
      </GlassSurface>
    </View>

    {showMenus && modeMenuOpen ? (
      <Animated.View
        style={[
          styles.kaelOrbCustomerModeMenu,
          animatedModeMenuStyle,
        ]}
        testID="worker-v5-kael-mode-menu"
      >
        <Animated.View style={[styles.kaelOrbCustomerModeMenuOptions, animatedModeMenuContentStyle]} testID="worker-v5-kael-mode-menu-options">
          {modeOptions.map((item) => {
            const selected = mode === item.value
            return <KaelLiquidPressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={item.value}
              onPress={() => onSelectMode(item.value)}
              reduceMotion={reduceMotion}
              selected={selected}
              style={[
                styles.kaelOrbCustomerModeMenuOption,
                selected ? styles.kaelOrbCustomerModeMenuOptionActive : null,
                palette.mode === 'dark' ? {
                  backgroundColor: selected ? palette.menuActiveFill : palette.menuFill,
                  borderColor: selected ? palette.menuActiveBorder : palette.menuBorder,
                } : null,
                reduceTransparency ? [styles.opaqueCard, palette.mode === 'dark' ? { backgroundColor: palette.opaqueFill, borderColor: palette.opaqueBorder } : null] : null,
              ]}
              testID={`worker-v5-kael-mode-menu-${item.value}`}
            >
              <View style={styles.kaelOrbCustomerModeMenuCopy}>
                <Text style={[styles.kaelOrbCustomerModeMenuText, { color: selected ? palette.accent : palette.ink }]}>{item.label}</Text>
                <Text style={[styles.kaelOrbCustomerModeMenuDescription, { color: palette.muted }]}>{item.description}</Text>
              </View>
              {selected ? <Text style={[styles.kaelOrbCustomerModeMenuCheck, { color: palette.accent }]}>{'✓'}</Text> : null}
            </KaelLiquidPressable>
          })}
        </Animated.View>
      </Animated.View>
    ) : null}

    {showMenus && sessionMenuOpen ? (
      <WorkerV5KaelSessionMenu
        activeSessionId={chat.activeSessionId}
        canCreate={chat.canCreateSession}
        error={chat.sessionsError}
        language={language}
        loading={chat.sessionsLoading}
        mode={mode}
        onArchive={chat.archiveSession}
        onCreate={onStartNewSession}
        onPin={chat.setSessionPinned}
        onRename={chat.renameSession}
        onSelect={onOpenSession}
        pendingSessionIds={chat.pendingSessionIds}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
        sessions={chat.sessions}
      />
    ) : null}
  </>
}
