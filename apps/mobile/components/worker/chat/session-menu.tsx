import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Path } from 'react-native-svg'
import type { WorkerKaelChatMode } from '@nestscout/shared'

import { GlassSurface } from '@/components/ui/glass-surface'
import { KaelTextField } from '@/components/ui/kael-primitives'
import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'
import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerKaelChatSession } from '@/lib/api-types'
import { styles } from './session-menu-styles'

type WorkerV5KaelSessionMenuProps = {
  activeSessionId: string | null
  canCreate: boolean
  error: string | null
  language: AppLanguage
  loading: boolean
  mode: WorkerKaelChatMode
  onArchive: (sessionId: string) => Promise<boolean>
  onCreate: () => void
  onPin: (sessionId: string, pinned: boolean) => Promise<boolean>
  onRename: (sessionId: string, title: string) => Promise<boolean>
  onSelect: (sessionId: string) => void
  pendingSessionIds: string[]
  reduceMotion: boolean
  reduceTransparency: boolean
  sessions: WorkerKaelChatSession[]
}

export function WorkerV5KaelSessionPlusIcon() {
  return (
    <Svg height={20} viewBox="0 0 24 24" width={20}>
      <Path
        d="M12 5.25v13.5M5.25 12h13.5"
        fill="none"
        stroke={color.brand.primaryDark}
        strokeLinecap="round"
        strokeWidth={2}
      />
    </Svg>
  )
}

function WorkerV5KaelSessionMoreIcon() {
  return (
    <Svg height={18} viewBox="0 0 24 24" width={18}>
      <Circle cx={12} cy={5.5} fill={color.brand.primaryDark} r={1.25} />
      <Circle cx={12} cy={12} fill={color.brand.primaryDark} r={1.25} />
      <Circle cx={12} cy={18.5} fill={color.brand.primaryDark} r={1.25} />
    </Svg>
  )
}

function WorkerV5KaelSessionPinIcon({ filled = false }: { filled?: boolean }) {
  return (
    <Svg height={14} viewBox="0 0 24 24" width={14}>
      <Path
        d="M8.2 4.5h7.6l-1.25 5.2 2.45 2.45v1.35H7v-1.35L9.45 9.7 8.2 4.5Zm3.8 9v6"
        fill={filled ? 'rgba(12,158,139,0.18)' : 'none'}
        stroke={color.brand.primaryDark}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.65}
      />
    </Svg>
  )
}

export function WorkerV5KaelSessionMenu({
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
}: WorkerV5KaelSessionMenuProps) {
  const [actionSessionId, setActionSessionId] = useState<string | null>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const sessionListRef = useRef<ScrollView>(null)
  const menuOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const menuScale = useSharedValue(reduceMotion ? 1 : 0.975)
  const menuTranslateY = useSharedValue(reduceMotion ? 0 : -5)
  const contentOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const contentTranslateY = useSharedValue(reduceMotion ? 0 : 4)
  const copy = sessionMenuCopy(language, mode)

  useEffect(() => {
    menuOpacity.value = withTiming(1, { duration: motionDuration(135, reduceMotion) })
    contentOpacity.value = withDelay(
      motionDuration(28, reduceMotion),
      withTiming(1, { duration: motionDuration(135, reduceMotion) }),
    )
    if (reduceMotion) {
      menuScale.value = 1
      menuTranslateY.value = 0
      contentTranslateY.value = 0
      return
    }
    menuScale.value = withSpring(1, motionTokens.liquid.entrance)
    menuTranslateY.value = withSpring(0, motionTokens.liquid.pill)
    contentTranslateY.value = withSpring(0, motionTokens.liquid.entrance)
  }, [contentOpacity, contentTranslateY, menuOpacity, menuScale, menuTranslateY, reduceMotion])

  useEffect(() => {
    const interactionSessionId = actionSessionId ?? renamingSessionId ?? deletingSessionId
    if (!interactionSessionId) return
    const sessionIndex = sessions.findIndex((session) => session.id === interactionSessionId)
    if (sessionIndex < 0) return
    sessionListRef.current?.scrollTo({
      animated: !reduceMotion,
      y: sessionIndex * 47,
    })
  }, [actionSessionId, deletingSessionId, reduceMotion, renamingSessionId, sessions])

  const animatedMenuStyle = useAnimatedStyle(() => ({
    opacity: menuOpacity.value,
    transform: [{ translateY: menuTranslateY.value }, { scale: menuScale.value }],
  }))
  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }))

  const beginRename = (session: WorkerKaelChatSession) => {
    setActionSessionId(null)
    setDeletingSessionId(null)
    setRenamingSessionId(session.id)
    setDraftTitle(sessionTitle(session, language))
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
      style={[styles.menuPosition, animatedMenuStyle]}
      testID="worker-v5-kael-session-menu-shell"
    >
      <GlassSurface
        backgroundColor={reduceTransparency ? color.surface.base : 'rgba(250,255,253,0.82)'}
        borderColor={reduceTransparency ? color.surface.stroke : 'rgba(255,255,255,0.90)'}
        material="liquid"
        style={styles.menuGlass}
        testID="worker-v5-kael-session-menu-glass"
        variant="sheet"
      >
        <View
          accessibilityLabel={copy.accessibilityLabel}
          accessibilityRole="menu"
          style={styles.menuContent}
          testID="worker-v5-kael-session-menu"
        >
          <Animated.View style={[styles.menuInner, animatedContentStyle]}>
            <Pressable
              accessibilityLabel={copy.newSession}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canCreate }}
              disabled={!canCreate}
              onPress={onCreate}
              style={({ pressed }) => [
                styles.newSession,
                !canCreate && styles.disabled,
                pressed && canCreate
                  ? (reduceMotion ? styles.pressedReduced : styles.pressed)
                  : null,
              ]}
              testID="worker-v5-kael-session-new"
            >
              <WorkerV5KaelSessionPlusIcon />
              <Text style={styles.newSessionText}>{copy.newSession}</Text>
            </Pressable>

            {loading ? <Text style={styles.feedback}>{copy.loading}</Text> : null}
            {!loading && error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && !error && sessions.length === 0 ? (
              <Text style={styles.feedback}>{copy.empty}</Text>
            ) : null}

            {!loading && sessions.length > 0 ? (
              <ScrollView
                contentContainerStyle={styles.sessionList}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                ref={sessionListRef}
                showsVerticalScrollIndicator={false}
                style={styles.sessionListViewport}
              >
                {sessions.map((session) => {
                  const selected = session.id === activeSessionId
                  const title = sessionTitle(session, language)
                  const actionsOpen = actionSessionId === session.id
                  const deleting = deletingSessionId === session.id
                  const renaming = renamingSessionId === session.id
                  const pending = pendingSessionIds.includes(session.id)
                  const pinned = Boolean(session.pinned_at)
                  return (
                    <View key={session.id} style={styles.sessionGroup}>
                      <View style={[styles.session, selected ? styles.sessionSelected : null]}>
                        <Pressable
                          accessibilityLabel={title}
                          accessibilityRole="button"
                          accessibilityState={{ busy: pending, selected }}
                          disabled={pending}
                          onPress={() => onSelect(session.id)}
                          style={({ pressed }) => [
                            styles.sessionMain,
                            pressed && !pending
                              ? (reduceMotion ? styles.pressedReduced : styles.pressed)
                              : null,
                          ]}
                          testID={`worker-v5-kael-session-${session.id}`}
                        >
                          <View style={[styles.statusDot, selected ? styles.statusDotSelected : null]} />
                          <View style={styles.sessionCopy}>
                            <View style={styles.sessionTitleRow}>
                              {pinned ? (
                                <View
                                  accessibilityLabel={copy.pinned}
                                  style={styles.pinnedIcon}
                                  testID={`worker-v5-kael-session-pinned-${session.id}`}
                                >
                                  <WorkerV5KaelSessionPinIcon filled />
                                </View>
                              ) : null}
                              <Text numberOfLines={1} style={styles.sessionTitle}>{title}</Text>
                            </View>
                            <Text numberOfLines={1} style={styles.sessionMeta}>
                              {sessionMeta(session, language, selected)}
                            </Text>
                          </View>
                          {selected ? <Text style={styles.check}>✓</Text> : null}
                        </Pressable>
                        <Pressable
                          accessibilityLabel={`${copy.more} ${title}`}
                          accessibilityRole="button"
                          accessibilityState={{ busy: pending, expanded: actionsOpen || deleting || renaming }}
                          hitSlop={6}
                          onPress={() => {
                            setRenamingSessionId(null)
                            setDeletingSessionId(null)
                            setActionSessionId(actionsOpen ? null : session.id)
                          }}
                          style={({ pressed }) => [
                            styles.moreButton,
                            actionsOpen ? styles.moreButtonOpen : null,
                            pressed && !pending ? styles.pressedReduced : null,
                          ]}
                          testID={`worker-v5-kael-session-actions-${session.id}`}
                        >
                          <WorkerV5KaelSessionMoreIcon />
                        </Pressable>
                      </View>

                      {actionsOpen ? (
                        <WorkerV5KaelSessionActionMenu
                          deleteLabel={copy.delete}
                          disabled={pending}
                          onDelete={() => {
                            setActionSessionId(null)
                            setDeletingSessionId(session.id)
                          }}
                          onPin={() => {
                            void onPin(session.id, !pinned)
                          }}
                          onRename={() => beginRename(session)}
                          pinLabel={pinned ? copy.unpin : copy.pin}
                          reduceMotion={reduceMotion}
                          renameLabel={copy.rename}
                          sessionId={session.id}
                        />
                      ) : null}

                      {deleting ? (
                        <WorkerV5KaelSessionDeleteConfirm
                          cancelLabel={copy.cancel}
                          confirmCopy={copy.deleteConfirm}
                          deleteLabel={copy.delete}
                          disabled={pending}
                          onCancel={() => setDeletingSessionId(null)}
                          onConfirm={() => {
                            setDeletingSessionId(null)
                            void onArchive(session.id)
                          }}
                          sessionId={session.id}
                        />
                      ) : null}

                      {renaming ? (
                        <View style={styles.renameEditor} testID={`worker-v5-kael-session-rename-editor-${session.id}`}>
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
                            testID="worker-v5-kael-session-title-input"
                            value={draftTitle}
                          />
                          <View style={styles.renameActions}>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => {
                                setRenamingSessionId(null)
                                setDraftTitle('')
                              }}
                              style={({ pressed }) => [styles.renameSecondary, pressed ? styles.pressedReduced : null]}
                            >
                              <Text style={styles.renameSecondaryText}>{copy.cancel}</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ disabled: draftTitle.trim().length === 0 }}
                              disabled={draftTitle.trim().length === 0}
                              onPress={saveRename}
                              style={({ pressed }) => [
                                styles.renamePrimary,
                                draftTitle.trim().length === 0 ? styles.disabled : null,
                                pressed ? styles.pressedReduced : null,
                              ]}
                              testID="worker-v5-kael-session-title-save"
                            >
                              <Text style={styles.renamePrimaryText}>{copy.save}</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  )
                })}
              </ScrollView>
            ) : null}
          </Animated.View>
        </View>
      </GlassSurface>
    </Animated.View>
  )
}

function WorkerV5KaelSessionDeleteConfirm({
  cancelLabel,
  confirmCopy,
  deleteLabel,
  disabled,
  onCancel,
  onConfirm,
  sessionId,
}: {
  cancelLabel: string
  confirmCopy: string
  deleteLabel: string
  disabled: boolean
  onCancel: () => void
  onConfirm: () => void
  sessionId: string
}) {
  return (
    <View
      accessibilityLabel={confirmCopy}
      accessibilityRole="alert"
      style={styles.deleteConfirm}
      testID={`worker-v5-kael-session-delete-confirm-${sessionId}`}
    >
      <Text numberOfLines={3} style={styles.deleteConfirmCopy}>{confirmCopy}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onCancel}
        style={({ pressed }) => [
          styles.deleteConfirmAction,
          disabled ? styles.disabled : null,
          pressed && !disabled ? styles.actionRowPressed : null,
        ]}
        testID={`worker-v5-kael-session-delete-cancel-${sessionId}`}
      >
        <Text style={styles.deleteConfirmCancelText}>{cancelLabel}</Text>
      </Pressable>
      <View style={styles.deleteConfirmDivider} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onConfirm}
        style={({ pressed }) => [
          styles.deleteConfirmAction,
          disabled ? styles.disabled : null,
          pressed && !disabled ? styles.deleteConfirmPressed : null,
        ]}
        testID={`worker-v5-kael-session-delete-submit-${sessionId}`}
      >
        <Text style={styles.deleteActionText}>{deleteLabel}</Text>
      </Pressable>
    </View>
  )
}

function WorkerV5KaelSessionActionMenu({
  deleteLabel,
  disabled,
  onDelete,
  onPin,
  onRename,
  pinLabel,
  reduceMotion,
  renameLabel,
  sessionId,
}: {
  deleteLabel: string
  disabled: boolean
  onDelete: () => void
  onPin: () => void
  onRename: () => void
  pinLabel: string
  reduceMotion: boolean
  renameLabel: string
  sessionId: string
}) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0)
  const translateY = useSharedValue(reduceMotion ? 0 : -3)
  const scale = useSharedValue(reduceMotion ? 1 : 0.98)

  useEffect(() => {
    opacity.value = withTiming(1, { duration: motionDuration(115, reduceMotion) })
    if (!reduceMotion) {
      translateY.value = withSpring(0, motionTokens.liquid.pill)
      scale.value = withSpring(1, motionTokens.liquid.press)
    }
  }, [opacity, reduceMotion, scale, translateY])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }))

  return (
    <Animated.View
      accessibilityRole="menu"
      style={[styles.actionMenu, animatedStyle]}
      testID={`worker-v5-kael-session-action-menu-${sessionId}`}
    >
      <ActionRow disabled={disabled} label={pinLabel} onPress={onPin} testID={`worker-v5-kael-session-pin-${sessionId}`} />
      <View style={styles.actionDivider} />
      <ActionRow disabled={disabled} label={renameLabel} onPress={onRename} testID={`worker-v5-kael-session-rename-${sessionId}`} />
      <View style={styles.actionDivider} />
      <ActionRow destructive disabled={disabled} label={deleteLabel} onPress={onDelete} testID={`worker-v5-kael-session-delete-${sessionId}`} />
    </Animated.View>
  )
}

function ActionRow({
  destructive = false,
  disabled = false,
  label,
  onPress,
  testID,
}: {
  destructive?: boolean
  disabled?: boolean
  label: string
  onPress: () => void
  testID: string
}) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.actionRowPressed : null,
      ]}
      testID={testID}
    >
      <Text style={destructive ? styles.deleteActionText : styles.actionText}>{label}</Text>
    </Pressable>
  )
}

function sessionMenuCopy(language: AppLanguage, mode: WorkerKaelChatMode) {
  const empty = mode === 'normal'
    ? (language === 'vi' ? 'Chưa có cuộc trò chuyện thường.' : 'There are no general conversations yet.')
    : (language === 'vi' ? 'Chưa có cuộc trò chuyện cho công việc này.' : 'There are no conversations for this job.')
  return language === 'vi'
    ? {
        accessibilityLabel: 'Các cuộc trò chuyện Kael',
        cancel: 'Hủy',
        delete: 'Xóa',
        deleteConfirm: 'Xóa khỏi danh sách? Nội dung vẫn được lưu bảo mật.',
        empty,
        loading: 'Đang tải cuộc trò chuyện...',
        more: 'Tùy chọn cho',
        newSession: 'Cuộc trò chuyện mới',
        pin: 'Ghim',
        pinned: 'Đã ghim',
        rename: 'Đổi tên',
        renamePlaceholder: 'Tên cuộc trò chuyện',
        save: 'Lưu',
        unpin: 'Bỏ ghim',
      }
    : {
        accessibilityLabel: 'Kael conversations',
        cancel: 'Cancel',
        delete: 'Delete',
        deleteConfirm: 'Remove from the list? Content remains securely retained.',
        empty,
        loading: 'Loading conversations...',
        more: 'Options for',
        newSession: 'New conversation',
        pin: 'Pin',
        pinned: 'Pinned',
        rename: 'Rename',
        renamePlaceholder: 'Conversation name',
        save: 'Save',
        unpin: 'Unpin',
      }
}

function sessionTitle(session: WorkerKaelChatSession, language: AppLanguage) {
  const title = session.title?.trim()
  if (title) return title
  if (session.status === 'closed') return language === 'vi' ? 'Cuộc trò chuyện đã đóng' : 'Closed conversation'
  if (session.status === 'escalated') return language === 'vi' ? 'Đã chuyển xử lý' : 'Escalated conversation'
  if (session.status === 'error') return language === 'vi' ? 'Cuộc trò chuyện cần kiểm tra' : 'Conversation needs attention'
  if (session.mode === 'normal') {
    return language === 'vi' ? 'Trò chuyện cùng Kael' : 'Chat with Kael'
  }
  return language === 'vi' ? 'Trao đổi về công việc' : 'Work conversation'
}

function sessionMeta(session: WorkerKaelChatSession, language: AppLanguage, selected: boolean) {
  const turns = session.total_turns
  const turnCopy = language === 'vi'
    ? `${turns} lượt trao đổi`
    : `${turns} ${turns === 1 ? 'turn' : 'turns'}`
  if (!selected) return turnCopy
  return language === 'vi' ? `Đang mở · ${turnCopy}` : `Open · ${turnCopy}`
}
