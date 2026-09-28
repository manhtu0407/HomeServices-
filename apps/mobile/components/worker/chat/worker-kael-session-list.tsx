import { useCallback, useRef, useState } from 'react'
import { FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native'
import type { WorkerKaelChatMode } from '@nestscout/shared'

import { LiquidSurfaceOverlay } from '@/components/ui/liquid-back-button'
import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerKaelChatSession } from '@/lib/api-types'

import { WorkerV5KaelSessionIcon } from './session-menu-icons'
import { styles } from './session-menu-styles'
import { type WorkerKaelSessionCopy, WorkerV5KaelSessionRow } from './worker-kael-session-row'

export type WorkerV5KaelSessionMenuProps = {
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

type WorkerV5KaelSessionListProps = WorkerV5KaelSessionMenuProps & {
  onRenameEditorOpenChange: (open: boolean) => void
}

export function WorkerV5KaelSessionList({
  activeSessionId,
  canCreate,
  error,
  language,
  loading,
  mode,
  onRenameEditorOpenChange,
  onArchive,
  onCreate,
  onPin,
  onRename,
  onSelect,
  pendingSessionIds,
  reduceMotion,
  reduceTransparency,
  sessions,
}: WorkerV5KaelSessionListProps) {
  const [actionSessionId, setActionSessionId] = useState<string | null>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const sessionListRef = useRef<FlatList<WorkerKaelChatSession>>(null)
  const { height: windowHeight } = useWindowDimensions()
  const copy = sessionMenuCopy(language, mode)

  const scrollToSession = useCallback((sessionId: string) => {
    const sessionIndex = sessions.findIndex((session) => session.id === sessionId)
    if (sessionIndex < 0) return
    sessionListRef.current?.scrollToOffset({ animated: !reduceMotion, offset: sessionIndex * 47 })
  }, [reduceMotion, sessions])
  const beginRename = useCallback((session: WorkerKaelChatSession) => {
    setActionSessionId(null)
    setDeletingSessionId(null)
    setRenamingSessionId(session.id)
    onRenameEditorOpenChange(true)
    setDraftTitle(sessionTitle(session, language))
    scrollToSession(session.id)
  }, [language, onRenameEditorOpenChange, scrollToSession])
  const openActions = useCallback((sessionId: string, open: boolean) => {
    setRenamingSessionId(null)
    setDeletingSessionId(null)
    onRenameEditorOpenChange(false)
    setActionSessionId(open ? null : sessionId)
    if (!open) scrollToSession(sessionId)
  }, [onRenameEditorOpenChange, scrollToSession])
  const beginDelete = useCallback((sessionId: string) => {
    setActionSessionId(null)
    setDeletingSessionId(sessionId)
    onRenameEditorOpenChange(false)
    scrollToSession(sessionId)
  }, [onRenameEditorOpenChange, scrollToSession])
  const cancelRename = useCallback(() => {
    setRenamingSessionId(null)
    setDraftTitle('')
    onRenameEditorOpenChange(false)
  }, [onRenameEditorOpenChange])
  const cancelDelete = useCallback(() => setDeletingSessionId(null), [])
  const saveRename = useCallback(() => {
    const sessionId = renamingSessionId
    const title = draftTitle.trim()
    if (!sessionId || title.length === 0 || title.length > 64 || pendingSessionIds.includes(sessionId)) return
    setRenamingSessionId(null)
    setDraftTitle('')
    onRenameEditorOpenChange(false)
    void onRename(sessionId, title)
  }, [draftTitle, onRename, onRenameEditorOpenChange, pendingSessionIds, renamingSessionId])
  const renderSession = useCallback(({ item: session }: { item: WorkerKaelChatSession }) => (
    <WorkerV5KaelSessionRow
      actionOpen={actionSessionId === session.id}
      copy={copy}
      deleting={deletingSessionId === session.id}
      draftTitle={draftTitle}
      meta={sessionMeta(session, language, session.id === activeSessionId)}
      onArchive={onArchive}
      onBeginDelete={beginDelete}
      onBeginRename={beginRename}
      onCancelDelete={cancelDelete}
      onCancelRename={cancelRename}
      onDraftTitleChange={setDraftTitle}
      onOpenActions={openActions}
      onPin={onPin}
      onSaveRename={saveRename}
      onSelect={onSelect}
      pending={pendingSessionIds.includes(session.id)}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
      renaming={renamingSessionId === session.id}
      selected={session.id === activeSessionId}
      session={session}
      title={sessionTitle(session, language)}
    />
  ), [
    actionSessionId,
    activeSessionId,
    beginDelete,
    beginRename,
    cancelDelete,
    cancelRename,
    copy,
    deletingSessionId,
    draftTitle,
    language,
    onArchive,
    onPin,
    onSelect,
    openActions,
    pendingSessionIds,
    reduceMotion,
    reduceTransparency,
    renamingSessionId,
    saveRename,
  ])

  return (
    <View accessibilityLabel={copy.accessibilityLabel} accessibilityRole="menu" style={styles.menuContent} testID="worker-v5-kael-session-menu">
      <Pressable
        accessibilityLabel={copy.newSession}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canCreate }}
        disabled={!canCreate}
        onPress={onCreate}
        style={({ pressed }) => [
          styles.newSession,
          {
            backgroundColor: reduceTransparency ? color.surface.raised : 'rgba(255,255,255,0.18)',
            borderColor: reduceTransparency ? color.surface.stroke : 'rgba(255,255,255,0.72)',
          },
          !reduceTransparency ? styles.newSessionLiquid : null,
          !canCreate && styles.disabled,
          pressed && canCreate ? (reduceMotion ? styles.pressedReduced : styles.newSessionPressed) : null,
        ]}
        testID="worker-v5-kael-session-new"
      >
        {!reduceTransparency ? (
          <LiquidSurfaceOverlay
            designHeight={44}
            mode="light"
            radius={22}
            testID="worker-v5-kael-session-new-liquid"
          />
        ) : null}
        <WorkerV5KaelSessionIcon kind="plus" size={21} testID="worker-v5-kael-session-new-plus" />
        <Text style={styles.newSessionText} testID="worker-v5-kael-session-new-label">{copy.newSession}</Text>
      </Pressable>

      {loading ? <Text style={styles.feedback}>{copy.loading}</Text> : null}
      {!loading && error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading && !error && sessions.length === 0 ? <Text style={styles.feedback}>{copy.empty}</Text> : null}

      {!loading && sessions.length > 0 ? (
        <FlatList
          contentContainerStyle={styles.sessionList}
          data={sessions}
          keyExtractor={(session) => session.id}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          ref={sessionListRef}
          renderItem={renderSession}
          showsVerticalScrollIndicator={false}
          style={[
            styles.sessionListViewport,
            renamingSessionId ? styles.sessionListViewportExpanded : null,
            renamingSessionId
              ? { maxHeight: Math.min(240, Math.max(120, windowHeight - 220)) }
              : null,
          ]}
          testID="worker-v5-kael-session-list"
        />
      ) : null}
    </View>
  )
}

function sessionMenuCopy(language: AppLanguage, mode: WorkerKaelChatMode): WorkerKaelSessionCopy & {
  accessibilityLabel: string
  empty: string
  loading: string
  newSession: string
} {
  const empty = mode === 'normal'
    ? (language === 'vi' ? 'Chưa có cuộc trò chuyện thường.' : 'There are no general conversations yet.')
    : (language === 'vi' ? 'Chưa có cuộc trò chuyện cho công việc này.' : 'There are no conversations for this job.')
  return language === 'vi'
    ? {
        accessibilityLabel: 'Các cuộc trò chuyện Kael', cancel: 'Hủy', delete: 'Xóa',
        deleteConfirm: 'Xóa khỏi danh sách? Nội dung vẫn được lưu bảo mật.', empty,
        loading: 'Đang tải cuộc trò chuyện...', more: 'Tùy chọn cho', newSession: 'Cuộc trò chuyện mới',
        pin: 'Ghim', pinned: 'Đã ghim', rename: 'Đổi tên', renamePlaceholder: 'Tên cuộc trò chuyện', save: 'Lưu', unpin: 'Bỏ ghim',
      }
    : {
        accessibilityLabel: 'Kael conversations', cancel: 'Cancel', delete: 'Delete',
        deleteConfirm: 'Remove from the list? Content remains securely retained.', empty,
        loading: 'Loading conversations...', more: 'Options for', newSession: 'New conversation',
        pin: 'Pin', pinned: 'Pinned', rename: 'Rename', renamePlaceholder: 'Conversation name', save: 'Save', unpin: 'Unpin',
      }
}

function sessionTitle(session: WorkerKaelChatSession, language: AppLanguage) {
  const title = session.title?.trim()
  if (title) return title
  if (session.status === 'closed') return language === 'vi' ? 'Cuộc trò chuyện đã đóng' : 'Closed conversation'
  if (session.status === 'escalated') return language === 'vi' ? 'Đã chuyển xử lý' : 'Escalated conversation'
  if (session.status === 'error') return language === 'vi' ? 'Cuộc trò chuyện cần kiểm tra' : 'Conversation needs attention'
  if (session.mode === 'normal') return language === 'vi' ? 'Trò chuyện cùng Kael' : 'Chat with Kael'
  return language === 'vi' ? 'Trao đổi về công việc' : 'Work conversation'
}

function sessionMeta(session: WorkerKaelChatSession, language: AppLanguage, selected: boolean) {
  const turns = session.total_turns
  const turnCopy = language === 'vi' ? `${turns} lượt trao đổi` : `${turns} ${turns === 1 ? 'turn' : 'turns'}`
  return selected ? (language === 'vi' ? `Đang mở · ${turnCopy}` : `Open · ${turnCopy}`) : turnCopy
}
