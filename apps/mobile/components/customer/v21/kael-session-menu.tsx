import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Path } from 'react-native-svg'

import { KaelTextField } from '@/components/ui/kael-primitives'
import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'
import type { AppLanguage } from '@/lib/app-language'
import type {
  CustomerKaelConversationMode,
  CustomerKaelConversationSession,
} from '@/lib/api-types/customer'

import type { CustomerThemeTokens } from '../customer-theme'
import { SourceCardSkin } from './aura-surfaces'
import { customerV21ServiceCopy } from './copy'
import { KaelLiquidPressable } from './kael-liquid-pressable'
import { KaelLiquidReveal } from './kael-liquid-reveal'

type Props = {
  activeSessionId: string | null
  canCreate: boolean
  error: string | null
  language: AppLanguage
  loading: boolean
  mode: CustomerKaelConversationMode
  onArchive: (sessionId: string) => Promise<boolean>
  onCreate: () => void
  onPin: (sessionId: string, pinned: boolean) => Promise<boolean>
  onRename: (sessionId: string, title: string) => Promise<boolean>
  onSelect: (sessionId: string) => void
  pendingSessionIds: string[]
  reduceMotion: boolean
  reduceTransparency: boolean
  sessions: CustomerKaelConversationSession[]
  tokens: CustomerThemeTokens
}

export function CustomerKaelSessionMenu({
  activeSessionId,
  canCreate,
  error,
  language,
  loading,
  mode,
  onArchive,
  onCreate,
  onPin,
  onRename,
  onSelect,
  pendingSessionIds,
  reduceMotion,
  reduceTransparency,
  sessions,
  tokens,
}: Props) {
  const [actionSessionId, setActionSessionId] = useState<string | null>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const opacity = useSharedValue(reduceMotion ? 1 : 0)
  const translateY = useSharedValue(reduceMotion ? 0 : -5)
  const scale = useSharedValue(reduceMotion ? 1 : 0.98)
  const copy = sessionMenuCopy(language, mode)

  useEffect(() => {
    opacity.value = withTiming(1, { duration: motionDuration(135, reduceMotion) })
    if (reduceMotion) {
      translateY.value = 0
      scale.value = 1
      return
    }
    translateY.value = withSpring(0, motionTokens.liquid.pill)
    scale.value = withSpring(1, motionTokens.liquid.entrance)
  }, [opacity, reduceMotion, scale, translateY])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }))

  const beginRename = (session: CustomerKaelConversationSession) => {
    setActionSessionId(null)
    setDeletingSessionId(null)
    setRenamingSessionId(session.id)
    setDraftTitle(sessionTitle(session, language, mode))
  }

  const saveRename = () => {
    const sessionId = renamingSessionId
    const title = draftTitle.trim()
    if (!sessionId || title.length === 0 || title.length > 64 || pendingSessionIds.includes(sessionId)) return
    setRenamingSessionId(null)
    setDraftTitle('')
    void onRename(sessionId, title)
  }

  return (
    <Animated.View
      style={[styles.menuPosition, animatedStyle]}
      testID="customer-v21-kael-session-menu-shell"
    >
      <View
        accessibilityLabel={copy.accessibilityLabel}
        accessibilityRole="menu"
        style={[
          styles.menu,
          {
            backgroundColor: reduceTransparency ? tokens.raised : 'rgba(250,255,253,0.92)',
            borderColor: tokens.border,
          },
        ]}
        testID="customer-v21-kael-session-menu"
      >
        {!reduceTransparency ? <SourceCardSkin /> : null}
        <KaelLiquidPressable
          accessibilityLabel={copy.newSession}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreate }}
          disabled={!canCreate}
          onPress={onCreate}
          reduceMotion={reduceMotion}
          style={[
            styles.newSession,
            { borderColor: tokens.border },
            !canCreate ? styles.disabled : null,
          ]}
          testID="customer-v21-kael-session-new"
        >
          <SessionPlusIcon color={tokens.primary} />
          <Text style={[styles.newSessionText, { color: tokens.primary }]}>{copy.newSession}</Text>
        </KaelLiquidPressable>

        {loading ? <Text style={[styles.feedback, { color: tokens.muted }]}>{copy.loading}</Text> : null}
        {!loading && error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !error && sessions.length === 0 ? (
          <Text style={[styles.feedback, { color: tokens.muted }]}>{copy.empty}</Text>
        ) : null}

        {!loading && sessions.length > 0 ? (
          <ScrollView
            contentContainerStyle={styles.sessionList}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.sessionListViewport}
          >
            {sessions.map((session) => {
              const selected = session.id === activeSessionId
              const actionsOpen = actionSessionId === session.id
              const deleting = deletingSessionId === session.id
              const renaming = renamingSessionId === session.id
              const pending = pendingSessionIds.includes(session.id)
              const pinned = Boolean(session.pinned_at)
              const linkedCaseWork = Boolean(session.case_session_id)
              const title = sessionTitle(session, language, mode)
              return (
                <View key={session.id} style={styles.sessionGroup}>
                  <View
                    style={[
                      styles.session,
                      { borderColor: selected ? tokens.primary : tokens.border },
                      selected ? styles.sessionSelected : null,
                    ]}
                  >
                    <KaelLiquidPressable
                      accessibilityLabel={title}
                      accessibilityRole="button"
                      accessibilityState={{ busy: pending, selected }}
                      disabled={pending}
                      onPress={() => onSelect(session.id)}
                      reduceMotion={reduceMotion}
                      selected={selected}
                      style={styles.sessionMain}
                      testID={`customer-v21-kael-session-${session.id}`}
                    >
                      <View style={[styles.statusDot, selected ? { backgroundColor: tokens.primary } : null]} />
                      <View style={styles.sessionCopy}>
                        <View style={styles.sessionTitleRow}>
                          {pinned ? <SessionPinIcon color={tokens.primary} /> : null}
                          <Text numberOfLines={1} style={[styles.sessionTitle, { color: tokens.text }]}>{title}</Text>
                        </View>
                        <Text numberOfLines={1} style={[styles.sessionMeta, { color: tokens.muted }]}>
                          {sessionMeta(session, selected, language)}
                        </Text>
                      </View>
                      {selected ? <Text style={[styles.check, { color: tokens.primary }]}>✓</Text> : null}
                    </KaelLiquidPressable>
                    <KaelLiquidPressable
                      accessibilityLabel={`${copy.more} ${title}`}
                      accessibilityRole="button"
                      accessibilityState={{ busy: pending, expanded: actionsOpen || deleting || renaming }}
                      hitSlop={6}
                      onPress={() => {
                        setRenamingSessionId(null)
                        setDeletingSessionId(null)
                        setActionSessionId(actionsOpen ? null : session.id)
                      }}
                      reduceMotion={reduceMotion}
                      selected={actionsOpen || deleting || renaming}
                      style={[
                        styles.moreButton,
                        actionsOpen ? styles.moreButtonOpen : null,
                      ]}
                      testID={`customer-v21-kael-session-actions-${session.id}`}
                    >
                      <SessionMoreIcon color={tokens.primary} />
                    </KaelLiquidPressable>
                  </View>

                  {actionsOpen ? (
                    <KaelLiquidReveal reduceMotion={reduceMotion} style={[styles.actionMenu, { borderColor: tokens.border }]} testID={`customer-v21-kael-session-action-menu-${session.id}`}>
                      <ActionButton
                        disabled={pending}
                        label={pinned ? copy.unpin : copy.pin}
                        onPress={() => void onPin(session.id, !pinned)}
                        reduceMotion={reduceMotion}
                        testID={`customer-v21-kael-session-pin-${session.id}`}
                        textColor={tokens.text}
                      />
                      <ActionButton
                        disabled={pending}
                        label={copy.rename}
                        onPress={() => beginRename(session)}
                        reduceMotion={reduceMotion}
                        testID={`customer-v21-kael-session-rename-${session.id}`}
                        textColor={tokens.text}
                      />
                      <ActionButton
                        destructive
                        disabled={pending}
                        label={copy.delete}
                        onPress={() => {
                          setActionSessionId(null)
                          setDeletingSessionId(session.id)
                        }}
                        reduceMotion={reduceMotion}
                        testID={`customer-v21-kael-session-delete-${session.id}`}
                        textColor="#E5484D"
                      />
                    </KaelLiquidReveal>
                  ) : null}

                  {deleting ? (
                    <KaelLiquidReveal
                      accessibilityLabel={linkedCaseWork ? copy.deleteCaseConfirm : copy.deleteConfirm}
                      accessibilityRole="alert"
                      reduceMotion={reduceMotion}
                      style={[
                        styles.deleteConfirm,
                        linkedCaseWork ? styles.linkedCaseDeleteConfirm : null,
                        { borderColor: tokens.border },
                      ]}
                      testID={`customer-v21-kael-session-delete-confirm-${session.id}`}
                    >
                      <Text numberOfLines={linkedCaseWork ? 4 : 2} style={[styles.deleteConfirmCopy, { color: tokens.text }]}>
                        {linkedCaseWork ? copy.deleteCaseConfirm : copy.deleteConfirm}
                      </Text>
                      <KaelLiquidPressable accessibilityRole="button" onPress={() => setDeletingSessionId(null)} reduceMotion={reduceMotion} style={styles.confirmAction}>
                        <Text style={[styles.confirmCancel, { color: tokens.muted }]}>{copy.cancel}</Text>
                      </KaelLiquidPressable>
                      <KaelLiquidPressable accessibilityLabel={linkedCaseWork ? copy.deleteCaseAction : copy.delete} accessibilityRole="button" disabled={pending} onPress={() => {
                        setDeletingSessionId(null)
                        void onArchive(session.id)
                      }} reduceMotion={reduceMotion} style={[styles.confirmAction, pending ? styles.disabled : null]} testID={`customer-v21-kael-session-delete-confirm-action-${session.id}`}>
                        <Text numberOfLines={2} style={styles.confirmDelete}>{linkedCaseWork ? copy.deleteCaseAction : copy.delete}</Text>
                      </KaelLiquidPressable>
                    </KaelLiquidReveal>
                  ) : null}

                  {renaming ? (
                    <KaelLiquidReveal reduceMotion={reduceMotion} style={[styles.renameEditor, { borderColor: tokens.border }]} testID={`customer-v21-kael-session-rename-editor-${session.id}`}>
                      <KaelTextField
                        accessibilityLabel={copy.renamePlaceholder}
                        autoCapitalize="sentences"
                        autoCorrect
                        autoFocus
                        inputShellStyle={styles.renameInputShell}
                        maxLength={64}
                        onChangeText={setDraftTitle}
                        onSubmitEditing={saveRename}
                        placeholder={copy.renamePlaceholder}
                        returnKeyType="done"
                        selectTextOnFocus
                        style={styles.renameInput}
                        testID="customer-v21-kael-session-title-input"
                        value={draftTitle}
                      />
                      <View style={styles.renameActions}>
                        <KaelLiquidPressable accessibilityRole="button" onPress={() => {
                          setRenamingSessionId(null)
                          setDraftTitle('')
                        }} reduceMotion={reduceMotion} style={styles.renameSecondary}>
                          <Text style={[styles.renameSecondaryText, { color: tokens.muted }]}>{copy.cancel}</Text>
                        </KaelLiquidPressable>
                        <KaelLiquidPressable
                          accessibilityRole="button"
                          accessibilityState={{ disabled: draftTitle.trim().length === 0 }}
                          disabled={draftTitle.trim().length === 0}
                          onPress={saveRename}
                          reduceMotion={reduceMotion}
                          style={[styles.renamePrimary, { backgroundColor: tokens.primary }, draftTitle.trim().length === 0 ? styles.disabled : null]}
                          testID="customer-v21-kael-session-title-save"
                        >
                          <Text style={styles.renamePrimaryText}>{copy.save}</Text>
                        </KaelLiquidPressable>
                      </View>
                    </KaelLiquidReveal>
                  ) : null}
                </View>
              )
            })}
          </ScrollView>
        ) : null}
      </View>
    </Animated.View>
  )
}

function ActionButton({
  destructive = false,
  disabled,
  label,
  onPress,
  reduceMotion,
  testID,
  textColor,
}: {
  destructive?: boolean
  disabled: boolean
  label: string
  onPress: () => void
  reduceMotion: boolean
  testID: string
  textColor: string
}) {
  return (
    <KaelLiquidPressable
      accessibilityRole="menuitem"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      reduceMotion={reduceMotion}
      style={[styles.actionButton, disabled ? styles.disabled : null]}
      testID={testID}
    >
      <Text style={[styles.actionText, { color: destructive ? '#E5484D' : textColor }]}>{label}</Text>
    </KaelLiquidPressable>
  )
}

function SessionPlusIcon({ color }: { color: string }) {
  return <Svg height={18} viewBox="0 0 24 24" width={18}><Path d="M12 5.5v13M5.5 12h13" fill="none" stroke={color} strokeLinecap="round" strokeWidth={2} /></Svg>
}

function SessionMoreIcon({ color }: { color: string }) {
  return <Svg height={18} viewBox="0 0 24 24" width={18}><Circle cx={12} cy={5.5} fill={color} r={1.2} /><Circle cx={12} cy={12} fill={color} r={1.2} /><Circle cx={12} cy={18.5} fill={color} r={1.2} /></Svg>
}

function SessionPinIcon({ color }: { color: string }) {
  return <Svg height={13} viewBox="0 0 24 24" width={13}><Path d="M8.2 4.5h7.6l-1.25 5.2L17 12.15v1.35H7v-1.35L9.45 9.7 8.2 4.5ZM12 13.5v6" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} /></Svg>
}

function sessionTitle(
  session: CustomerKaelConversationSession,
  language: AppLanguage,
  mode: CustomerKaelConversationMode,
) {
  if (session.title?.trim()) return session.title.trim()
  const serviceLabel = sessionServiceLabel(session, language)
  if (serviceLabel) return serviceLabel
  if (language === 'en') return mode === 'normal' ? 'Normal chat' : 'Work handling'
  return mode === 'normal' ? 'Chat thường' : 'Xử lý công việc'
}

function sessionMeta(session: CustomerKaelConversationSession, selected: boolean, language: AppLanguage) {
  const turns = language === 'vi' ? `${session.total_turns} lượt trao đổi` : `${session.total_turns} turns`
  const serviceLabel = session.title?.trim() ? sessionServiceLabel(session, language) : null
  const detail = serviceLabel ? `${serviceLabel} · ${turns}` : turns
  return selected ? `${language === 'vi' ? 'Đang mở' : 'Open'} · ${detail}` : detail
}

function sessionServiceLabel(session: CustomerKaelConversationSession, language: AppLanguage) {
  return session.service_type ? customerV21ServiceCopy[language][session.service_type].label : null
}

function sessionMenuCopy(language: AppLanguage, mode: CustomerKaelConversationMode) {
  if (language === 'en') {
    return {
      accessibilityLabel: mode === 'normal' ? 'Normal chat conversations' : 'Work handling conversations',
      cancel: 'Cancel',
      delete: 'Delete',
      deleteCaseAction: 'Cancel & delete',
      deleteCaseConfirm: 'Kael is handling this job. Continuing will cancel the linked workflow and remove this conversation.',
      deleteConfirm: 'Remove this conversation from the list?',
      empty: 'No conversations yet.',
      loading: 'Loading conversations...',
      more: 'More options for',
      newSession: 'New conversation',
      pin: 'Pin',
      rename: 'Rename',
      renamePlaceholder: 'Conversation name',
      save: 'Save',
      unpin: 'Unpin',
    }
  }
  return {
    accessibilityLabel: mode === 'normal' ? 'Các phiên Chat thường' : 'Các phiên Xử lý công việc',
    cancel: 'Hủy',
    delete: 'Xóa',
    deleteCaseAction: 'Hủy & xóa',
    deleteCaseConfirm: 'Kael đang xử lý công việc này. Tiếp tục sẽ hủy quy trình liên kết và xóa cuộc trò chuyện.',
    deleteConfirm: 'Xóa cuộc trò chuyện này khỏi danh sách?',
    empty: 'Chưa có cuộc trò chuyện.',
    loading: 'Đang tải cuộc trò chuyện...',
    more: 'Tùy chọn cho',
    newSession: 'Cuộc trò chuyện mới',
    pin: 'Ghim',
    rename: 'Đổi tên',
    renamePlaceholder: 'Tên cuộc trò chuyện',
    save: 'Lưu',
    unpin: 'Bỏ ghim',
  }
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 3,
  },
  actionMenu: {
    backgroundColor: 'rgba(252,255,254,0.98)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 44,
    overflow: 'hidden',
  },
  actionText: { fontSize: 10.5, fontWeight: '700' },
  check: { fontSize: 16, fontWeight: '700', marginLeft: 4 },
  confirmAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 48, paddingHorizontal: 5 },
  confirmCancel: { fontSize: 10, fontWeight: '700' },
  confirmDelete: { color: '#E5484D', fontSize: 10, fontWeight: '700' },
  deleteConfirm: { alignItems: 'center', backgroundColor: 'rgba(255,250,250,0.98)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', minHeight: 52 },
  deleteConfirmCopy: { flex: 1, fontSize: 9.5, fontWeight: '600', lineHeight: 12, paddingHorizontal: 7 },
  linkedCaseDeleteConfirm: { minHeight: 66 },
  disabled: { opacity: 0.48 },
  error: { color: '#D94C51', fontSize: 10.5, fontWeight: '600', lineHeight: 14, paddingHorizontal: 4 },
  feedback: { fontSize: 10.5, fontWeight: '600', lineHeight: 14, paddingHorizontal: 4 },
  menu: { borderRadius: 16, borderWidth: 1, gap: 3, overflow: 'hidden', padding: 5 },
  menuPosition: { maxWidth: 208, position: 'absolute', right: 10, top: 66, width: '59%', zIndex: 42 },
  moreButton: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 13, justifyContent: 'center', minWidth: 36 },
  moreButtonOpen: { backgroundColor: 'rgba(217,246,240,0.78)' },
  newSession: { alignItems: 'center', backgroundColor: 'rgba(229,250,245,0.92)', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  newSessionText: { fontSize: 11, fontWeight: '700' },
  renameActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end' },
  renameEditor: { backgroundColor: 'rgba(246,253,251,0.98)', borderRadius: 15, borderWidth: 1, gap: 5, padding: 8 },
  renameInput: { fontSize: 12, minHeight: 38, paddingHorizontal: 10, paddingVertical: 7 },
  renameInputShell: { borderRadius: 12, minHeight: 40 },
  renamePrimary: { alignItems: 'center', borderRadius: 999, justifyContent: 'center', minHeight: 44, minWidth: 70, paddingHorizontal: 13 },
  renamePrimaryText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' },
  renameSecondary: { alignItems: 'center', borderRadius: 999, justifyContent: 'center', minHeight: 44, minWidth: 64, paddingHorizontal: 10 },
  renameSecondaryText: { fontSize: 11.5, fontWeight: '700' },
  session: { alignItems: 'center', backgroundColor: 'rgba(247,252,251,0.94)', borderRadius: 13, borderWidth: 1, flexDirection: 'row', minHeight: 44 },
  sessionCopy: { flex: 1, minWidth: 0 },
  sessionGroup: { gap: 3 },
  sessionList: { gap: 3 },
  sessionListViewport: { maxHeight: 138 },
  sessionMain: { alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 44, paddingLeft: 8, paddingRight: 2 },
  sessionMeta: { fontSize: 9.5, fontWeight: '500', lineHeight: 12 },
  sessionSelected: { backgroundColor: 'rgba(231,252,247,0.98)' },
  sessionTitle: { flexShrink: 1, fontSize: 10.5, fontWeight: '700', lineHeight: 14 },
  sessionTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 3, minWidth: 0 },
  statusDot: { backgroundColor: 'rgba(143,174,169,0.68)', borderRadius: 4, height: 6, marginRight: 7, width: 6 },
})
