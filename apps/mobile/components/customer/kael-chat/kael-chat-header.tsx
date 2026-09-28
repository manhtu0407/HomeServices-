import type { ComponentProps, ReactNode } from 'react'
import { Text, View } from 'react-native'
import Animated from 'react-native-reanimated'

import { GlassSurface } from '@/components/ui/glass-surface'
import { LiquidBackButton, LiquidSurfaceOverlay } from '@/components/ui/liquid-back-button'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { ChatModeSwitchAura, ChatNewConversationIcon } from './chat-surfaces'
import { customerV21ChatStyles as styles } from './chat-styles'
import { KaelLiquidPressable } from './kael-liquid-pressable'
import type { CustomerKaelMode } from '../ui/types'

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style']

export function CustomerKaelChatHeader({
  animatedModeMenuStyle,
  caseWorkLabel,
  language,
  mode,
  modeMenuOpen,
  normalChatLabel,
  onBack,
  onSwitchMode,
  onToggleModeMenu,
  onToggleSessionMenu,
  reduceMotion,
  reduceTransparency,
  sessionMenuNode,
  sessionMenuOpen,
  tokens,
}: {
  animatedModeMenuStyle: AnimatedViewStyle
  caseWorkLabel: string
  language: AppLanguage
  mode: CustomerKaelMode
  modeMenuOpen: boolean
  normalChatLabel: string
  onBack: () => void
  onSwitchMode: (mode: CustomerKaelMode) => void
  onToggleModeMenu: () => void
  onToggleSessionMenu: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
  sessionMenuNode: ReactNode
  sessionMenuOpen: boolean
  tokens: CustomerThemeTokens
}) {
  const activeModeLabel = mode === 'normal' ? normalChatLabel : caseWorkLabel
  const modeOptions = [
    {
      description: language === 'vi' ? 'Hỏi đáp và hỗ trợ hằng ngày' : 'Everyday questions and support',
      label: normalChatLabel,
      value: 'normal' as const,
    },
    {
      description: language === 'vi' ? 'Phân tích và điều phối dịch vụ' : 'Service analysis and coordination',
      label: caseWorkLabel,
      value: 'case' as const,
    },
  ]

  return (
    <>
      <View style={styles.chatHeader} testID="customer-v21-kael-source-header">
        <LiquidBackButton
          iconColor={tokens.text}
          label={language === 'vi' ? 'Quay lại' : 'Back'}
          mode={tokens.mode}
          onPress={onBack}
          testID="customer-v21-kael-back"
        />
        <View style={styles.chatHeaderSpacer} />
        <GlassSurface
          backgroundColor={reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.42)' : 'rgba(255,255,255,0.16)'}
          borderColor={reduceTransparency ? tokens.border : tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.72)'}
          material="liquid"
          mode={tokens.mode}
          showEdgeHighlight={false}
          style={[
            styles.chatHeaderActions,
            !reduceTransparency ? styles.chatHeaderActionsLiquid : null,
            modeMenuOpen || sessionMenuOpen ? styles.chatHeaderActionsOpen : null,
          ]}
          testID="customer-v21-kael-header-actions"
          variant="control"
        >
          {!reduceTransparency ? (
            <LiquidSurfaceOverlay
              designHeight={44}
              designWidth={158}
              mode={tokens.mode}
              radius={22}
              testID="customer-v21-kael-header-actions-liquid"
            />
          ) : null}
          <KaelLiquidPressable
            accessibilityLabel={language === 'vi' ? 'Mở danh sách cuộc trò chuyện' : 'Open conversation list'}
            accessibilityRole="button"
            accessibilityState={{ expanded: sessionMenuOpen }}
            onPress={onToggleSessionMenu}
            reduceMotion={reduceMotion}
            selected={sessionMenuOpen}
            style={styles.chatHeaderNewConversation}
            testID="customer-v21-kael-new-conversation"
          >
            <ChatNewConversationIcon color={tokens.text} />
          </KaelLiquidPressable>
          <KaelLiquidPressable
            accessibilityLabel={language === 'vi' ? `Chế độ Kael: ${activeModeLabel}. Nhấn để đổi chế độ` : `Kael mode: ${activeModeLabel}. Press to switch mode`}
            accessibilityRole="button"
            accessibilityState={{ expanded: modeMenuOpen }}
            onPress={onToggleModeMenu}
            reduceMotion={reduceMotion}
            selected={modeMenuOpen}
            style={[
              styles.chatHeaderModeTrigger,
              modeMenuOpen ? styles.chatHeaderModeTriggerOpen : null,
            ]}
            testID="customer-v21-kael-mode-toggle"
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              numberOfLines={1}
              style={[styles.chatHeaderModeLabel, { color: tokens.text }]}
              testID="customer-v21-kael-active-mode"
            >
              {activeModeLabel}
            </Text>
          </KaelLiquidPressable>
        </GlassSurface>
      </View>

      {sessionMenuOpen ? sessionMenuNode : null}

      {modeMenuOpen ? (
        <Animated.View
          style={[
            styles.chatModeSwitch,
            styles.chatModeMenu,
            reduceTransparency
              ? { backgroundColor: tokens.raised, borderColor: tokens.border }
              : {
                backgroundColor: tokens.mode === 'dark' ? 'rgba(22,29,27,0.42)' : 'rgba(255,255,255,0.18)',
                borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.72)',
              },
            !reduceTransparency ? styles.chatModeMenuLiquid : null,
            animatedModeMenuStyle,
          ]}
          testID="customer-v21-chat-mode-menu"
        >
          {!reduceTransparency ? (
            <>
              <ChatModeSwitchAura reduceTransparency={reduceTransparency} />
              <LiquidSurfaceOverlay
                designHeight={120}
                mode={tokens.mode}
                radius={18}
                testID="customer-v21-chat-mode-menu-liquid"
              />
            </>
          ) : null}
          {modeOptions.map((option) => {
            const selected = mode === option.value
            return (
              <KaelLiquidPressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={option.value}
                onPress={() => onSwitchMode(option.value)}
                reduceMotion={reduceMotion}
                selected={selected}
                style={[
                  styles.chatModeButton,
                  styles.chatModeMenuButton,
                  styles.chatModeMenuOption,
                  {
                    backgroundColor: reduceTransparency
                      ? tokens.raised
                      : tokens.mode === 'dark'
                        ? selected ? tokens.glassStrong : tokens.glass
                        : selected ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.16)',
                    borderColor: reduceTransparency
                      ? selected ? tokens.primary : tokens.border
                      : tokens.mode === 'dark'
                        ? selected ? tokens.borderStrong : tokens.border
                        : selected ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.48)',
                  },
                  selected ? styles.chatModeButtonActive : null,
                ]}
                testID={option.value === 'normal' ? 'customer-v21-chat-tab-normal' : 'customer-v21-chat-tab-case-work'}
              >
                <View style={styles.chatModeMenuCopy}>
                  <Text style={[styles.chatModeMenuText, { color: selected ? tokens.primary : tokens.text }]}>{option.label}</Text>
                  <Text style={[styles.chatModeMenuDescription, { color: tokens.muted }]}>{option.description}</Text>
                </View>
                {selected ? <Text style={[styles.chatModeMenuCheck, { color: tokens.primary }]}>✓</Text> : null}
              </KaelLiquidPressable>
            )
          })}
        </Animated.View>
      ) : null}
    </>
  )
}
