import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Text, View, type ListRenderItemInfo } from 'react-native'

import { GlassSurface } from '@/components/ui/glass-surface'
import { KaelSessionNewButton } from '@/components/ui/kael-session-new-button'

import { KaelLiquidReveal } from './kael-liquid-reveal'
import { CustomerKaelSessionRow, type CustomerKaelSessionCopy } from './customer-kael-session-row'
import { styles } from './kael-session-menu-styles'

import { customerV21ServiceCopy } from '../ui/copy'
import type { AppLanguage } from '@/lib/app-language'
import type { CustomerKaelConversationMode, CustomerKaelConversationSession } from '@/lib/api-types/customer'
import type { CustomerThemeTokens } from '../customer-theme'
import type { CustomerKaelSessionEphemeralSummary } from './customer-kael-ephemeral-state'

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
  sessionEphemeralStateById: Record<string, CustomerKaelSessionEphemeralSummary>
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
  sessionEphemeralStateById,
  sessions,
  tokens,
}: Props) {
  const [actionSessionId, setActionSessionId] = useState<string | null>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const listRef = useRef<FlatList<CustomerKaelConversationSession>>(null)
  const copy = sessionMenuCopy(language, mode)
  // The menu keeps one size whatever a row is doing; the row being edited is scrolled into view instead.
  const focusedSessionId = renamingSessionId ?? deletingSessionId ?? actionSessionId
  // A short list is locked at its resting height while a row shows actions or a confirmation, so
  // that content scrolls inside the list instead of growing the menu.
  const [restingListHeight, setRestingListHeight] = useState<number | null>(null)
  useEffect(() => {
    if (!focusedSessionId) return
    const index = sessions.findIndex((session) => session.id === focusedSessionId)
    if (index >= 0) listRef.current?.scrollToIndex({ animated: !reduceMotion, index, viewPosition: 0 })
  }, [focusedSessionId, reduceMotion, sessions])
  const clearDelete = useCallback(() => setDeletingSessionId(null), [])
  const clearRename = useCallback(() => {
    setRenamingSessionId(null)
    setDraftTitle('')
  }, [])
  const beginRename = useCallback((session: CustomerKaelConversationSession) => {
    setActionSessionId(null)
    setDeletingSessionId(null)
    setRenamingSessionId(session.id)
    setDraftTitle(sessionTitle(session, language, mode, sessionEphemeralStateById[session.id]))
  }, [language, mode, sessionEphemeralStateById])
  const beginDelete = useCallback((sessionId: string) => {
    setActionSessionId(null)
    setDeletingSessionId(sessionId)
  }, [])
  const toggleActions = useCallback((sessionId: string, open: boolean) => {
    setRenamingSessionId(null)
    setDeletingSessionId(null)
    setActionSessionId(open ? null : sessionId)
  }, [])
  const saveRename = useCallback(() => {
    const sessionId = renamingSessionId
    const title = draftTitle.trim()
    if (!sessionId || title.length === 0 || title.length > 64 || pendingSessionIds.includes(sessionId)) return
    setRenamingSessionId(null)
    setDraftTitle('')
    void onRename(sessionId, title)
  }, [draftTitle, onRename, pendingSessionIds, renamingSessionId])
  const renderSession = useCallback(({ item: session }: ListRenderItemInfo<CustomerKaelConversationSession>) => (
    <CustomerKaelSessionRow
      actionsOpen={actionSessionId === session.id}
      copy={copy}
      deleting={deletingSessionId === session.id}
      draftTitle={draftTitle}
      meta={sessionMeta(session, session.id === activeSessionId, language, sessionEphemeralStateById[session.id])}
      onArchive={onArchive}
      onBeginDelete={beginDelete}
      onBeginRename={beginRename}
      onCancelDelete={clearDelete}
      onCancelRename={clearRename}
      onDraftTitleChange={setDraftTitle}
      onPin={onPin}
      onSaveRename={saveRename}
      onSelect={onSelect}
      onToggleActions={toggleActions}
      pending={pendingSessionIds.includes(session.id)}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
      renaming={renamingSessionId === session.id}
      selected={session.id === activeSessionId}
      session={session}
      title={sessionTitle(session, language, mode, sessionEphemeralStateById[session.id])}
      tokens={tokens}
    />
  ), [
    actionSessionId,
    activeSessionId,
    beginDelete,
    beginRename,
    clearDelete,
    clearRename,
    copy,
    deletingSessionId,
    draftTitle,
    language,
    mode,
    onArchive,
    onPin,
    onSelect,
    pendingSessionIds,
    reduceMotion,
    reduceTransparency,
    renamingSessionId,
    saveRename,
    sessionEphemeralStateById,
    tokens,
    toggleActions,
  ])
  const keyExtractor = useCallback((session: CustomerKaelConversationSession) => session.id, [])

  return (
    <KaelLiquidReveal
      reduceMotion={reduceMotion}
      style={styles.menuPosition}
      testID="customer-v21-kael-session-menu-shell"
    >
      {/* Denser than the header glass: the menu sits over the conversation, which must not read through it. */}
      <GlassSurface
        backgroundColor={reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.88)' : 'rgba(255,255,255,0.86)'}
        borderColor={reduceTransparency ? tokens.border : tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.72)'}
        material="liquid"
        mode={tokens.mode}
        showEdgeHighlight={false}
        style={styles.menuGlass}
        testID="customer-v21-kael-session-menu-glass"
        variant="sheet"
      >
        <View
          accessibilityLabel={copy.accessibilityLabel}
          accessibilityRole="menu"
          style={styles.menuContent}
          testID="customer-v21-kael-session-menu"
        >
          <KaelSessionNewButton
            accentColor={tokens.primary}
            disabled={!canCreate}
            label={copy.newSession}
            mode={tokens.mode}
            onPress={onCreate}
            opaqueBackgroundColor={tokens.raised}
            opaqueBorderColor={tokens.border}
            testIDPrefix="customer-v21-kael"
          />
          {loading ? <Text style={[styles.feedback, { color: tokens.muted }]}>{copy.loading}</Text> : null}
          {!loading && error ? <Text style={styles.error}>{error}</Text> : null}
          {!loading && !error && sessions.length === 0 ? <Text style={[styles.feedback, { color: tokens.muted }]}>{copy.empty}</Text> : null}
          {!loading && sessions.length > 0 ? (
            <FlatList
              contentContainerStyle={styles.sessionList}
              onScrollToIndexFailed={({ averageItemLength, index }) => {
                listRef.current?.scrollToOffset({ animated: false, offset: averageItemLength * index })
              }}
              ref={listRef}
              data={sessions}
              keyExtractor={keyExtractor}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              renderItem={renderSession}
              showsVerticalScrollIndicator={false}
              onLayout={(event) => {
                if (!focusedSessionId) setRestingListHeight(event.nativeEvent.layout.height)
              }}
              style={[styles.sessionListViewport, focusedSessionId && restingListHeight ? { height: restingListHeight } : null]}
              testID="customer-v21-kael-session-list"
            />
          ) : null}
        </View>
      </GlassSurface>
    </KaelLiquidReveal>
  )
}

function sessionTitle(
  session: CustomerKaelConversationSession,
  language: AppLanguage,
  mode: CustomerKaelConversationMode,
  ephemeral?: CustomerKaelSessionEphemeralSummary,
) {
  if (session.title?.trim()) return session.title.trim()
  if (ephemeral?.localPreview) {
    const prefix = language === 'vi' ? 'Bản nháp' : 'Draft'
    return `${prefix} · ${truncateSessionPreview(ephemeral.localPreview)}`
  }
  if (ephemeral?.hasUnsentDraft) return language === 'vi' ? 'Bản nháp chưa gửi' : 'Unsent draft'
  const serviceLabel = sessionServiceLabel(session, language)
  if (serviceLabel) return serviceLabel
  if (language === 'en') return mode === 'normal' ? 'Normal chat' : 'Work handling'
  return mode === 'normal' ? 'Chat thường' : 'Xử lý công việc'
}

function sessionMeta(
  session: CustomerKaelConversationSession,
  selected: boolean,
  language: AppLanguage,
  ephemeral?: CustomerKaelSessionEphemeralSummary,
) {
  const totalTurns = Math.max(session.total_turns, ephemeral?.localTurnCount ?? 0)
  const turns = language === 'vi' ? `${totalTurns} lượt trao đổi` : `${totalTurns} turns`
  const serviceLabel = session.title?.trim() ? sessionServiceLabel(session, language) : null
  const provisional = ephemeral?.localTurnCount
    ? (language === 'vi' ? 'Bản nháp' : 'Draft')
    : ephemeral?.hasUnsentDraft
      ? (language === 'vi' ? 'Chưa gửi' : 'Unsent')
      : null
  const detail = [provisional, serviceLabel, turns].filter(Boolean).join(' · ')
  return selected ? `${language === 'vi' ? 'Đang mở' : 'Open'} · ${detail}` : detail
}

function truncateSessionPreview(value: string) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  return normalized.length > 34 ? `${normalized.slice(0, 33)}…` : normalized
}

function sessionServiceLabel(session: CustomerKaelConversationSession, language: AppLanguage) {
  const serviceType = session.service_type
  if (!serviceType) return null
  return customerV21ServiceCopy[language][serviceType]?.label ?? null
}

function sessionMenuCopy(language: AppLanguage, mode: CustomerKaelConversationMode): CustomerKaelSessionCopy & {
  accessibilityLabel: string
  empty: string
  loading: string
  newSession: string
} {
  const serviceMode = mode === 'case'
  if (language === 'en') {
    return {
      accessibilityLabel: serviceMode ? 'Work handling sessions' : 'Normal chat sessions',
      cancel: 'Cancel', delete: 'Delete', deleteCaseAction: 'Cancel and delete',
      deleteCaseConfirm: 'Kael is handling this work. Continuing will cancel the linked process and delete this conversation.',
      deleteConfirm: 'Remove this conversation from the list?',
      deleteRowCaseNote: 'Kael is handling this work', deleteRowCaseTitle: 'Cancel & delete?',
      deleteRowNote: 'Removes it from your list', deleteRowTitle: 'Delete chat?', empty: 'No conversations yet.',
      loading: 'Loading conversations...', more: 'Options for', newSession: 'New conversation',
      pin: 'Pin', rename: 'Rename', renamePlaceholder: 'Conversation name', save: 'Save', unpin: 'Unpin',
    }
  }
  return {
    accessibilityLabel: serviceMode ? 'Các phiên Xử lý công việc' : 'Các phiên Chat thường',
    cancel: 'Hủy', delete: 'Xóa', deleteCaseAction: 'Hủy và xóa',
    deleteCaseConfirm: 'Kael đang xử lý công việc này. Tiếp tục sẽ hủy quy trình liên kết và xóa cuộc trò chuyện.',
    deleteConfirm: 'Xóa cuộc trò chuyện này khỏi danh sách?',
    deleteRowCaseNote: 'Kael đang xử lý công việc này', deleteRowCaseTitle: 'Hủy việc, xóa?',
    deleteRowNote: 'Gỡ khỏi danh sách phiên', deleteRowTitle: 'Xóa phiên?', empty: 'Chưa có cuộc trò chuyện.',
    loading: 'Đang tải cuộc trò chuyện...', more: 'Tùy chọn cho', newSession: 'Cuộc trò chuyện mới',
    pin: 'Ghim', rename: 'Đổi tên', renamePlaceholder: 'Tên cuộc trò chuyện', save: 'Lưu', unpin: 'Bỏ ghim',
  }
}
