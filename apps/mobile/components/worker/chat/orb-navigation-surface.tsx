import { Pressable, Text as RNText, type PressableStateCallbackType, type TextProps, View, type ViewStyle } from 'react-native'
import Animated, { type AnimatedStyle } from 'react-native-reanimated'
import type { AppLanguage } from '@/lib/app-language'
import { GlassSurface } from '@/components/ui/glass-surface'
import { KaelModeMenuMintAura } from '@/components/ui/kael-mode-menu-mint-aura'
import { color } from '@/design/theme'
import { WorkerV5SourceCardSkin } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { styles } from '../worker-v5-flow-styles'
import { WorkerV5BackArrowIcon } from '../ui/primitives-surfaces'
import { WorkerV5KaelSessionMenu } from './session-menu'
import { WorkerV5KaelSessionIcon } from './session-menu-icons'
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
  return <>
    <View style={[styles.kaelOrbCustomerTopBar, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-source-header">
      <Pressable
        accessibilityLabel={language === 'vi' ? 'Quay lại' : 'Back'}
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.kaelOrbCustomerTopControl, pressed ? styles.pressed : null]}
        testID="worker-v5-back"
      >
        <WorkerV5BackArrowIcon strokeColor={color.text.primary} />
      </Pressable>
      <View style={styles.kaelOrbCustomerTopSpacer} />
      <GlassSurface
        backgroundColor="rgba(255,255,255,0.96)"
        borderColor="rgba(255,255,255,0.98)"
        material="liquid"
        mode="light"
        style={[
          styles.kaelOrbCustomerHeaderActions,
          modeMenuOpen || sessionMenuOpen ? styles.kaelOrbCustomerHeaderActionsOpen : null,
        ]}
        testID="worker-v5-kael-header-actions"
        variant="control"
      >
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Quản lý các phiên Kael', 'Manage Kael conversations')}
          accessibilityRole="button"
          accessibilityState={{ expanded: sessionMenuOpen }}
          onPress={onToggleSessionMenu}
          style={({ pressed }) => [
            styles.kaelOrbCustomerSessionTrigger,
            sessionMenuOpen ? styles.kaelOrbCustomerSessionTriggerOpen : null,
            pressed ? (reduceMotion ? styles.kaelOrbCustomerSessionTriggerPressedReduced : styles.pressed) : null,
          ]}
          testID="worker-v5-kael-session-toggle"
        >
          <WorkerV5KaelSessionIcon kind="plus" strokeColor={color.text.primary} strokeWidth={2.7} />
        </Pressable>
        <Animated.View
          style={[
            styles.kaelOrbCustomerModeTrigger,
            modeMenuOpen ? styles.kaelOrbCustomerModeTriggerOpen : null,
            animatedModeTriggerStyle,
          ]}
          testID="worker-v5-kael-mode-trigger-frame"
        >
          <Pressable
            accessibilityLabel={textByLanguage(
              language,
              `Chế độ Kael: ${activeMode.label}. Nhấn để đổi chế độ`,
              `Kael mode: ${activeMode.label}. Press to switch mode`,
            )}
            accessibilityRole="button"
            accessibilityState={{ expanded: modeMenuOpen }}
            onPress={onToggleModeMenu}
            style={({ pressed }: PressableStateCallbackType) => [
              styles.kaelOrbCustomerModeTriggerPressTarget,
              pressed ? (reduceMotion ? styles.kaelOrbCustomerModeTriggerPressedReduced : styles.pressed) : null,
            ]}
            testID="worker-v5-kael-mode-toggle"
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              numberOfLines={1}
              style={styles.kaelOrbCustomerModeTriggerText}
              testID="worker-v5-kael-active-mode"
            >
              {activeMode.label}
            </Text>
          </Pressable>
        </Animated.View>
      </GlassSurface>
    </View>

    {showMenus && modeMenuOpen ? (
      <Animated.View
        style={[
          styles.kaelOrbCustomerModeMenu,
          reduceTransparency ? styles.opaqueCard : null,
          animatedModeMenuStyle,
        ]}
        testID="worker-v5-kael-mode-menu"
      >
        {!reduceTransparency ? (
          <>
            <WorkerV5SourceCardSkin testID="worker-v5-kael-mode-menu-skin" />
            <KaelModeMenuMintAura
              reduceTransparency={reduceTransparency}
              scope="Worker"
              testID="worker-v5-kael-mode-menu-mint-aura"
            />
          </>
        ) : null}
        <Animated.View style={[styles.kaelOrbCustomerModeMenuOptions, animatedModeMenuContentStyle]} testID="worker-v5-kael-mode-menu-options">
          {modeOptions.map((item) => {
            const selected = mode === item.value
            return <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={item.value}
              onPress={() => onSelectMode(item.value)}
              style={({ pressed }) => [
                styles.kaelOrbCustomerModeMenuOption,
                selected ? styles.kaelOrbCustomerModeMenuOptionActive : null,
                reduceTransparency ? styles.opaqueCard : null,
                pressed ? styles.pressed : null,
              ]}
              testID={`worker-v5-kael-mode-menu-${item.value}`}
            >
              <View style={styles.kaelOrbCustomerModeMenuCopy}>
                <Text style={[styles.kaelOrbCustomerModeMenuText, selected ? styles.kaelOrbCustomerModeMenuTextActive : null]}>{item.label}</Text>
                <Text style={styles.kaelOrbCustomerModeMenuDescription}>{item.description}</Text>
              </View>
              {selected ? <Text style={styles.kaelOrbCustomerModeMenuCheck}>{'✓'}</Text> : null}
            </Pressable>
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
