import { useCallback, useState } from 'react'
import { FlatList, Text, View, type ListRenderItemInfo } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { KaelLiquidPressable } from './kael-liquid-pressable'
import { KaelLiquidReveal } from './kael-liquid-reveal'
import { CustomerKaelSessionRow, type CustomerKaelSessionCopy } from './customer-kael-session-row'
import { styles } from './kael-session-menu-styles'

import { SourceCardSkin } from '../ui/aura-surfaces'
import { customerV21ServiceCopy } from '../ui/copy'
import type { AppLanguage } from '@/lib/app-language'
import type { CustomerKaelConversationMode, CustomerKaelConversationSession } from '@/lib/api-types/customer'
import type { CustomerThemeTokens } from '../customer-theme'

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
  const copy = sessionMenuCopy(language, mode)
  const clearDelete = useCallback(() => setDeletingSessionId(null), [])
  const clearRename = useCallback(() => {
    setRenamingSessionId(null)
    setDraftTitle('')
  }, [])
  const beginRename = useCallback((session: CustomerKaelConversationSession) => {
    setActionSessionId(null)
    setDeletingSessionId(null)
    setRenamingSessionId(session.id)
    setDraftTitle(sessionTitle(session, language, mode))
  }, [language, mode])
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
      meta={sessionMeta(session, session.id === activeSessionId, language)}
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
      renaming={renamingSessionId === session.id}
      selected={session.id === activeSessionId}
      session={session}
      title={sessionTitle(session, language, mode)}
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
    renamingSessionId,
    saveRename,
    tokens,
    toggleActions,
  ])
  const keyExtractor = useCallback((session: CustomerKaelConversationSession) => session.id, [])

  return (
    <KaelLiquidReveal reduceMotion={reduceMotion} style={styles.menuPosition} testID="customer-v21-kael-session-menu-shell">
      <View
        accessibilityLabel={copy.accessibilityLabel}
        accessibilityRole="menu"
        style={[styles.menu, { backgroundColor: reduceTransparency ? tokens.raised : 'rgba(250,255,253,0.92)', borderColor: tokens.border }]}
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
          style={[styles.newSession, { borderColor: tokens.border }, !canCreate ? styles.disabled : null]}
          testID="customer-v21-kael-session-new"
        >
          <SessionPlusIcon color={tokens.primary} />
          <Text testID="customer-v21-kael-session-new-label" style={[styles.newSessionText, { color: tokens.primary }]}>{copy.newSession}</Text>
        </KaelLiquidPressable>
        {loading ? <Text style={[styles.feedback, { color: tokens.muted }]}>{copy.loading}</Text> : null}
        {!loading && error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !error && sessions.length === 0 ? <Text style={[styles.feedback, { color: tokens.muted }]}>{copy.empty}</Text> : null}
        {!loading && sessions.length > 0 ? (
          <FlatList
            contentContainerStyle={styles.sessionList}
            data={sessions}
            keyExtractor={keyExtractor}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            renderItem={renderSession}
            showsVerticalScrollIndicator={false}
            style={styles.sessionListViewport}
            testID="customer-v21-kael-session-list"
          />
        ) : null}
      </View>
    </KaelLiquidReveal>
  )
}

function SessionPlusIcon({ color }: { color: string }) {
  return <Svg height={21} testID="customer-v21-kael-session-new-plus" viewBox="0 0 24 24" width={21}><Path d="M12 5.5v13M5.5 12h13" fill="none" stroke={color} strokeLinecap="round" strokeWidth={2} /></Svg>
}

function sessionTitle(session: CustomerKaelConversationSession, language: AppLanguage, mode: CustomerKaelConversationMode) {
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
      deleteConfirm: 'Remove this conversation from the list?', empty: 'No conversations yet.',
      loading: 'Loading conversations...', more: 'Options for', newSession: 'New conversation',
      pin: 'Pin', rename: 'Rename', renamePlaceholder: 'Conversation name', save: 'Save', unpin: 'Unpin',
    }
  }
  return {
    accessibilityLabel: serviceMode ? 'Các phiên Xử lý công việc' : 'Các phiên Chat thường',
    cancel: 'Hủy', delete: 'Xóa', deleteCaseAction: 'Hủy và xóa',
    deleteCaseConfirm: 'Kael đang xử lý công việc này. Tiếp tục sẽ hủy quy trình liên kết và xóa cuộc trò chuyện.',
    deleteConfirm: 'Xóa cuộc trò chuyện này khỏi danh sách?', empty: 'Chưa có cuộc trò chuyện.',
    loading: 'Đang tải cuộc trò chuyện...', more: 'Tùy chọn cho', newSession: 'Cuộc trò chuyện mới',
    pin: 'Ghim', rename: 'Đổi tên', renamePlaceholder: 'Tên cuộc trò chuyện', save: 'Lưu', unpin: 'Bỏ ghim',
  }
}
