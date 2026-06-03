import { render, screen } from '@testing-library/react-native'
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

  it('uses a white focus outline instead of the browser orange ring', () => {
    render(<AddressAutocomplete language="vi" onChange={jest.fn()} value="" />)

    const inputStyle = StyleSheet.flatten(screen.getByTestId('customer-address-autocomplete-input').props.style) as Record<string, unknown>

    expect(inputStyle.outlineStyle).toBe('solid')
    expect(inputStyle.outlineWidth).toBe(1)
    expect(inputStyle.outlineOffset).toBe(-1)
    expect(inputStyle.outlineColor).toBe('rgba(255,255,255,0.96)')
    expect(String(inputStyle.outlineColor).toLowerCase()).not.toContain('orange')
  })
})
