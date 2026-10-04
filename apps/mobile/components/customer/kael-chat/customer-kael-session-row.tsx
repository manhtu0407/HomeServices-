import { Platform, Text, TextInput, View, type TextStyle } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

import { color } from '@/design/theme'
import type { CustomerKaelConversationSession } from '@/lib/api-types/customer'

import type { CustomerThemeTokens } from '../customer-theme'
import { KaelLiquidPressable } from './kael-liquid-pressable'
import { KaelLiquidReveal } from './kael-liquid-reveal'
import { styles } from './kael-session-menu-styles'

const inlineRenameInputWebStyle = Platform.select({
  web: {
    outlineColor: 'transparent',
    outlineOffset: 0,
    outlineStyle: 'none',
    outlineWidth: 0,
  } as unknown as TextStyle,
  default: null,
})

export type CustomerKaelSessionCopy = {
  cancel: string
  delete: string
  deleteCaseAction: string
  deleteCaseConfirm: string
  deleteConfirm: string
  more: string
  pin: string
  rename: string
  renamePlaceholder: string
  save: string
  unpin: string
}

export function CustomerKaelSessionRow({
  actionsOpen,
  copy,
  deleting,
  draftTitle,
  onArchive,
  onBeginDelete,
  onBeginRename,
  onCancelDelete,
  onCancelRename,
  onDraftTitleChange,
  onPin,
  onSaveRename,
  onSelect,
  onToggleActions,
  pending,
  reduceMotion,
  reduceTransparency,
  renaming,
  selected,
  session,
  title,
  meta,
  tokens,
}: {
  actionsOpen: boolean
  copy: CustomerKaelSessionCopy
  deleting: boolean
  draftTitle: string
  meta: string
  onArchive: (sessionId: string) => Promise<boolean>
  onBeginDelete: (sessionId: string) => void
  onBeginRename: (session: CustomerKaelConversationSession) => void
  onCancelDelete: () => void
  onCancelRename: () => void
  onDraftTitleChange: (value: string) => void
  onPin: (sessionId: string, pinned: boolean) => Promise<boolean>
  onSaveRename: () => void
  onSelect: (sessionId: string) => void
  onToggleActions: (sessionId: string, open: boolean) => void
  pending: boolean
  reduceMotion: boolean
  reduceTransparency: boolean
  renaming: boolean
  selected: boolean
  session: CustomerKaelConversationSession
  title: string
  tokens: CustomerThemeTokens
}) {
  const pinned = Boolean(session.pinned_at)
  const linkedCaseWork = Boolean(session.case_session_id)
  const titleAndMeta = (
    <>
      <View style={[styles.statusDot, selected ? { backgroundColor: tokens.primary } : null]} />
      <View
        style={[styles.sessionCopy, renaming ? styles.sessionCopyRenaming : null]}
        testID={`customer-v21-kael-session-copy-${session.id}`}
      >
        <View style={styles.sessionTitleRow} testID={`customer-v21-kael-session-title-row-${session.id}`}>
          {pinned ? <SessionPinIcon color={tokens.primary} /> : null}
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
              selectionColor={tokens.primary}
              style={[styles.sessionTitle, styles.sessionTitleInput, inlineRenameInputWebStyle, { color: tokens.text }]}
              testID="customer-v21-kael-session-title-input"
              underlineColorAndroid="transparent"
              value={draftTitle}
            />
          ) : (
            <Text numberOfLines={1} style={[styles.sessionTitle, { color: tokens.text }]}>{title}</Text>
          )}
        </View>
        <Text numberOfLines={1} style={[styles.sessionMeta, { color: tokens.muted }]}>{meta}</Text>
      </View>
      {renaming ? (
        <View style={styles.inlineRenameActions} testID={`customer-v21-kael-session-rename-actions-${session.id}`}>
          <KaelLiquidPressable
            accessibilityLabel={copy.cancel}
            accessibilityRole="button"
            onPress={onCancelRename}
            reduceMotion={reduceMotion}
            style={styles.inlineRenameCancel}
            testID="customer-v21-kael-session-title-cancel"
          >
            <Text style={[styles.inlineRenameCancelText, { color: tokens.muted }]}>{copy.cancel}</Text>
          </KaelLiquidPressable>
          <KaelLiquidPressable
            accessibilityLabel={copy.save}
            accessibilityRole="button"
            accessibilityState={{ disabled: draftTitle.trim().length === 0 || pending }}
            disabled={draftTitle.trim().length === 0 || pending}
            onPress={onSaveRename}
            reduceMotion={reduceMotion}
            style={[styles.inlineRenameSave, { backgroundColor: tokens.primary }, draftTitle.trim().length === 0 || pending ? styles.disabled : null]}
            testID="customer-v21-kael-session-title-save"
          >
            <Text style={styles.inlineRenameSaveText}>{copy.save}</Text>
          </KaelLiquidPressable>
        </View>
      ) : null}
      {!renaming && selected ? <Text style={[styles.check, { color: tokens.primary }]}>✓</Text> : null}
    </>
  )
  return (
    <View style={styles.sessionGroup}>
      <View
        style={[
          styles.session,
          {
            backgroundColor: reduceTransparency
              ? tokens.raised
              : selected
                ? tokens.mode === 'dark' ? tokens.service : color.surface.mint
                : tokens.mode === 'dark' ? tokens.glass : color.surface.soft,
            borderColor: reduceTransparency
              ? selected ? tokens.primary : tokens.border
              : selected
                ? tokens.mode === 'dark' ? tokens.borderStrong : color.surface.strokeStrong
                : tokens.mode === 'dark' ? tokens.border : color.surface.stroke,
          },
        ]}
        testID={`customer-v21-kael-session-row-${session.id}`}
      >
        {renaming ? (
          <View style={styles.sessionMain} testID={`customer-v21-kael-session-${session.id}`}>
            {titleAndMeta}
          </View>
        ) : (
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
            {titleAndMeta}
          </KaelLiquidPressable>
        )}
        {!renaming ? <KaelLiquidPressable
          accessibilityLabel={`${copy.more} ${title}`}
          accessibilityRole="button"
          accessibilityState={{ busy: pending, expanded: actionsOpen || deleting || renaming }}
          disabled={pending}
          hitSlop={6}
          onPress={() => onToggleActions(session.id, actionsOpen)}
          reduceMotion={reduceMotion}
          selected={actionsOpen || deleting || renaming}
          style={[styles.moreButton, actionsOpen ? styles.moreButtonOpen : null]}
          testID={`customer-v21-kael-session-actions-${session.id}`}
        >
          <SessionMoreIcon color={tokens.primary} />
        </KaelLiquidPressable> : null}
      </View>

      {actionsOpen ? (
        <KaelLiquidReveal reduceMotion={reduceMotion} style={[styles.actionMenu, { borderColor: tokens.border }]} testID={`customer-v21-kael-session-action-menu-${session.id}`}>
          <ActionButton disabled={pending} label={pinned ? copy.unpin : copy.pin} onPress={() => void onPin(session.id, !pinned)} reduceMotion={reduceMotion} testID={`customer-v21-kael-session-pin-${session.id}`} textColor={tokens.text} />
          <ActionButton disabled={pending} label={copy.rename} onPress={() => onBeginRename(session)} reduceMotion={reduceMotion} testID={`customer-v21-kael-session-rename-${session.id}`} textColor={tokens.text} />
          <ActionButton destructive disabled={pending} label={copy.delete} onPress={() => onBeginDelete(session.id)} reduceMotion={reduceMotion} testID={`customer-v21-kael-session-delete-${session.id}`} textColor="#E5484D" />
        </KaelLiquidReveal>
      ) : null}

      {deleting ? (
        <KaelLiquidReveal
          accessibilityLabel={linkedCaseWork ? copy.deleteCaseConfirm : copy.deleteConfirm}
          accessibilityRole="alert"
          reduceMotion={reduceMotion}
          style={[styles.deleteConfirm, linkedCaseWork ? styles.linkedCaseDeleteConfirm : null, { borderColor: tokens.border }]}
          testID={`customer-v21-kael-session-delete-confirm-${session.id}`}
        >
          <Text numberOfLines={linkedCaseWork ? 4 : 2} style={[styles.deleteConfirmCopy, { color: tokens.text }]}>{linkedCaseWork ? copy.deleteCaseConfirm : copy.deleteConfirm}</Text>
          <KaelLiquidPressable accessibilityRole="button" onPress={onCancelDelete} reduceMotion={reduceMotion} style={styles.confirmAction}>
            <Text style={[styles.confirmCancel, { color: tokens.muted }]}>{copy.cancel}</Text>
          </KaelLiquidPressable>
          <KaelLiquidPressable
            accessibilityLabel={linkedCaseWork ? copy.deleteCaseAction : copy.delete}
            accessibilityRole="button"
            disabled={pending}
            onPress={() => {
              onCancelDelete()
              void onArchive(session.id)
            }}
            reduceMotion={reduceMotion}
            style={[styles.confirmAction, pending ? styles.disabled : null]}
            testID={`customer-v21-kael-session-delete-confirm-action-${session.id}`}
          >
            <Text numberOfLines={2} style={styles.confirmDelete}>{linkedCaseWork ? copy.deleteCaseAction : copy.delete}</Text>
          </KaelLiquidPressable>
        </KaelLiquidReveal>
      ) : null}

    </View>
  )
}

function ActionButton({ destructive = false, disabled, label, onPress, reduceMotion, testID, textColor }: {
  destructive?: boolean
  disabled: boolean
  label: string
  onPress: () => void
  reduceMotion: boolean
  testID: string
  textColor: string
}) {
  return (
    <KaelLiquidPressable accessibilityRole="menuitem" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} reduceMotion={reduceMotion} style={[styles.actionButton, disabled ? styles.disabled : null]} testID={testID}>
      <Text style={[styles.actionText, { color: destructive ? '#E5484D' : textColor }]}>{label}</Text>
    </KaelLiquidPressable>
  )
}

function SessionMoreIcon({ color }: { color: string }) {
  return <Svg height={18} viewBox="0 0 24 24" width={18}><Circle cx={12} cy={5.5} fill={color} r={1.2} /><Circle cx={12} cy={12} fill={color} r={1.2} /><Circle cx={12} cy={18.5} fill={color} r={1.2} /></Svg>
}

function SessionPinIcon({ color }: { color: string }) {
  return <Svg height={13} viewBox="0 0 24 24" width={13}><Path d="M8.2 4.5h7.6l-1.25 5.2L17 12.15v1.35H7v-1.35L9.45 9.7 8.2 4.5ZM12 13.5v6" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} /></Svg>
}
