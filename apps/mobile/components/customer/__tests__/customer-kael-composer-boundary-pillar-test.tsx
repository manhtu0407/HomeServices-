import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { color } from '@/design/theme'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'

import { getCustomerThemeTokens } from '../customer-theme'
import { KaelChatComposer, type RootChatStyles } from '../kael-chat/kael-chat-composer'
import { customerV21ChatStyles as chatStyles, customerV21KaelChatRootStyles } from '../kael-chat/chat-styles'
import { canSubmitCustomerKaelComposer } from '../kael-chat/customer-kael-composer-state'
import { customerKaelInlineError } from '../kael-chat/customer-kael-error-display'
import { MediaDraftPreviewTray } from '../kael-chat/media-draft-preview-tray'
import {
  CUSTOMER_KAEL_MESSAGE_MAX_LENGTH,
  customerKaelMessageLengthError,
} from '../kael-chat/customer-kael-message-limits'
import { preAgenticUnsupportedService } from '../kael-chat/customer-kael-pre-agentic-copy'

export const PILLAR = {
  id: 'P205-kael-composer-and-failure-boundary',
  invariant: 'Kael never submits an empty composer, never sends a message beyond the shared 5000-character boundary, keeps text close to the camera, aligns the normal-chat camera glyph with the placeholder, leaves multiline input uncapped by one native line, lets the native field grow with its text up to its cap with scrolling on and Return inserting a line, on web resets the text field after a draft is cleared and keeps its measured height across same-size edits, previews normal-chat images without filenames and with accessible X removal controls, allows image analysis while keeping video in Work handling, renders a 27px dark-toned media icon in a 44px touch target, uses a pale liquid-glass send and stop surface with accessible themed controls, offers Stop only when the busy request can be cancelled, and renders one user-facing failure copy',
  authority: ['governance/RULES.md #3, #6, and #7', 'governance/protocols/frontend-test.md G3 and G4'],
  target: 'apps/mobile/components/customer/kael-chat/kael-chat-composer.tsx',
  layer: 'unit',
  siblings: ['P104-kael-ephemeral-state-scope', 'P75-transaction-critical-route-coverage'],
  mutation: 'allow whitespace submission, lower the UI boundary without the contract constant, restore numberOfLines=1 on the multiline field, pin a measured height on native, make native Return send, widen spacing between the camera and text field, leave the normal-chat camera glyph below the placeholder, retain stale input height after the parent clears a draft, collapse a measured multi-line draft on an edit that keeps its line count, render normal-chat filenames instead of in-composer thumbnails with X controls, disable normal-chat image picking, enlarge the composer media icon past 27px, color the enabled camera teal instead of matching the dark send glyph, replace the pale light-theme send surface with a saturated fill or low-contrast icon, restore the thick stop ring, disable the busy stop action, show Stop for a busy request that cannot be cancelled, render an inline failure beside the receipt, or mix VI and EN decline copy; an assertion fails',
} as const satisfies PillarManifest

const rootStyles: RootChatStyles = {
  bodyText: {},
  composer: {},
  composerInput: {},
  composerTextFieldShell: {},
  composerTextFieldStack: {},
  errorText: {},
  flex: {},
  sendButton: {},
}

// Web inputs do not grow on their own, so the measured-height path is web-only.
function onWeb(run: () => void) {
  const platform = jest.replaceProperty(Platform, 'OS', 'web')
  try {
    run()
  } finally {
    platform.restore()
  }
}

function renderComposer(
  mode: 'light' | 'dark',
  canUseComposerMedia = true,
  composerBusy = false,
  onStopMessage = () => undefined,
  allowVideoSelection = true,
  composerMediaDrafts: LocalMediaUploadDraft[] = [],
  onRemoveComposerMediaDraft = () => undefined,
  stopAvailable = true,
  overrides: {
    composerSending?: boolean
    draft?: string
    normalChatStarterVisible?: boolean
    normalChatSuggestions?: { id: string; text: string }[]
    onDraftChange?: (value: string) => void
    onSendMessage?: () => void
  } = {},
) {
  const props = {
    allowVideoSelection,
    canUseComposerMedia,
    composerBusy,
    composerSending: overrides.composerSending,
    composerMediaDraftCount: composerMediaDrafts.length,
    composerMediaDrafts,
    composerPlaceholder: 'Nhập tin nhắn cho Kael...',
    draft: overrides.draft ?? 'Xin chào Kael',
    hasVoiceTranscript: false,
    language: 'vi' as const,
    onBlur: () => undefined,
    onDraftChange: overrides.onDraftChange ?? (() => undefined),
    onFocus: () => undefined,
    onPickMedia: () => undefined,
    onRemoveComposerMediaDraft,
    onSendMessage: overrides.onSendMessage ?? (() => undefined),
    onStopMessage,
    normalChatStarterVisible: overrides.normalChatStarterVisible,
    normalChatSuggestions: overrides.normalChatSuggestions,
    rootStyles,
    stopAvailable,
    textInputNoOutlineStyle: {},
    tokens: getCustomerThemeTokens(mode),
  }
  const view = render(<KaelChatComposer {...props} />)
  return Object.assign(view, {
    rerenderDraft: (draft: string) => view.rerender(<KaelChatComposer {...props} draft={draft} />),
  })
}

describe('Kael composer and failure boundary', () => {
  it('exposes a usable stop action instead of a busy spinner', () => {
    withPillarContext(PILLAR, () => {
      const onStopMessage = jest.fn()
      renderComposer('light', false, true, onStopMessage)
      const stopButton = screen.getByTestId('customer-v21-kael-send')

      expect(stopButton).toHaveProp('accessibilityLabel', 'Dừng phản hồi')
      expect(stopButton).toHaveProp('accessibilityState', { busy: true, disabled: false })
      expect(stopButton).toHaveStyle({ backgroundColor: color.mint.white, borderColor: color.surface.stroke })
      fireEvent.press(stopButton)
      expect(onStopMessage).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('customer-v21-kael-stop-square')).toHaveStyle({
        backgroundColor: color.text.strong,
        height: 12,
        width: 12,
      })
    })
  })

  it('shows a disabled working state instead of Stop when the busy request cannot be cancelled', () => {
    withPillarContext(PILLAR, () => {
      const onStopMessage = jest.fn()
      renderComposer('light', false, true, onStopMessage, true, [], () => undefined, false)
      const button = screen.getByTestId('customer-v21-kael-send')

      expect(button).toHaveProp('accessibilityLabel', 'Kael đang xử lý')
      expect(button).toHaveProp('accessibilityState', { busy: true, disabled: true })
      expect(screen.queryByTestId('customer-v21-kael-stop-square')).toBeNull()
      fireEvent.press(button)
      expect(onStopMessage).not.toHaveBeenCalled()
    }, 'Work handling has no cancellable request, so Stop must not claim to cancel it')
  })

  it('allows normal-chat image analysis and uses a 27px camera within a 44px touch target', () => {
    withPillarContext(PILLAR, () => {
      const normalComposer = renderComposer('light', true, false, undefined, false)
      expect(screen.getByTestId('customer-v21-kael-media-picker')).toHaveProp('accessibilityState', { disabled: false })
      expect(screen.getByTestId('customer-v21-kael-media-picker')).toHaveProp('accessibilityLabel', 'Thêm ảnh')
      expect(screen.getByTestId('customer-v21-kael-media-picker')).toHaveStyle({ height: 44, width: 44 })
      const normalCameraIcon = normalComposer.UNSAFE_getByProps({ testID: 'customer-v21-kael-media-camera-icon' })
      expect(normalCameraIcon.props).toMatchObject({
        color: color.text.strong,
        size: 27,
        style: chatStyles.chatMediaIconOpticallyAligned,
      })
      normalComposer.unmount()

      const workComposer = renderComposer('light', true, false, undefined, true)
      expect(screen.getByTestId('customer-v21-kael-media-picker')).toHaveProp('accessibilityState', { disabled: false })
      expect(screen.getByTestId('customer-v21-kael-media-picker')).toHaveProp('accessibilityLabel', 'Thêm ảnh hoặc video')
      expect(screen.getByTestId('customer-v21-kael-media-picker')).toHaveStyle({ height: 44, width: 44 })
      const workCameraIcon = workComposer.UNSAFE_getByProps({ testID: 'customer-v21-kael-media-camera-icon' })
      expect(workCameraIcon.props).toMatchObject({
        color: color.text.strong,
        size: 27,
      })
      expect(workCameraIcon.props.style).toBeUndefined()
    })
  })

  it('keeps the text field close to the camera while preserving its one-line width', () => {
    withPillarContext(PILLAR, () => {
      expect(customerV21KaelChatRootStyles.composer).toEqual(expect.objectContaining({
        gap: 4,
      }))
      expect(customerV21KaelChatRootStyles.composerInput).toEqual(expect.objectContaining({
        paddingHorizontal: 4,
      }))
    })
  })

  it('does not cap the native multiline composer at one line', () => {
    withPillarContext(PILLAR, () => {
      const composer = renderComposer('light')
      const input = screen.getByTestId('customer-v21-kael-input')

      expect(input.props.multiline).toBe(true)
      expect(input.props.numberOfLines).toBeUndefined()
      composer.unmount()
    }, 'wrapped Customer text must remain visible on iOS New Architecture')
  })

  it('lets the native field grow with its text up to the cap, scroll past it, and insert a line on Return', () => {
    withPillarContext(PILLAR, () => {
      const composer = renderComposer('light')
      const input = screen.getByTestId('customer-v21-kael-input')

      expect(input).toHaveStyle({ maxHeight: 124, minHeight: 44 })
      expect(StyleSheet.flatten(input.props.style).height).toBeUndefined()
      expect(input.props.scrollEnabled).toBe(true)
      expect(input.props.submitBehavior).toBe('newline')
      expect(input.props.returnKeyType).toBe('default')
      composer.unmount()
    }, 'a pinned native height never grew on iOS and pushed earlier lines out of view (Build 51)')
  })

  it('resets measured input height on web when the parent clears the draft', () => onWeb(() => {
    withPillarContext(PILLAR, () => {
      const composer = renderComposer('light')
      const input = screen.getByTestId('customer-v21-kael-input')

      fireEvent(input, 'contentSizeChange', {
        nativeEvent: { contentSize: { height: 96, width: 300 } },
      })
      expect(input).toHaveStyle({ height: 96 })

      composer.rerenderDraft('')
      expect(input).toHaveStyle({ height: 44 })

      composer.rerenderDraft('New draft')
      expect(input).toHaveStyle({ height: 44 })
    }, 'clearing a sent draft must not leave the next message in a stale tall input')
  }))

  it('keeps the web measured height while an edit leaves the line count unchanged', () => onWeb(() => {
    withPillarContext(PILLAR, () => {
      const composer = renderComposer('light')
      const input = screen.getByTestId('customer-v21-kael-input')

      fireEvent(input, 'contentSizeChange', {
        nativeEvent: { contentSize: { height: 64, width: 300 } },
      })
      expect(input).toHaveStyle({ height: 64 })

      composer.rerenderDraft('Xin chào Kael!')
      expect(input).toHaveStyle({ height: 64 })
    }, 'a two-line draft must not collapse to one line and scroll its first line out of view')
  }))

  it('keeps a web measurement that arrives before a restored draft renders', () => onWeb(() => {
    withPillarContext(PILLAR, () => {
      const composer = renderComposer('light')
      const input = screen.getByTestId('customer-v21-kael-input')

      composer.rerenderDraft('')
      fireEvent(input, 'contentSizeChange', {
        nativeEvent: { contentSize: { height: 64, width: 300 } },
      })
      composer.rerenderDraft('Xin chào Kael, máy lạnh nhà tôi chảy nước')
      expect(input).toHaveStyle({ height: 64 })
    }, 'web measures a restored draft before the parent renders it; that height must not be discarded')
  }))

  it('shows normal-chat image thumbnails inside the composer with X removal and no filename text', () => {
    withPillarContext(PILLAR, () => {
      const onRemoveComposerMediaDraft = jest.fn()
      renderComposer('light', true, false, undefined, false, [
        { fileName: 'private-repair-photo.png', type: 'image', uri: 'file:///photo-1.png' },
        { fileName: 'second-private-photo.png', type: 'image', uri: 'file:///photo-2.png' },
      ], onRemoveComposerMediaDraft)

      expect(screen.getByTestId('customer-v21-kael-composer-frame')).toBeTruthy()
      expect(screen.getByTestId('customer-kael-composer-image-rail')).toBeTruthy()
      expect(screen.getByTestId('customer-kael-composer-image-0')).toBeTruthy()
      expect(screen.getByTestId('customer-kael-composer-image-1')).toBeTruthy()
      expect(screen.queryByText('private-repair-photo.png')).toBeNull()
      expect(screen.queryByText('second-private-photo.png')).toBeNull()
      expect(screen.queryByText('Remove')).toBeNull()
      expect(screen.queryByTestId('customer-v21-kael-media-count')).toBeNull()
      expect(screen.getByTestId('customer-v21-kael-composer-frame')).toHaveStyle({ flexDirection: 'column' })
      expect(screen.getByTestId('customer-kael-media-draft-remove-1')).toHaveProp(
        'accessibilityLabel',
        'Xóa ảnh đã chọn',
      )

      fireEvent.press(screen.getByTestId('customer-kael-media-draft-remove-1'))
      expect(onRemoveComposerMediaDraft).toHaveBeenCalledWith(1)
    })
  })

  it('keeps the Work handling file tray copy and remove control', () => {
    const onRemove = jest.fn()
    render(
      <MediaDraftPreviewTray
        busy={false}
        drafts={[{ fileName: 'inspection-video.mp4', type: 'video', uri: 'file:///inspection-video.mp4' }]}
        language="vi"
        onRemove={onRemove}
        tokens={getCustomerThemeTokens('light')}
      />,
    )

    expect(screen.getByText('inspection-video.mp4')).toBeTruthy()
    expect(screen.getByText('Bỏ')).toBeTruthy()
    fireEvent.press(screen.getByTestId('customer-kael-media-draft-remove-0'))
    expect(onRemove).toHaveBeenCalledWith(0)
  })

  it('uses mint send colors in light and dark themes', () => {
    withPillarContext(PILLAR, () => {
      const lightComposer = renderComposer('light')
      expect(screen.getByTestId('customer-v21-kael-send')).toHaveStyle({
        backgroundColor: color.mint.white,
        borderColor: color.surface.stroke,
      })
      expect(lightComposer.UNSAFE_getByProps({ testID: 'customer-v21-kael-send-arrow' })
        .findAll((node) => typeof node.props.stroke === 'string')
        .map((node) => node.props.stroke)).toContain(color.text.strong)
      lightComposer.unmount()

      const darkTokens = getCustomerThemeTokens('dark')
      const darkComposer = renderComposer('dark')
      expect(screen.getByTestId('customer-v21-kael-send')).toHaveStyle({
        backgroundColor: darkTokens.primary,
        borderColor: darkTokens.borderStrong,
      })
      expect(darkComposer.UNSAFE_getByProps({ testID: 'customer-v21-kael-send-arrow' })
        .findAll((node) => typeof node.props.stroke === 'string')
        .map((node) => node.props.stroke)).toContain(darkTokens.primaryText)
    })
  })

  it('uses the confirmed normal-chat idle palette and its inverse while sending', () => {
    withPillarContext(PILLAR, () => {
      const idle = renderComposer('light', true, false, undefined, false, [], undefined, true, {
        draft: 'Xin chào',
        composerSending: false,
      })
      expect(screen.getByTestId('customer-v21-kael-send')).toHaveStyle({ backgroundColor: '#F2FAF9' })
      expect(idle.UNSAFE_getByProps({ testID: 'customer-v21-kael-send-arrow' })
        .findAll((node) => typeof node.props.stroke === 'string')
        .map((node) => node.props.stroke)).toContain('#071A24')
      idle.unmount()

      const sending = renderComposer('light', true, true, () => undefined, false, [], undefined, true, {
        draft: 'Xin chào',
        composerSending: true,
      })
      expect(screen.getByTestId('customer-v21-kael-send')).toHaveStyle({ backgroundColor: '#071A24' })
      expect(sending.UNSAFE_getByProps({ testID: 'customer-v21-kael-stop-square' }).props.style)
        .toEqual(expect.objectContaining({ backgroundColor: '#F2FAF9' }))
      sending.unmount()

      const darkTokens = getCustomerThemeTokens('dark')
      const dark = renderComposer('dark', true, false, undefined, false, [], undefined, true, {
        draft: 'Xin chào',
        composerSending: true,
      })
      expect(screen.getByTestId('customer-v21-kael-send')).toHaveStyle({ backgroundColor: darkTokens.primary })
      expect(dark.UNSAFE_getByProps({ testID: 'customer-v21-kael-send-arrow' })
        .findAll((node) => typeof node.props.stroke === 'string')
        .map((node) => node.props.stroke)).toContain(darkTokens.primaryText)
    }, 'normal-chat colors are exact in light mode while dark mode continues using its existing theme')
  })

  it('loads a starter into the editable draft without sending it', () => {
    const onSendMessage = jest.fn()
    function ControlledCustomerComposer() {
      const [draft, setDraft] = useState('')
      return (
        <KaelChatComposer
          allowVideoSelection={false}
          canUseComposerMedia
          composerBusy={false}
          composerMediaDraftCount={0}
          composerMediaDrafts={[]}
          composerPlaceholder="Nhập tin nhắn cho Kael..."
          draft={draft}
          hasVoiceTranscript={false}
          language="vi"
          onBlur={() => undefined}
          onDraftChange={setDraft}
          onFocus={() => undefined}
          onPickMedia={() => undefined}
          onRemoveComposerMediaDraft={() => undefined}
          onSendMessage={onSendMessage}
          onStopMessage={() => undefined}
          normalChatStarterVisible={!draft}
          rootStyles={rootStyles}
          textInputNoOutlineStyle={{}}
          tokens={getCustomerThemeTokens('light')}
        />
      )
    }

    withPillarContext(PILLAR, () => {
      render(<ControlledCustomerComposer />)
      expect(screen.queryByText('Chọn một gợi ý hoặc chạm camera để thêm ảnh.')).toBeNull()
      fireEvent.press(screen.getByTestId('normal-chat-starter-what-can-kael-do'))
      expect(screen.getByTestId('customer-v21-kael-input').props.value).toBe('Kael có thể giúp tôi những gì?')
      expect(onSendMessage).not.toHaveBeenCalled()
      fireEvent.press(screen.getByTestId('customer-v21-kael-send'))
      expect(onSendMessage).toHaveBeenCalledTimes(1)
    }, 'choosing a starter edits the real Customer composer draft and never sends by itself')
  })

  it('keeps ghost text outside the Customer draft until accepted', () => {
    const onSendMessage = jest.fn()
    function ControlledCustomerComposer() {
      const [draft, setDraft] = useState('Hướng dẫn')
      return (
        <KaelChatComposer
          allowVideoSelection={false}
          canUseComposerMedia
          composerBusy={false}
          composerMediaDraftCount={0}
          composerMediaDrafts={[]}
          composerPlaceholder="Nhập tin nhắn cho Kael..."
          draft={draft}
          hasVoiceTranscript={false}
          language="vi"
          onBlur={() => undefined}
          onDraftChange={setDraft}
          onFocus={() => undefined}
          onPickMedia={() => undefined}
          onRemoveComposerMediaDraft={() => undefined}
          onSendMessage={() => onSendMessage(draft)}
          onStopMessage={() => undefined}
          normalChatSuggestions={[{ id: 'follow-up-1', text: 'Hướng dẫn tôi mô tả vấn đề rõ hơn.' }]}
          rootStyles={rootStyles}
          textInputNoOutlineStyle={{}}
          tokens={getCustomerThemeTokens('light')}
        />
      )
    }

    withPillarContext(PILLAR, () => {
      render(<ControlledCustomerComposer />)
      const input = screen.getByTestId('customer-v21-kael-input')
      fireEvent(input, 'selectionChange', {
        nativeEvent: { selection: { start: input.props.value.length, end: input.props.value.length } },
      })
      const ghost = screen.getByTestId('normal-chat-ghost-accept')
      expect(ghost.props.accessibilityLabel).toContain('Thêm phần gợi ý')
      expect(ghost.props.accessibilityHint).toContain('Thêm phần gợi ý')
      expect(input.props.value).toBe('Hướng dẫn')
      fireEvent.press(screen.getByTestId('customer-v21-kael-send'))
      expect(onSendMessage).toHaveBeenCalledWith('Hướng dẫn')

      fireEvent.press(ghost)
      expect(screen.getByTestId('customer-v21-kael-input').props.value)
        .toBe('Hướng dẫn tôi mô tả vấn đề rõ hơn.')
    }, 'typing shows a Vietnamese accessible ghost suffix, sending ignores it, and tapping accepts it once into the real draft')
  })

  it('only enables send for meaningful content and keeps the shared length limit', () => {
    withPillarContext(PILLAR, () => {
      expect(canSubmitCustomerKaelComposer({ busy: false, draft: '   ', mediaDraftCount: 0, voiceTranscript: '' })).toBe(false)
      expect(canSubmitCustomerKaelComposer({ busy: false, draft: 'Hello Kael', mediaDraftCount: 0, voiceTranscript: '' })).toBe(true)
      expect(canSubmitCustomerKaelComposer({ busy: false, draft: '', mediaDraftCount: 1, voiceTranscript: '' })).toBe(true)
      expect(canSubmitCustomerKaelComposer({ busy: true, draft: 'Hello Kael', mediaDraftCount: 0, voiceTranscript: '' })).toBe(false)
      expect(CUSTOMER_KAEL_MESSAGE_MAX_LENGTH).toBe(5_000)
      expect(customerKaelMessageLengthError('A'.repeat(5_000), 'vi')).toBeNull()
      expect(customerKaelMessageLengthError('A'.repeat(5_001), 'vi')).toContain('5000')
      expect(customerKaelMessageLengthError('A'.repeat(5_001), 'en')).toContain('5000')
    })
  })

  it('uses the reasoning receipt as the single normal-mode failure surface', () => {
    withPillarContext(PILLAR, () => {
      expect(customerKaelInlineError('Kael is unavailable. Try again.', 'normal', 'failed')).toBeNull()
      expect(customerKaelInlineError('Kael is unavailable. Try again.', 'normal', 'idle')).toBe('Kael is unavailable. Try again.')
      expect(customerKaelInlineError('Media requires a real job.', 'case', 'failed')).toBe('Media requires a real job.')
    })
  })

  it('declines unsupported service scope without leaking the selected language', () => {
    const expectedVietnamese = 'Yêu cầu này hiện chưa thuộc phạm vi NestScout. NestScout đang hỗ trợ sửa điện, sửa nước, vệ sinh nhà cửa, điều hòa và không khí, sofa/nệm/rèm/thảm, cùng sửa vặt và lắp đặt nhỏ.'
    const vietnamese = preAgenticUnsupportedService('vi')
    const english = preAgenticUnsupportedService('en')
    withPillarContext(PILLAR, () => {
      expect(vietnamese).toBe(expectedVietnamese)
      expect(vietnamese).not.toContain('“')
      expect(english).toContain('outside NestScout')
      expect(english).not.toContain('Yêu cầu')
    })
  })
})
