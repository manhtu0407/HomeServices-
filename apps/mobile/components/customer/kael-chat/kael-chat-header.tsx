import type { ComponentProps, ReactNode } from 'react'
import { Text, View } from 'react-native'
import Animated from 'react-native-reanimated'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { SourceCardSkin } from '../ui/aura-surfaces'
import { ChatBackIcon, ChatModeSwitchAura, ChatNewConversationIcon } from './chat-surfaces'
import { customerV21ChatStyles as styles } from './chat-styles'
import { KaelLiquidPressable } from './kael-liquid-pressable'
import type { CustomerKaelMode } from '../ui/types'

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style']

export function CustomerKaelChatHeader({
  animatedModeMenuSheenStyle,
  animatedModeMenuStyle,
  canStartNewConversation,
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
  animatedModeMenuSheenStyle: AnimatedViewStyle
  animatedModeMenuStyle: AnimatedViewStyle
  canStartNewConversation: boolean
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
        <KaelLiquidPressable
          accessibilityLabel={language === 'vi' ? 'Quay lại' : 'Back'}
          accessibilityRole="button"
          onPress={onBack}
          reduceMotion={reduceMotion}
          style={[
            styles.chatHeaderBackControl,
            { backgroundColor: tokens.raised, borderColor: tokens.border },
          ]}
          testID="customer-v21-kael-back"
        >
          <ChatBackIcon color={tokens.primary} />
        </KaelLiquidPressable>
        <View style={styles.chatHeaderSpacer} />
        <View
          style={[
            styles.chatHeaderActions,
            modeMenuOpen || sessionMenuOpen ? styles.chatHeaderActionsOpen : null,
            { backgroundColor: tokens.raised, borderColor: tokens.border },
          ]}
          testID="customer-v21-kael-header-actions"
        >
          {!reduceTransparency ? <SourceCardSkin /> : null}
          <KaelLiquidPressable
            accessibilityLabel={language === 'vi' ? 'Mở danh sách cuộc trò chuyện' : 'Open conversation list'}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canStartNewConversation, expanded: sessionMenuOpen }}
            disabled={!canStartNewConversation}
            onPress={onToggleSessionMenu}
            reduceMotion={reduceMotion}
            selected={sessionMenuOpen}
            style={[
              styles.chatHeaderNewConversation,
              !canStartNewConversation ? styles.chatHeaderNewConversationDisabled : null,
            ]}
            testID="customer-v21-kael-new-conversation"
          >
            <ChatNewConversationIcon color={tokens.primary} />
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
        </View>
      </View>

      {sessionMenuOpen ? sessionMenuNode : null}

      {modeMenuOpen ? (
        <Animated.View
          style={[styles.chatModeSwitch, styles.chatModeMenu, { backgroundColor: tokens.ghost, borderColor: 'rgba(255,255,255,0.88)' }, animatedModeMenuStyle]}
          testID="customer-v21-chat-mode-menu"
        >
          {!reduceTransparency ? <SourceCardSkin /> : null}
          <ChatModeSwitchAura reduceTransparency={reduceTransparency} />
          {!reduceMotion && !reduceTransparency ? (
            <Animated.View pointerEvents="none" style={[styles.chatModeMenuSheen, animatedModeMenuSheenStyle]} testID="customer-v21-chat-mode-menu-sheen" />
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
                  { backgroundColor: selected ? tokens.raised : 'rgba(255,255,255,0.42)', borderColor: selected ? 'rgba(255,255,255,0.92)' : 'rgba(13,167,151,0.12)' },
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
