import { StyleSheet } from 'react-native'

import { shadow } from '@/design/theme'
import { createSurfaceShadow } from '../tokens'
import { customerV21PaymentStyles } from '../../customer/ui/payment-styles'

describe('createSurfaceShadow', () => {
  it('doubles the legacy radius so iOS keeps the shadow it had before the migration', () => {
    // React Native maps a boxShadow blur to CALayer.shadowRadius = blur / 2, while the legacy
    // shadowRadius prop maps 1:1. Halving this constant silently halves every shadow on iOS.
    expect(createSurfaceShadow({ color: '#087D72', offsetY: 14, opacity: 0.24, radius: 16 }))
      .toBe('0px 14px 32px rgba(8,125,114,0.24)')
  })

  it('folds shadowOpacity into the colour alpha', () => {
    expect(createSurfaceShadow({ color: '#08AF9C', offsetY: 10, opacity: 0.07, radius: 22 }))
      .toBe('0px 10px 44px rgba(8,175,156,0.07)')
  })

  it('keeps a horizontal offset when one is given', () => {
    expect(createSurfaceShadow({ color: '#000000', offsetX: -4, offsetY: 6, opacity: 0.5, radius: 3 }))
      .toBe('-4px 6px 6px rgba(0,0,0,0.5)')
  })

  it('preserves an upward offset, which is what React Native defaults to', () => {
    expect(createSurfaceShadow({ color: '#087D72', offsetY: -3, opacity: 0.1, radius: 26 }))
      .toBe('0px -3px 52px rgba(8,125,114,0.1)')
  })

  it('expands short hex and multiplies an existing rgba alpha', () => {
    expect(createSurfaceShadow({ color: '#0AF', offsetY: 1, opacity: 0.5, radius: 1 }))
      .toBe('0px 1px 2px rgba(0,170,255,0.5)')
    expect(createSurfaceShadow({ color: 'rgba(10,20,30,0.5)', offsetY: 1, opacity: 0.5, radius: 1 }))
      .toBe('0px 1px 2px rgba(10,20,30,0.25)')
  })

  it('refuses a colour it cannot resolve instead of dropping the opacity', () => {
    expect(() => createSurfaceShadow({ color: 'rebeccapurple', offsetY: 1, opacity: 0.5, radius: 1 }))
      .toThrow(/Unsupported shadow color/)
  })

  it('emits spread only when asked for, since the legacy props had no spread', () => {
    expect(createSurfaceShadow({ color: '#000000', offsetY: 2, opacity: 1, radius: 2 }))
      .toBe('0px 2px 4px rgba(0,0,0,1)')
    expect(createSurfaceShadow({ color: '#000000', offsetY: 2, opacity: 1, radius: 2, spread: 3 }))
      .toBe('0px 2px 4px 3px rgba(0,0,0,1)')
  })
})

describe('shadow contract coverage', () => {
  it('emits every design-layer shadow token as a cross-platform boxShadow', () => {
    for (const [name, token] of Object.entries(shadow)) {
      expect(Object.keys(token)).toEqual(['boxShadow'])
      expect(typeof (token as { boxShadow: string }).boxShadow).toBe('string')
      expect(name).toBeTruthy()
    }
  })

  it('leaves no legacy one-platform shadow prop on a customer payment surface', () => {
    // Payment is the surface the migration existed for: it drew no shadow at all on Android.
    for (const style of Object.values(customerV21PaymentStyles)) {
      const flattened = StyleSheet.flatten(style) as Record<string, unknown>
      expect(flattened).not.toHaveProperty('shadowColor')
      expect(flattened).not.toHaveProperty('shadowOffset')
      expect(flattened).not.toHaveProperty('shadowOpacity')
      expect(flattened).not.toHaveProperty('shadowRadius')
    }
  })

  it("treats boxShadow 'none' as no shadow, which is what the disabled buttons rely on", () => {
    // Three disabled-action styles replaced `shadowOpacity: 0` with `boxShadow: 'none'`; if the
    // parser did not yield an empty list they would inherit the base shadow instead of cancelling it.
    const processBoxShadow = require('react-native/Libraries/StyleSheet/processBoxShadow').default
    expect(processBoxShadow('none')).toEqual([])
    expect(processBoxShadow('0px 2px 4px rgba(0,0,0,1)')).toHaveLength(1)
  })
})
