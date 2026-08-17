import { Pressable, Text, View } from 'react-native'

import { KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type { WorkerKaelChatSession } from '@/lib/api-types'

import { WorkerV5KaelSessionIcon } from './session-menu-icons'
import { styles } from './session-menu-styles'

export type WorkerKaelSessionCopy = {
  cancel: string
  delete: string
  deleteConfirm: string
  more: string
  pin: string
  pinned: string
  rename: string
  renamePlaceholder: string
  save: string
  unpin: string
}

export function WorkerV5KaelSessionRow({
  actionOpen,
  copy,
  deleting,
  draftTitle,
  onArchive,
  onBeginDelete,
  onBeginRename,
  onCancelDelete,
  onCancelRename,
  onDraftTitleChange,
  onOpenActions,
  onPin,
  onSaveRename,
  onSelect,
  pending,
  reduceMotion,
  reduceTransparency,
  renaming,
  selected,
  session,
  title,
  meta,
}: {
  actionOpen: boolean
  copy: WorkerKaelSessionCopy
  deleting: boolean
  draftTitle: string
  meta: string
  onArchive: (sessionId: string) => Promise<boolean>
  onBeginDelete: (sessionId: string) => void
  onBeginRename: (session: WorkerKaelChatSession) => void
  onCancelDelete: () => void
  onCancelRename: () => void
  onDraftTitleChange: (value: string) => void
  onOpenActions: (sessionId: string, open: boolean) => void
  onPin: (sessionId: string, pinned: boolean) => Promise<boolean>
  onSaveRename: () => void
  onSelect: (sessionId: string) => void
  pending: boolean
  reduceMotion: boolean
  reduceTransparency: boolean
  renaming: boolean
  selected: boolean
  session: WorkerKaelChatSession
  title: string
}) {
  const pinned = Boolean(session.pinned_at)
  return (
    <View style={styles.sessionGroup}>
      <View
        style={[
          styles.session,
          {
            backgroundColor: reduceTransparency
              ? color.surface.raised
              : selected ? color.surface.mint : color.surface.soft,
            borderColor: reduceTransparency
              ? (selected ? color.brand.primary : color.surface.stroke)
              : selected ? color.surface.strokeStrong : color.surface.stroke,
          },
        ]}
        testID={`worker-v5-kael-session-row-${session.id}`}
      >
        <Pressable
          accessibilityLabel={title}
          accessibilityRole="button"
          accessibilityState={{ busy: pending, selected }}
          disabled={pending}
          onPress={() => onSelect(session.id)}
          style={({ pressed }) => [styles.sessionMain, pressed && !pending ? (reduceMotion ? styles.pressedReduced : styles.pressed) : null]}
          testID={`worker-v5-kael-session-${session.id}`}
        >
          <View style={[styles.statusDot, selected ? styles.statusDotSelected : null]} />
          <View style={styles.sessionCopy}>
            <View style={styles.sessionTitleRow}>
              {pinned ? (
                <View accessibilityLabel={copy.pinned} style={styles.pinnedIcon} testID={`worker-v5-kael-session-pinned-${session.id}`}>
                  <WorkerV5KaelSessionIcon filled kind="pin" />
                </View>
              ) : null}
              <Text numberOfLines={1} style={styles.sessionTitle}>{title}</Text>
            </View>
            <Text numberOfLines={1} style={styles.sessionMeta}>{meta}</Text>
          </View>
          {selected ? <Text style={styles.check}>✓</Text> : null}
        </Pressable>
        <Pressable
          accessibilityLabel={`${copy.more} ${title}`}
          accessibilityRole="button"
          accessibilityState={{ busy: pending, expanded: actionOpen || deleting || renaming }}
          disabled={pending}
          hitSlop={6}
          onPress={() => onOpenActions(session.id, actionOpen)}
          style={({ pressed }) => [styles.moreButton, actionOpen ? styles.moreButtonOpen : null, pressed && !pending ? styles.pressedReduced : null]}
          testID={`worker-v5-kael-session-actions-${session.id}`}
        >
          <WorkerV5KaelSessionIcon kind="more" />
        </Pressable>
      </View>

      {actionOpen ? (
        <WorkerV5KaelSessionActionMenu
          deleteLabel={copy.delete}
          disabled={pending}
          onDelete={() => onBeginDelete(session.id)}
          onPin={() => void onPin(session.id, !pinned)}
          onRename={() => onBeginRename(session)}
          pinLabel={pinned ? copy.unpin : copy.pin}
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
          onCancel={onCancelDelete}
          onConfirm={() => {
            onCancelDelete()
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
            onChangeText={onDraftTitleChange}
            onSubmitEditing={onSaveRename}
            placeholder={copy.renamePlaceholder}
            returnKeyType="done"
            selectTextOnFocus
            style={styles.renameInput}
            testID="worker-v5-kael-session-title-input"
            value={draftTitle}
          />
          <View style={styles.renameActions}>
            <Pressable accessibilityRole="button" onPress={onCancelRename} style={({ pressed }) => [styles.renameSecondary, pressed ? styles.pressedReduced : null]}>
              <Text style={styles.renameSecondaryText}>{copy.cancel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: draftTitle.trim().length === 0 }}
              disabled={draftTitle.trim().length === 0}
              onPress={onSaveRename}
              style={({ pressed }) => [styles.renamePrimary, draftTitle.trim().length === 0 ? styles.disabled : null, pressed ? styles.pressedReduced : null]}
              testID="worker-v5-kael-session-title-save"
            >
              <Text style={styles.renamePrimaryText}>{copy.save}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
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
    <View accessibilityLabel={confirmCopy} accessibilityRole="alert" style={styles.deleteConfirm} testID={`worker-v5-kael-session-delete-confirm-${sessionId}`}>
      <Text numberOfLines={3} style={styles.deleteConfirmCopy}>{confirmCopy}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onCancel} style={({ pressed }) => [styles.deleteConfirmAction, disabled ? styles.disabled : null, pressed && !disabled ? styles.actionRowPressed : null]} testID={`worker-v5-kael-session-delete-cancel-${sessionId}`}>
        <Text style={styles.deleteConfirmCancelText}>{cancelLabel}</Text>
      </Pressable>
      <View style={styles.deleteConfirmDivider} />
      <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onConfirm} style={({ pressed }) => [styles.deleteConfirmAction, disabled ? styles.disabled : null, pressed && !disabled ? styles.deleteConfirmPressed : null]} testID={`worker-v5-kael-session-delete-submit-${sessionId}`}>
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
  renameLabel,
  sessionId,
}: {
  deleteLabel: string
  disabled: boolean
  onDelete: () => void
  onPin: () => void
  onRename: () => void
  pinLabel: string
  renameLabel: string
  sessionId: string
}) {
  return (
    <View accessibilityRole="menu" style={styles.actionMenu} testID={`worker-v5-kael-session-action-menu-${sessionId}`}>
      <ActionRow disabled={disabled} label={pinLabel} onPress={onPin} testID={`worker-v5-kael-session-pin-${sessionId}`} />
      <View style={styles.actionDivider} />
      <ActionRow disabled={disabled} label={renameLabel} onPress={onRename} testID={`worker-v5-kael-session-rename-${sessionId}`} />
      <View style={styles.actionDivider} />
      <ActionRow destructive disabled={disabled} label={deleteLabel} onPress={onDelete} testID={`worker-v5-kael-session-delete-${sessionId}`} />
    </View>
  )
}

function ActionRow({ destructive = false, disabled = false, label, onPress, testID }: {
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
      style={({ pressed }) => [styles.actionRow, disabled ? styles.disabled : null, pressed && !disabled ? styles.actionRowPressed : null]}
      testID={testID}
    >
      <Text style={destructive ? styles.deleteActionText : styles.actionText}>{label}</Text>
    </Pressable>
  )
}
