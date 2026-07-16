import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { AddressAutocomplete } from '../address-autocomplete'

const mockPlacesAutocomplete = jest.fn()

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('@/lib/services', () => ({
  placesService: {
    autocomplete: (...args: unknown[]) => mockPlacesAutocomplete(...args),
  },
}))

describe('AddressAutocomplete', () => {
  beforeEach(() => {
    mockPlacesAutocomplete.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('uses a white focus outline instead of the browser orange ring', () => {
    render(<AddressAutocomplete language="vi" onChange={jest.fn()} value="" />)

    const inputStyle = StyleSheet.flatten(screen.getByTestId('customer-address-autocomplete-input').props.style) as Record<string, unknown>

    expect(inputStyle.outlineStyle).toBe('solid')
    expect(inputStyle.outlineWidth).toBe(1)
    expect(inputStyle.outlineOffset).toBe(-1)
    expect(inputStyle.outlineColor).toBe('rgba(255,255,255,0.96)')
    expect(String(inputStyle.outlineColor).toLowerCase()).not.toContain('orange')
  })

  it('hides suggestions owned by the previous query as soon as the value changes', async () => {
    jest.useFakeTimers()
    mockPlacesAutocomplete.mockResolvedValue({
      data: {
        fallback_used: false,
        suggestions: [{
          label: 'Alpha Tower, Quận 7',
          main_text: 'Alpha Tower',
          place_id: 'alpha',
          secondary_text: 'Quận 7',
        }],
      },
      success: true,
    })
    const { rerender } = render(
      <AddressAutocomplete language="vi" onChange={jest.fn()} value="Alpha" />,
    )
    fireEvent(screen.getByTestId('customer-address-autocomplete-input'), 'focus')
    await act(async () => {
      jest.advanceTimersByTime(260)
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.getByText('Alpha Tower')).toBeOnTheScreen())

    rerender(<AddressAutocomplete language="vi" onChange={jest.fn()} value="Beta" />)

    expect(screen.queryByText('Alpha Tower')).toBeNull()
    expect(screen.queryByTestId('customer-address-autocomplete-suggestions')).toBeNull()
  })

  it('shows the honest fallback when the places request rejects', async () => {
    jest.useFakeTimers()
    mockPlacesAutocomplete.mockRejectedValueOnce(new Error('network unavailable'))

    render(<AddressAutocomplete language="vi" onChange={jest.fn()} value="Quận 7" />)

    await act(async () => {
      jest.advanceTimersByTime(260)
      await Promise.resolve()
    })

    expect(await screen.findByTestId('customer-address-autocomplete-fallback')).toHaveTextContent(
      'Kael vẫn có thể dùng quận TP.HCM nếu chưa có gợi ý.',
    )
  })
})
