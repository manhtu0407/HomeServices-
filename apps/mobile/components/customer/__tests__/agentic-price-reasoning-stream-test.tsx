import { act, render, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet } from 'react-native'

import { customerTheme } from '@/design/theme'

import type { AgenticEstimateSupportingPhaseModel } from '../kael-chat/agentic-estimate-display-model'
import { AgenticPriceReasoningStream } from '../kael-chat/agentic-price-reasoning-stream'

const model: AgenticEstimateSupportingPhaseModel = {
  title: 'Kael phân tích vấn đề và cơ sở giá',
  rows: [
    {
      detail: 'Dấu hiệu hiện có phù hợp với rò nước cục bộ quanh đầu nối.',
      key: 'problem',
      label: 'Vấn đề Kael nhận thấy',
    },
    {
      detail: 'Quan sát: Hình cho thấy vùng tường có vệt ẩm. Khả năng liên quan: Có thể do điểm nối bị rò.',
      key: 'evidence-photo-1',
      mediaUrl: 'https://media.test/photo-1',
      label: 'Hình 1',
      sections: [
        { label: 'Mức tin cậy', value: 'Vừa' },
        { label: 'Quan sát', value: 'Hình cho thấy vùng tường có vệt ẩm.' },
        { label: 'Khả năng liên quan', value: 'Có thể do điểm nối bị rò.' },
      ],
    },
    {
      detail: 'Khớp ren dưới bồn rửa rò khi xả.\nKhớp nối khô lại sau hai phút.',
      key: 'scope',
      label: 'Thông tin Kael đã nhận',
      layout: 'columns',
      sections: [
        { label: 'Mô tả chính', value: 'Khớp ren dưới bồn rửa rò khi xả.' },
        { label: 'Thông tin bổ sung', value: 'Khớp nối khô lại sau hai phút.' },
      ],
    },
  ],
  valueStatement: 'Khoảng giá gắn với phạm vi hiện tại.',
}

describe('Agentic Price Reasoning stream', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('reveals validated rows in reading order without streaming the price value', async () => {
    jest.useFakeTimers()
    render(
      <AgenticPriceReasoningStream
        model={model}
        reduceMotion={false}
        tokens={customerTheme.lightLayer}
      />,
    )

    expect(screen.queryByTestId('customer-v21-agentic-estimate-support-problem')).toBeNull()
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByTestId('customer-v21-agentic-estimate-support-problem')).toBeTruthy()
    expect(screen.getByTestId('customer-v21-agentic-estimate-support-problem'))
      .not.toHaveTextContent('▍')
    expect(screen.queryByTestId('customer-v21-agentic-estimate-support-evidence-photo-1')).toBeNull()
    expect(screen.queryByText(/250\.000|450\.000/)).toBeNull()

    await act(async () => {
      for (let timerPass = 0; timerPass < 100; timerPass += 1) {
        await Promise.resolve()
        await jest.runOnlyPendingTimersAsync()
      }
    })

    expect(screen.getByTestId('customer-v21-agentic-estimate-support-evidence-photo-1'))
      .toHaveTextContent(/Khả năng liên quan/)
    expect(screen.getByTestId('customer-v21-agentic-estimate-support-evidence-photo-1'))
      .toHaveTextContent(/Mức tin cậy\s*Vừa\s*Quan sát\s*Hình cho thấy vùng tường có vệt ẩm\./)
    expect(screen.getByTestId('customer-v21-agentic-estimate-support-scope'))
      .toHaveTextContent(/Mô tả chính\s*Khớp ren dưới bồn rửa rò khi xả\./)
    expect(screen.getByTestId('customer-v21-agentic-estimate-support-scope'))
      .toHaveTextContent(/Thông tin bổ sung\s*Khớp nối khô lại sau hai phút\./)
    expect(screen.getByTestId('customer-v21-agentic-estimate-supporting-phase').props.accessibilityState)
      .toBeUndefined()
    expect(screen.getByText(model.valueStatement)).toBeTruthy()
    expect(screen.getByTestId('customer-v21-agentic-estimate-support-evidence-photo-1-preview').props.source)
      .toEqual([{ uri: 'https://media.test/photo-1' }])
  })

  it('does not render an empty received-information row before its stream begins', () => {
    jest.useFakeTimers()
    render(
      <AgenticPriceReasoningStream
        model={{ ...model, rows: [model.rows[2]] }}
        reduceMotion={false}
        tokens={customerTheme.lightLayer}
      />,
    )

    expect(screen.queryByTestId('customer-v21-agentic-estimate-support-scope')).toBeNull()
  })

  it('reveals the complete validated receipt immediately with Reduce Motion', () => {
    render(
      <AgenticPriceReasoningStream
        model={model}
        reduceMotion
        tokens={customerTheme.lightLayer}
      />,
    )

    expect(screen.getByText(model.rows[0].detail)).toBeTruthy()
    expect(screen.getByText('Mức tin cậy')).toBeTruthy()
    expect(screen.getByText('Hình cho thấy vùng tường có vệt ẩm.')).toBeTruthy()
    expect(screen.getByText('Có thể do điểm nối bị rò.')).toBeTruthy()
    expect(screen.getByText(model.valueStatement)).toBeTruthy()
  })

  it('uses a compact standard evidence frame and readable vertical report rows', () => {
    const dimensionsSpy = jest.spyOn(Dimensions, 'get').mockReturnValue({
      fontScale: 1,
      height: 844,
      scale: 1,
      width: 390,
    })

    const { unmount } = render(
      <AgenticPriceReasoningStream
        model={model}
        reduceMotion
        tokens={customerTheme.lightLayer}
      />,
    )

    const previewTestId = 'customer-v21-agentic-estimate-support-evidence-photo-1-preview'
    const previewStyle = StyleSheet.flatten(screen.getByTestId(previewTestId).props.style)
    const evidenceHeaderStyle = StyleSheet.flatten(
      screen.getByTestId('customer-v21-agentic-estimate-support-evidence-photo-1-header').props.style,
    )
    const rowStyle = StyleSheet.flatten(
      screen.getByTestId('customer-v21-agentic-estimate-support-problem').props.style,
    )
    const evidenceRowStyle = StyleSheet.flatten(
      screen.getByTestId('customer-v21-agentic-estimate-support-evidence-photo-1').props.style,
    )
    const titleStyle = StyleSheet.flatten(screen.getByText(model.title).props.style)
    const labelStyle = StyleSheet.flatten(screen.getByText(model.rows[0].label).props.style)
    const sectionLabelStyle = StyleSheet.flatten(screen.getByText('Mức tin cậy').props.style)
    const sectionStyle = StyleSheet.flatten(
      screen.getByTestId('customer-v21-agentic-estimate-support-scope-sections').props.style,
    )

    expect(previewStyle).toMatchObject({
      alignSelf: 'flex-start',
      borderRadius: 12,
      height: 84,
      width: 112,
    })
    expect(previewStyle.width).toBe(112)
    expect(evidenceHeaderStyle.flexDirection).toBe('column')
    expect(evidenceRowStyle).toMatchObject({ marginTop: -6, paddingTop: 2 })
    expect(rowStyle.flexDirection).toBe('column')
    expect(rowStyle.paddingVertical).toBe(10)
    expect(titleStyle.color).toBe(customerTheme.lightLayer.primary)
    expect(titleStyle.fontWeight).toBe('600')
    expect(labelStyle.fontWeight).toBe('800')
    expect(sectionLabelStyle.fontWeight).toBe('800')
    expect(sectionStyle.flexDirection).toBe('column')
    expect(sectionStyle.gap).toBe(12)

    unmount()
    dimensionsSpy.mockReturnValue({
      fontScale: 1,
      height: 1024,
      scale: 1,
      width: 700,
    })
    render(
      <AgenticPriceReasoningStream
        model={model}
        reduceMotion
        tokens={customerTheme.lightLayer}
      />,
    )
    expect(StyleSheet.flatten(
      screen.getByTestId('customer-v21-agentic-estimate-support-scope-sections').props.style,
    ).flexDirection).toBe('column')

    dimensionsSpy.mockRestore()
  })

  it('uses the same standard frame for every submitted photo', () => {
    const photoRows: AgenticEstimateSupportingPhaseModel['rows'] = [
      model.rows[1],
      { ...model.rows[1], key: 'evidence-photo-2', label: 'Hình 2', mediaUrl: 'https://media.test/photo-2' },
      { ...model.rows[1], key: 'evidence-photo-3', label: 'Hình 3', mediaUrl: 'https://media.test/photo-3' },
    ]
    render(
      <AgenticPriceReasoningStream
        model={{ ...model, rows: photoRows }}
        reduceMotion
        tokens={customerTheme.lightLayer}
      />,
    )

    for (const index of [1, 2, 3]) {
      const style = StyleSheet.flatten(
        screen.getByTestId(`customer-v21-agentic-estimate-support-evidence-photo-${index}-preview`).props.style,
      )
      expect(style).toMatchObject({ height: 84, width: 112 })
    }
  })
})
