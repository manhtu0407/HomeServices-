import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Image: (props: any) => React.createElement(View, props),
  }
})

import { KaelMascot, getKaelMascotAssetStatus } from '@/components/kael/kael-mascot'
import { KaelButton, KaelCard, KaelChip, KaelTextField } from '../kael-primitives'

describe('Kael UI primitives', () => {
  it('renders the primary button and handles presses', () => {
    const onPress = jest.fn()

    render(<KaelButton onPress={onPress}>Tiếp tục</KaelButton>)

    fireEvent.press(screen.getByRole('button', { name: 'Tiếp tục' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('prevents disabled primary actions from firing', () => {
    const onPress = jest.fn()

    render(<KaelButton disabled onPress={onPress}>Tiếp tục</KaelButton>)

    fireEvent.press(screen.getByRole('button', { name: 'Tiếp tục' }))

    expect(onPress).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled()
  })

  it('keeps chip, input, and card content visible', () => {
    render(
      <KaelCard>
        <KaelChip variant="selected">Đã chọn</KaelChip>
        <KaelTextField placeholder="Nhập nội dung..." value="" />
        <Text>Card content</Text>
      </KaelCard>,
    )

    expect(screen.getByText('Đã chọn')).toBeOnTheScreen()
    expect(screen.getByPlaceholderText('Nhập nội dung...')).toBeOnTheScreen()
    expect(screen.getByText('Card content')).toBeOnTheScreen()
  })

  it('marks missing official mascot states as fallback assets', () => {
    expect(getKaelMascotAssetStatus('findingWorker')).toBe('fallback')

    render(<KaelMascot showFallbackBadge state="findingWorker" />)

    expect(screen.getByText('Asset tạm')).toBeOnTheScreen()
  })
})
