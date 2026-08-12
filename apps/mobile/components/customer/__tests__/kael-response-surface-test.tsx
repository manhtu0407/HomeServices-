import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'

import { customerTheme } from '@/design/theme'
import {
  initialKaelResponseStreamState,
  kaelResponseStreamReducer,
} from '@/lib/kael-response-stream'

import { isChatNearBottom } from '../kael-chat/kael-chat-scroll'
import { KaelChatTranscript } from '../kael-chat/kael-chat-transcript'
import { KaelResponseSurface } from '../kael-chat/kael-response-surface'

describe('Kael response surface', () => {
  it('reveals the active block without a synthetic streaming caret and settles cleanly', () => {
    const onPresentationSettled = jest.fn()
    const started = kaelResponseStreamReducer(initialKaelResponseStreamState, {
      mode: 'fast',
      responseId: 'turn-1',
      type: 'response.started',
    })
    const withBlock = kaelResponseStreamReducer(started, {
      blockId: 'turn-1:block:0',
      kind: 'paragraph',
      type: 'block.started',
    })
    const streaming = kaelResponseStreamReducer(withBlock, {
      blockId: 'turn-1:block:0',
      delta: 'Kael dang phan hoi',
      type: 'block.text.delta',
    })
    const view = render(
      <KaelResponseSurface
        language="vi"
        onPresentationSettled={onPresentationSettled}
        reduceMotion
        state={streaming}
        testID="response"
        tokens={customerTheme.lightLayer}
      />,
    )

    expect(screen.getByTestId('customer-v21-kael-response-block-0'))
      .toHaveTextContent('Kael dang phan hoi')
    expect(screen.getByTestId('customer-v21-kael-response-block-0'))
      .not.toHaveTextContent('\u258d')
    expect(screen.getByTestId('response').props.accessibilityState).toEqual({ busy: true })
    expect(screen.getByTestId('response')).toHaveProp('accessibilityLabel', 'Kael \u0111ang ph\u1ea3n h\u1ed3i')
    expect(screen.queryByText('Kael')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('response').props.style)).toMatchObject({
      alignSelf: 'flex-start',
      backgroundColor: 'transparent',
      maxWidth: '100%',
    })

    const completedBlock = kaelResponseStreamReducer(streaming, {
      blockId: 'turn-1:block:0',
      type: 'block.completed',
    })
    const completed = kaelResponseStreamReducer(completedBlock, {
      elapsedMs: 900,
      responseId: 'turn-1',
      type: 'response.completed',
    })
    view.rerender(
      <KaelResponseSurface
        language="vi"
        onPresentationSettled={onPresentationSettled}
        reduceMotion
        state={completed}
        testID="response"
        tokens={customerTheme.lightLayer}
      />,
    )

    expect(screen.getByTestId('response').props.accessibilityState).toBeUndefined()
    expect(onPresentationSettled).toHaveBeenCalledWith('turn-1')
  })

  it('presents a received backend response in ordered semantic slices before settling it', () => {
    jest.useFakeTimers()
    const onPresentationSettled = jest.fn()
    const started = kaelResponseStreamReducer(initialKaelResponseStreamState, {
      mode: 'fast',
      responseId: 'turn-paced',
      type: 'response.started',
    })
    const withBlock = kaelResponseStreamReducer(started, {
      blockId: 'turn-paced:block:0',
      kind: 'paragraph',
      type: 'block.started',
    })
    const responseText = 'Khóa van nước trước khi kiểm tra điểm rò. Gọi thợ nếu nước vẫn chảy.'
    const streaming = kaelResponseStreamReducer(withBlock, {
      blockId: 'turn-paced:block:0',
      delta: responseText,
      type: 'block.text.delta',
    })
    const view = render(
      <KaelResponseSurface
        language="vi"
        onPresentationSettled={onPresentationSettled}
        reduceMotion={false}
        state={streaming}
        testID="paced-response"
        tokens={customerTheme.lightLayer}
      />,
    )

    expect(screen.getByTestId('customer-v21-kael-response-block-0'))
      .not.toHaveTextContent(responseText)

    act(() => jest.advanceTimersByTime(48))
    expect(screen.getByTestId('customer-v21-kael-response-block-0')).toHaveTextContent(/Khóa van/u)
    expect(screen.getByTestId('customer-v21-kael-response-block-0'))
      .not.toHaveTextContent(responseText)

    const completed = kaelResponseStreamReducer(streaming, {
      elapsedMs: 960,
      responseId: 'turn-paced',
      type: 'response.completed',
    })
    view.rerender(
      <KaelResponseSurface
        language="vi"
        onPresentationSettled={onPresentationSettled}
        reduceMotion={false}
        state={completed}
        testID="paced-response"
        tokens={customerTheme.lightLayer}
      />,
    )
    for (let step = 0; step < 8; step += 1) {
      act(() => jest.advanceTimersByTime(48))
    }

    expect(screen.getByTestId('customer-v21-kael-response-block-0')).toHaveTextContent(responseText)
    expect(onPresentationSettled).toHaveBeenCalledWith('turn-paced')
    jest.useRealTimers()
  })

  it('turns a dense Kael instruction into a lead and readable visual steps', () => {
    const state = kaelResponseStreamReducer(
      kaelResponseStreamReducer(
        kaelResponseStreamReducer(initialKaelResponseStreamState, {
          mode: 'standard',
          responseId: 'turn-readable',
          type: 'response.started',
        }),
        { blockId: 'turn-readable:block:0', kind: 'paragraph', type: 'block.started' },
      ),
      {
        blockId: 'turn-readable:block:0',
        delta: 'Trước khi gọi thợ, bạn có thể kiểm tra an toàn: Tháo nắp chặn xả. Dùng đèn pin soi xem có tóc, cặn bám không. Tránh đổ hóa chất mạnh vì có thể hỏng ống.',
        type: 'block.text.delta',
      },
    )

    render(
      <KaelResponseSurface
        language="vi"
        reduceMotion
        state={state}
        tokens={customerTheme.lightLayer}
      />,
    )

    expect(screen.getByText('Trước khi gọi thợ, bạn có thể kiểm tra an toàn:')).toBeTruthy()
    expect(screen.getByText('Tháo nắp chặn xả.')).toBeTruthy()
    expect(screen.getByText('Dùng đèn pin soi xem có tóc, cặn bám không.')).toBeTruthy()
    expect(screen.getByText('Tránh đổ hóa chất mạnh vì có thể hỏng ống.')).toBeTruthy()
  })

  it('stops auto-follow outside the reading threshold', () => {
    const metrics = {
      contentOffset: { x: 0, y: 420 },
      contentSize: { height: 1000, width: 360 },
      layoutMeasurement: { height: 500, width: 360 },
    }

    expect(isChatNearBottom(metrics)).toBe(false)
    expect(isChatNearBottom({ ...metrics, contentOffset: { x: 0, y: 450 } })).toBe(true)
  })

  it('does not pull the reader down and offers an explicit jump to new content', () => {
    render(
      <KaelChatTranscript
        empty={false}
        hiddenScrollbarStyle={null}
        language="vi"
        menuOpen={false}
        reduceMotion
        responseInFlight
        rows={[{ key: 'row-1', node: <Text>Noi dung dang doc</Text> }]}
        tokens={customerTheme.lightLayer}
      />,
    )
    const transcript = screen.getByTestId('customer-v21-kael-thread')

    fireEvent(transcript, 'scroll', {
      nativeEvent: {
        contentOffset: { x: 0, y: 200 },
        contentSize: { height: 900, width: 360 },
        layoutMeasurement: { height: 500, width: 360 },
      },
    })
    fireEvent(transcript, 'contentSizeChange', 360, 900)
    expect(screen.getByTestId('customer-v21-kael-jump-to-latest')).toBeTruthy()

    fireEvent.press(screen.getByTestId('customer-v21-kael-jump-to-latest'))
    expect(screen.queryByTestId('customer-v21-kael-jump-to-latest')).toBeNull()
  })
})
