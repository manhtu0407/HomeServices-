import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'

import { pillarWhy, withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { color, customerTheme } from '@/design/theme'

import { WorkerV5KaelOrbComposer } from '../chat/orb-screen-surfaces'
import { canShowWorkerStaticNormalChatStarters } from '../chat/kael-orb-chat-model'

export const PILLAR = {
  id: 'P298-worker-kael-composer-layout',
  invariant: 'Worker Kael Chat matches the Customer composer border, camera-to-input spacing, and send-arrow state colors, accepts multiline input that on native grows with its text up to its bound with scrolling always on and Return inserting a line, on web grows to its measured draft height and scrolls only after the bound, and returns to one line after a successful send; an empty normal-chat screen keeps its static starter rail visible without leading plus glyphs even when dynamic suggestions are unavailable',
  authority: ['governance/protocols/frontend-test.md G3 and G4', 'React Native TextInput multiline contract'],
  target: 'apps/mobile/components/worker/chat/orb-screen-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P205-kael-composer-and-failure-boundary', 'P296-worker-kael-stop-response'],
  mutation: 'change the Customer-matched border or send-arrow colors, widen the camera-to-input gap or input padding, remove multiline, restore numberOfLines=1, pin a measured height on native, make native Return send, stop measuring content height on web, remove the maximum-height scroll state, fail to reset height after send, add leading plus glyphs to the Worker starter rail, or hide the empty normal-chat starter rail when dynamic suggestions are unavailable; a rendered composer or starter eligibility assertion turns red',
} as const satisfies PillarManifest

// withPillarContext is synchronous, so an async body passed to it would run detached and its
// later assertions would never fail the test; async cases await their body here instead.
async function withPillarContextAsync(run: () => Promise<void>, detail?: string) {
  try {
    await run()
  } catch (error) {
    if (error instanceof Error) error.message = `${pillarWhy(PILLAR, detail)}\n\n${error.message}`
    throw error
  }
}

describe('Worker Kael composer layout', () => {
  it('lets the native field grow with its text up to the cap, scroll past it, and insert a line on Return', () => {
    withPillarContext(PILLAR, () => {
      render(
        <WorkerV5KaelOrbComposer
          busy={false}
          initialDraft=""
          language="vi"
          mediaCount={0}
          mode="normal"
          onPickMedia={() => undefined}
          onSend={async () => true}
          reduceMotion
          reduceTransparency={false}
        />,
      )
      const input = screen.getByTestId('worker-v5-kael-orb-input')
      fireEvent.changeText(input, 'Mô tả dài cần hiển thị hết khi xuống dòng trong ô chat.')
      const typed = screen.getByTestId('worker-v5-kael-orb-input')
      expect(typed).toHaveStyle({ maxHeight: 124, minHeight: 44 })
      expect(StyleSheet.flatten(typed.props.style).height).toBeUndefined()
      expect(typed.props.scrollEnabled).toBe(true)
      expect(typed.props.submitBehavior).toBe('newline')
      expect(typed.props.returnKeyType).toBe('default')
    }, 'a pinned native height never grew on iOS and pushed earlier lines out of view (Build 51)')
  })

  it('shows wrapped draft lines on web and scrolls only after the composer reaches its cap', async () => {
    const onSend = jest.fn(async () => true)
    const platform = jest.replaceProperty(Platform, 'OS', 'web')

    try {
      await withPillarContextAsync(async () => {
        render(
          <WorkerV5KaelOrbComposer
            busy={false}
            initialDraft=""
            language="vi"
            mediaCount={0}
            mode="normal"
            onPickMedia={() => undefined}
            onSend={onSend}
            reduceMotion
            reduceTransparency={false}
          />,
        )

        const composerFrame = screen.getByTestId('worker-v5-kael-orb-composer-frame')
        expect(composerFrame).toHaveStyle({ borderColor: customerTheme.lightLayer.glassBorder, gap: 4 })
        const sendArrowStrokes = () => screen.getByTestId('worker-v5-kael-orb-send-arrow')
          .findAll((node) => typeof node.props.stroke === 'string')
          .map((node) => node.props.stroke)
        expect(sendArrowStrokes()).toContain('#071A24')
        const input = screen.getByTestId('worker-v5-kael-orb-input')
        expect(input).toHaveStyle({ paddingHorizontal: 4 })
        expect(input.props.multiline).toBe(true)
        expect(input.props.numberOfLines).toBeUndefined()
        expect(input).toHaveStyle({ height: 44 })

        fireEvent.changeText(input, 'Mô tả dài cần hiển thị hết khi xuống dòng trong ô chat.')
        expect(sendArrowStrokes()).toContain('#071A24')
        fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 88, width: 300 } } })
        expect(screen.getByTestId('worker-v5-kael-orb-input')).toHaveStyle({ height: 88 })
        expect(screen.getByTestId('worker-v5-kael-orb-input').props.scrollEnabled).toBe(false)

        fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), '')
        expect(screen.getByTestId('worker-v5-kael-orb-input')).toHaveStyle({ height: 44 })

        fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Mô tả dài cần hiển thị hết khi xuống dòng trong ô chat.')
        expect(screen.getByTestId('worker-v5-kael-orb-input')).toHaveStyle({ height: 44 })

        fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { height: 400, width: 300 } } })
        expect(screen.getByTestId('worker-v5-kael-orb-input')).toHaveStyle({ height: 124 })
        expect(screen.getByTestId('worker-v5-kael-orb-input').props.scrollEnabled).toBe(true)

        await act(async () => {
          fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))
          await Promise.resolve()
        })
        expect(onSend).toHaveBeenCalledWith('Mô tả dài cần hiển thị hết khi xuống dòng trong ô chat.')
        await waitFor(() => expect(screen.getByTestId('worker-v5-kael-orb-input')).toHaveStyle({ height: 44 }))
      }, 'Worker Chat must keep the full multiline draft visible, then restore the compact field after send')
    } finally {
      platform.restore()
    }
  })

  it('keeps intake composer styling outside normal-chat Customer parity', async () => {
    await withPillarContextAsync(async () => {
      render(
        <WorkerV5KaelOrbComposer
          busy={false}
          initialDraft=""
          language="vi"
          mediaCount={0}
          mode="intake"
          onPickMedia={() => undefined}
          onSend={async () => true}
          reduceMotion
          reduceTransparency={false}
        />,
      )

      expect(screen.getByTestId('worker-v5-kael-orb-composer-frame')).toHaveStyle({
        borderColor: color.surface.stroke,
        gap: 10,
      })
      expect(screen.getByTestId('worker-v5-kael-orb-input')).toHaveStyle({ paddingHorizontal: 10 })
      const intakeArrowStrokes = screen.getByTestId('worker-v5-kael-orb-send-arrow')
        .findAll((node) => typeof node.props.stroke === 'string')
        .map((node) => node.props.stroke)
      expect(intakeArrowStrokes).toContain(color.text.muted)
    }, 'Worker intake keeps its existing composer frame styling')
  })

  it('allows an image-only normal-chat turn but keeps text-only empty turns disabled', async () => {
    const onSend = jest.fn(async () => true)

    await withPillarContextAsync(async () => {
      render(
        <WorkerV5KaelOrbComposer
          busy={false}
          initialDraft=""
          language="vi"
          mediaEnabled
          mediaCount={1}
          mode="normal"
          onPickMedia={() => undefined}
          onSend={onSend}
          reduceMotion
          reduceTransparency={false}
        />,
      )

      expect(screen.getByTestId('worker-v5-kael-orb-send')).toBeEnabled()
      await act(async () => {
        fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))
        await Promise.resolve()
      })
      expect(onSend).toHaveBeenCalledWith('')
    }, 'an attached photo is a complete Worker normal-chat turn without typed text')
  })

  it('shows the horizontal suggestion rail and only fills the draft when a card is chosen', async () => {
    const onSend = jest.fn(async () => true)

    await withPillarContextAsync(async () => {
      render(
        <WorkerV5KaelOrbComposer
          busy={false}
          initialDraft=""
          language="vi"
          mediaCount={0}
          mode="normal"
          normalChatStarterAllowed={canShowWorkerStaticNormalChatStarters('normal', 0)}
          onPickMedia={() => undefined}
          onSend={onSend}
          reduceMotion
          reduceTransparency={false}
        />,
      )

      const rail = screen.getByTestId('normal-chat-starter-section')
      expect(rail.props).toMatchObject({ horizontal: true, showsHorizontalScrollIndicator: false })
      expect(rail.props.contentContainerStyle).toMatchObject({ flexDirection: 'row', gap: 8 })
      expect(screen.queryByText('+')).toBeNull()
      expect(screen.queryByText('Chọn một gợi ý hoặc chạm camera để thêm ảnh.')).toBeNull()
      fireEvent.press(screen.getByTestId('normal-chat-starter-describe-a-fault'))
      expect(screen.getByTestId('worker-v5-kael-orb-input').props.value)
        .toBe('Hướng dẫn tôi mô tả lỗi đang kiểm tra để bạn hỗ trợ rõ hơn.')
      expect(onSend).not.toHaveBeenCalled()

      await act(async () => {
        fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))
        await Promise.resolve()
      })
      expect(onSend).toHaveBeenCalledWith('Hướng dẫn tôi mô tả lỗi đang kiểm tra để bạn hỗ trợ rõ hơn.')
    }, 'Worker suggestions swipe horizontally, hide their scrollbar and never send a selected starter implicitly')
  })

  it('keeps static starters available without dynamic suggestions and hides them after a turn or in intake', async () => {
    await withPillarContextAsync(async () => {
      expect(canShowWorkerStaticNormalChatStarters('normal', 0)).toBe(true)
      expect(canShowWorkerStaticNormalChatStarters('normal', 1)).toBe(false)
      expect(canShowWorkerStaticNormalChatStarters('intake', 0)).toBe(false)

      render(
        <WorkerV5KaelOrbComposer
          busy={false}
          initialDraft=""
          language="vi"
          mediaCount={0}
          mode="normal"
          normalChatStarterAllowed={canShowWorkerStaticNormalChatStarters('normal', 0)}
          normalChatSuggestions={[]}
          onPickMedia={() => undefined}
          onSend={async () => true}
          reduceMotion
          reduceTransparency={false}
        />,
      )

      expect(screen.getByTestId('normal-chat-starter-section')).toBeTruthy()
    }, 'static role-aware starters remain available in the empty normal composer while model suggestions are unavailable')
  })

  it('uses the exact normal-chat idle send colors and the inverse while waiting for Kael', async () => {
    await withPillarContextAsync(async () => {
      const idle = render(
        <WorkerV5KaelOrbComposer
          busy={false}
          initialDraft=""
          language="vi"
          mediaCount={0}
          mode="normal"
          onPickMedia={() => undefined}
          onSend={async () => true}
          reduceMotion
          reduceTransparency={false}
        />,
      )
      expect(screen.getByTestId('worker-v5-kael-orb-send')).toHaveStyle({ backgroundColor: '#F2FAF9' })
      expect(screen.getByTestId('worker-v5-kael-orb-send-arrow')
        .findAll((node) => typeof node.props.stroke === 'string')
        .map((node) => node.props.stroke)).toContain('#071A24')
      idle.unmount()

      render(
        <WorkerV5KaelOrbComposer
          busy
          initialDraft=""
          language="vi"
          mediaCount={0}
          mode="normal"
          onPickMedia={() => undefined}
          onSend={async () => true}
          onStop={() => undefined}
          reduceMotion
          reduceTransparency={false}
          sending
          stopAvailable
        />,
      )
      expect(screen.getByTestId('worker-v5-kael-orb-send')).toHaveStyle({ backgroundColor: '#071A24' })
      expect(screen.getByTestId('worker-v5-kael-orb-stop-square')).toHaveStyle({ backgroundColor: '#F2FAF9' })
    }, 'the disabled idle control keeps the normal palette, and an active reply inverts its colors')
  })

  it('keeps an unaccepted Worker ghost suffix out of the sent text and adds it only on tap', async () => {
    const onSend = jest.fn(async () => false)

    await withPillarContextAsync(async () => {
      render(
        <WorkerV5KaelOrbComposer
          busy={false}
          initialDraft="Hướng dẫn"
          language="vi"
          mediaCount={0}
          mode="normal"
          normalChatSuggestions={[{ id: 'follow-up-2', text: 'Hướng dẫn tôi mô tả lỗi rõ hơn.' }]}
          onPickMedia={() => undefined}
          onSend={onSend}
          reduceMotion
          reduceTransparency={false}
        />,
      )

      const input = screen.getByTestId('worker-v5-kael-orb-input')
      fireEvent(input, 'selectionChange', {
        nativeEvent: { selection: { start: input.props.value.length, end: input.props.value.length } },
      })
      const ghost = screen.getByTestId('normal-chat-ghost-accept')
      expect(ghost.props.accessibilityLabel).toContain('Thêm phần gợi ý')
      expect(input.props.value).toBe('Hướng dẫn')
      await act(async () => {
        fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))
        await Promise.resolve()
      })
      expect(onSend).toHaveBeenNthCalledWith(1, 'Hướng dẫn')

      fireEvent.press(ghost)
      expect(screen.getByTestId('worker-v5-kael-orb-input').props.value)
        .toBe('Hướng dẫn tôi mô tả lỗi rõ hơn.')
      expect(onSend).toHaveBeenCalledTimes(1)
      await act(async () => {
        fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))
        await Promise.resolve()
      })
      expect(onSend).toHaveBeenNthCalledWith(2, 'Hướng dẫn tôi mô tả lỗi rõ hơn.')
    }, 'the Worker composer sends only typed text until the user accepts the suggested suffix')
  })
})
