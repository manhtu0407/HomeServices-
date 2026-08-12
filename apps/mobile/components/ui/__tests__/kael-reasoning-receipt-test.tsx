import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { KaelReasoningReceipt } from '../kael-reasoning-receipt'
import type { KaelReasoningReceiptState } from '@/lib/kael-reasoning-receipt'

const colors = {
  accent: '#008f82',
  border: '#c7e4df',
  mutedText: '#657d82',
  surface: '#f4fbfa',
  text: '#12272a',
}

function completedReceipt(expanded: boolean): KaelReasoningReceiptState {
  return {
    elapsedMs: 2_300,
    expanded,
    failureMessage: null,
    fallbackUsed: false,
    receiptId: 'kael-reasoning:receipt-test',
    startedAt: '2026-08-10T00:00:00.000Z',
    status: 'complete',
    steps: [{
      detail: null,
      id: 'intent',
      label: 'Checked the request',
      sequence: 0,
      stage: 'intent',
      status: 'completed',
    }],
    summary: ['Kael completed the safe reply.'],
  }
}

function pendingReceipt(): KaelReasoningReceiptState {
  return {
    elapsedMs: 0,
    expanded: true,
    failureMessage: null,
    fallbackUsed: false,
    receiptId: null,
    startedAt: null,
    status: 'running',
    steps: [],
    summary: [],
  }
}

describe('KaelReasoningReceipt', () => {
  it('shows Suy nghĩ immediately without inventing a backend duration', () => {
    render(
      <KaelReasoningReceipt
        colors={colors}
        language="vi"
        onToggle={jest.fn()}
        state={pendingReceipt()}
        testID="kael-receipt"
      />,
    )

    expect(screen.getByText('Quá trình suy luận')).toBeOnTheScreen()
    expect(screen.getByText('Suy nghĩ')).toBeOnTheScreen()
    expect(screen.getByTestId('kael-receipt-toggle'))
      .toHaveProp('accessibilityState', { busy: true, expanded: true })
    expect(screen.queryByTestId('kael-receipt-elapsed-slot')).toBeNull()
    expect(screen.queryByText('0.0 s')).toBeNull()
  })

  it('shows an up chevron while expanded and a down chevron after the completed receipt is collapsed', () => {
    const onToggle = jest.fn()
    const view = render(
      <KaelReasoningReceipt
        colors={colors}
        language="en"
        onToggle={onToggle}
        state={completedReceipt(true)}
        testID="kael-receipt"
      />,
    )

    expect(screen.getByTestId('kael-receipt-toggle'))
      .toHaveProp('accessibilityState', { busy: false, expanded: true })
    expect(screen.getByText('Reasoning process')).toBeOnTheScreen()
    expect(screen.getByTestId('kael-receipt-chevron-path'))
      .toHaveProp('d', 'M3 10.5 8 5.5l5 5')
    expect(StyleSheet.flatten(screen.getByTestId('kael-receipt').props.style))
      .toMatchObject({ backgroundColor: 'transparent' })
    expect(StyleSheet.flatten(screen.getByTestId('kael-receipt-elapsed-slot').props.style))
      .toMatchObject({ right: 49 })
    expect(screen.getByTestId('kael-receipt-elapsed-value')).toHaveTextContent('2.3')
    expect(StyleSheet.flatten(screen.getByTestId('kael-receipt-elapsed-value').props.style))
      .toMatchObject({ fontWeight: '700' })
    expect(StyleSheet.flatten(screen.getByText('s').props.style))
      .toMatchObject({ fontWeight: '700' })
    expect(StyleSheet.flatten(screen.getByTestId('kael-receipt-chevron-slot').props.style))
      .toMatchObject({ bottom: 0, right: 9, top: 0, width: 26 })
    fireEvent.press(screen.getByTestId('kael-receipt-toggle'))
    expect(onToggle).toHaveBeenCalledTimes(1)

    view.rerender(
      <KaelReasoningReceipt
        colors={colors}
        language="en"
        onToggle={onToggle}
        state={completedReceipt(false)}
        testID="kael-receipt"
      />,
    )

    expect(screen.getByTestId('kael-receipt-toggle'))
      .toHaveProp('accessibilityState', { busy: false, expanded: false })
    expect(screen.getByTestId('kael-receipt-chevron-path'))
      .toHaveProp('d', 'M3 5.5 8 10.5l5-5')
    expect(screen.queryByText('Checked the request')).toBeNull()
  })

  it('renders the backend-provided public detail instead of a static stage label', () => {
    render(
      <KaelReasoningReceipt
        colors={colors}
        language="en"
        onToggle={jest.fn()}
        state={{
          ...completedReceipt(true),
          steps: [{
            detail: 'The request asks how to start a normal chat.',
            id: 'intent',
            label: 'Checked the request',
            sequence: 0,
            stage: 'intent',
            status: 'completed',
          }],
        }}
        testID="kael-receipt"
      />,
    )

    expect(screen.getByText('The request asks how to start a normal chat.')).toBeOnTheScreen()
    expect(screen.queryByText('Checked the request')).toBeNull()
  })

  it('paces a running backend-authorized receipt detail before it is shown in full', () => {
    jest.useFakeTimers()
    const detail = 'The request requires a safe plumbing response before a worker visit.'
    const view = render(
      <KaelReasoningReceipt
        colors={colors}
        language="en"
        onToggle={jest.fn()}
        state={{
          ...completedReceipt(true),
          receiptId: 'receipt-paced',
          status: 'running',
          steps: [{
            detail,
            id: 'intent',
            label: 'Checked the request',
            sequence: 0,
            stage: 'intent',
            status: 'running',
          }],
        }}
        testID="kael-receipt"
      />,
    )

    expect(screen.queryByText(detail)).toBeNull()
    act(() => jest.advanceTimersByTime(48))
    expect(screen.getByText(/The request requires a safe/u)).toBeOnTheScreen()
    expect(screen.queryByText(detail)).toBeNull()

    view.rerender(
      <KaelReasoningReceipt
        colors={colors}
        language="en"
        onToggle={jest.fn()}
        state={{
          ...completedReceipt(true),
          receiptId: 'receipt-paced',
          steps: [{
            detail,
            id: 'intent',
            label: 'Checked the request',
            sequence: 0,
            stage: 'intent',
            status: 'completed',
          }],
        }}
        testID="kael-receipt"
      />,
    )
    expect(screen.queryByText(detail)).toBeNull()
    act(() => jest.advanceTimersByTime(48))
    act(() => jest.advanceTimersByTime(48))
    act(() => jest.advanceTimersByTime(48))
    expect(screen.getByText(detail)).toBeOnTheScreen()
    jest.useRealTimers()
  })

  it('shows streamed public notes once instead of repeating the completion summary', () => {
    render(
      <KaelReasoningReceipt
        colors={colors}
        language="en"
        onToggle={jest.fn()}
        state={{
          ...completedReceipt(true),
          steps: [{
            detail: 'The request asks how to start a normal chat.',
            id: 'public-summary-0',
            label: 'Public response note',
            sequence: 2,
            stage: 'compose',
            status: 'completed',
          }],
          summary: ['The request asks how to start a normal chat.'],
        }}
        testID="kael-receipt"
      />,
    )

    expect(screen.getAllByText('The request asks how to start a normal chat.')).toHaveLength(1)
  })

  it('keeps a distinct server-provided completion summary after its processing steps', () => {
    render(
      <KaelReasoningReceipt
        colors={colors}
        language="en"
        onToggle={jest.fn()}
        state={{
          ...completedReceipt(true),
          steps: [{
            detail: 'Checked the relevant conversation context.',
            id: 'context',
            label: 'Checked the relevant conversation context',
            sequence: 1,
            stage: 'context',
            status: 'completed',
          }],
          summary: ['Prepared a safe reply from backend feedback.'],
        }}
        testID="kael-receipt"
      />,
    )

    expect(screen.getByText('Checked the relevant conversation context.')).toBeOnTheScreen()
    expect(screen.getByText('Prepared a safe reply from backend feedback.')).toBeOnTheScreen()
  })
})
