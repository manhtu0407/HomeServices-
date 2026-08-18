import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Image: (props: any) => React.createElement(View, props),
  }
})

import { KaelNavigationAccessory } from '../kael-navigation-accessory'

describe('Kael Navigation accessory', () => {
  it.each([
    ['customer', 'Cánh mở lời', 'kael-customer-navigation-monocle.png'],
    ['worker', 'Điểm tựa', 'kael-worker-navigation-monocle.png'],
  ] as const)('renders the approved %s role artwork with a truthful selected state', (role, label, assetName) => {
    const onPress = jest.fn()

    render(
      <KaelNavigationAccessory
        accessibilityLabel={label}
        active
        onPress={onPress}
        testID={`kael-navigation-${role}`}
        visualRole={role}
      />,
    )

    const control = screen.getByTestId(`kael-navigation-${role}`)
    expect(control.props.accessibilityLabel).toBe(label)
    expect(control.props.accessibilityRole).toBe('button')
    expect(control.props.accessibilityState).toEqual({ selected: true })
    expect(screen.getByTestId(`kael-navigation-${role}-artwork`)).toBeTruthy()
    expect(existsSync(resolve(__dirname, '../../../assets/kael/navigation', assetName))).toBe(true)

    fireEvent.press(control)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('keeps the accessory reachable when Reduce Motion is enabled', () => {
    render(
      <KaelNavigationAccessory
        accessibilityLabel="Kael"
        onPress={jest.fn()}
        reduceMotion
        testID="kael-navigation-reduced-motion"
        visualRole="customer"
      />,
    )

    expect(screen.getByTestId('kael-navigation-reduced-motion')).toBeOnTheScreen()
    expect(screen.getByTestId('kael-navigation-reduced-motion-artwork')).toBeOnTheScreen()
  })
})
