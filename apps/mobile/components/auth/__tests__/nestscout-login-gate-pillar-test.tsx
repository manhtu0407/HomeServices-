import { fireEvent, render } from '@testing-library/react-native'
import { type PillarManifest } from '@/__tests__/pillar-manifest'
import { getGateLayout, NestScoutLoginGate } from '../entry-access/nestscout-login-gate'

jest.mock('expo-image', () => ({ Image: require('react-native').View }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, right: 0, bottom: 34, left: 0 }),
}))

export const PILLAR = {
  id: 'P65-nestscout-login-gate-production',
  invariant: 'the Production Login Gate preserves the supplied visual geometry while keeping role selection and continuation accessible',
  authority: [
    'supplied NestScout Login Gate source package',
    'governance/protocols/frontend-test.md G1 (layout) and G2 (state coverage)',
  ],
  target: 'apps/mobile/components/auth/entry-access/nestscout-login-gate/nestscout-login-gate.tsx',
  layer: 'ui-visual',
  siblings: ['P64-role-gate-language-integrity', 'P42-auth-session-shell'],
  mutation: 'replace the Production Login Gate with the retired role-card surface or make a role press anything but an immediate continue — the layout and interaction assertions turn red',
} as const satisfies PillarManifest

describe('Approved NestScout role gate', () => {
  it('scales the app crop to the available width and preserves its source origin', () => {
    const layout = getGateLayout(390, 844, 'app', { top: 59, right: 0, bottom: 34, left: 0 })

    expect(layout.stageWidth).toBe(390)
    expect(layout.scale).toBeCloseTo(390 / 800)
    expect(layout.originX).toBe(70)
    expect(layout.originY).toBe(98)
    expect(layout.scrollNeeded).toBe(false)
  })

  it('reports the pressed role on the first tap, once per press', () => {
    const onRolePress = jest.fn()
    const view = render(<NestScoutLoginGate onRolePress={onRolePress} />)

    fireEvent.press(view.getByTestId('auth-entry-role-worker'))
    expect(onRolePress).toHaveBeenCalledTimes(1)
    expect(onRolePress).toHaveBeenLastCalledWith('worker')
    fireEvent.press(view.getByTestId('auth-entry-role-customer'))
    expect(onRolePress).toHaveBeenCalledTimes(2)
    expect(onRolePress).toHaveBeenLastCalledWith('customer')
  })

  it('exposes the two roles as real buttons and blocks interaction while disabled', () => {
    const handler = jest.fn()
    const view = render(<NestScoutLoginGate disabled onRolePress={handler} />)

    expect(view.getAllByRole('button')).toHaveLength(2)
    fireEvent.press(view.getByTestId('auth-entry-role-customer'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('uses native localized text when a caption differs from the approved Vietnamese bitmap', () => {
    const view = render(
      <NestScoutLoginGate
        onRolePress={jest.fn()}
        copy={{ 'customer-title': 'New customer' }}
        textMode="native"
      />,
    )

    expect(view.getByText('New customer', { includeHiddenElements: true })).toBeOnTheScreen()
  })

  it('keeps the brand name while hiding the source tagline', () => {
    const view = render(<NestScoutLoginGate onRolePress={jest.fn()} />)

    expect(view.getByTestId('auth-role-gate-brand')).toBeOnTheScreen()
    expect(view.getByTestId('auth-role-gate-brand-tagline-mask')).toBeOnTheScreen()
  })
})
