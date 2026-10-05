import { Platform, Pressable, Text, TextInput, View, type TextStyle } from 'react-native'

import { KaelSessionDeleteIcon, KaelSessionRenameCancelIcon, KaelSessionRenameSaveIcon } from '@/components/ui/kael-session-rename-icons'
import { LiquidControlButton } from '@/components/ui/liquid-back-button'
import { color } from '@/design/theme'
import type { WorkerKaelChatSession } from '@/lib/api-types'

import { WorkerV5KaelSessionIcon } from './session-menu-icons'
import { styles } from './session-menu-styles'

const inlineRenameInputWebStyle = Platform.select({
  web: {
    outlineColor: 'transparent',
    outlineOffset: 0,
    outlineStyle: 'none',
    outlineWidth: 0,
  } as unknown as TextStyle,
  default: null,
})

export type WorkerKaelSessionCopy = {
  cancel: string
  delete: string
  deleteConfirm: string
  deleteRowNote: string
  deleteRowTitle: string
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
  const saveDisabled = draftTitle.trim().length === 0 || pending
  const titleAndMeta = (
    <>
      <View style={[styles.statusDot, selected ? styles.statusDotSelected : null]} />
      <View
        style={styles.sessionCopy}
        testID={`worker-v5-kael-session-copy-${session.id}`}
      >
        <View style={styles.sessionTitleRow} testID={`worker-v5-kael-session-title-row-${session.id}`}>
          {pinned ? (
            <View accessibilityLabel={copy.pinned} style={styles.pinnedIcon} testID={`worker-v5-kael-session-pinned-${session.id}`}>
              <WorkerV5KaelSessionIcon filled kind="pin" />
            </View>
          ) : null}
          {renaming ? (
            <TextInput
              accessibilityLabel={copy.renamePlaceholder}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck={false}
              autoFocus
              editable={!pending}
              maxLength={64}
              numberOfLines={1}
              onChangeText={onDraftTitleChange}
              onSubmitEditing={onSaveRename}
              returnKeyType="done"
              selectionColor={color.brand.primary}
              style={[styles.sessionTitle, styles.sessionTitleInput, inlineRenameInputWebStyle]}
              testID="worker-v5-kael-session-title-input"
              underlineColorAndroid="transparent"
              value={draftTitle}
            />
          ) : (
            <Text numberOfLines={1} style={styles.sessionTitle}>{deleting ? copy.deleteRowTitle : title}</Text>
          )}
        </View>
        <Text numberOfLines={1} style={styles.sessionMeta}>{deleting ? copy.deleteRowNote : meta}</Text>
      </View>
      {!renaming && !deleting && selected ? <Text style={styles.check}>✓</Text> : null}
    </>
  )
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
        {renaming || deleting ? (
          <View style={styles.sessionMain} testID={`worker-v5-kael-session-${session.id}`}>
            {titleAndMeta}
          </View>
        ) : (
          <Pressable
            accessibilityLabel={title}
            accessibilityRole="button"
            accessibilityState={{ busy: pending, selected }}
            disabled={pending}
            onPress={() => onSelect(session.id)}
            style={({ pressed }) => [styles.sessionMain, pressed && !pending ? (reduceMotion ? styles.pressedReduced : styles.pressed) : null]}
            testID={`worker-v5-kael-session-${session.id}`}
          >
            {titleAndMeta}
          </Pressable>
        )}
        {renaming ? (
          // Cancel and Save take the place of the options button, so the row and the menu keep their size.
          <View style={styles.renameActions} testID={`worker-v5-kael-session-rename-actions-${session.id}`}>
            <LiquidControlButton accessibilityLabel={copy.cancel} onPress={onCancelRename} size={30} testID="worker-v5-kael-session-title-cancel">
              <KaelSessionRenameCancelIcon color={color.text.muted} />
            </LiquidControlButton>
            <LiquidControlButton accessibilityLabel={copy.save} disabled={saveDisabled} onPress={onSaveRename} size={30} testID="worker-v5-kael-session-title-save">
              <KaelSessionRenameSaveIcon color={color.brand.primary} />
            </LiquidControlButton>
          </View>
        ) : null}
        {deleting ? (
          // The confirmation replaces the row in place, like rename, so the menu keeps its size.
          <View accessibilityLabel={copy.deleteConfirm} accessibilityRole="alert" style={styles.renameActions} testID={`worker-v5-kael-session-delete-confirm-${session.id}`}>
            <LiquidControlButton accessibilityLabel={copy.cancel} disabled={pending} onPress={onCancelDelete} size={30} testID={`worker-v5-kael-session-delete-cancel-${session.id}`}>
              <KaelSessionRenameCancelIcon color={color.text.muted} />
            </LiquidControlButton>
            <LiquidControlButton
              accessibilityLabel={copy.delete}
              disabled={pending}
              onPress={() => {
                onCancelDelete()
                void onArchive(session.id)
              }}
              size={30}
              testID={`worker-v5-kael-session-delete-submit-${session.id}`}
            >
              <KaelSessionDeleteIcon color="#E5484D" />
            </LiquidControlButton>
          </View>
        ) : null}
        {!renaming && !deleting ? <Pressable
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
        </Pressable> : null}
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
