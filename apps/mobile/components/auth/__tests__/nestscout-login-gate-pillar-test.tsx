import { useState } from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { getGateLayout, NestScoutLoginGate, nextRoleAction, type Role } from '../entry-access/nestscout-login-gate'

jest.mock('expo-image', () => ({ Image: require('react-native').View }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, right: 0, bottom: 34, left: 0 }),
}))

function Harness({ onContinue }: { onContinue: (role: Role) => void }) {
  const [role, setRole] = useState<Role | null>(null)

  return (
    <NestScoutLoginGate
      selectedRole={role}
      onRolePress={next => {
        if (nextRoleAction(role, next) === 'continue') onContinue(next)
        else setRole(next)
      }}
    />
  )
}

describe('Approved NestScout role gate', () => {
  it('scales the app crop to the available width and preserves its source origin', () => {
    const layout = getGateLayout(390, 844, 'app', { top: 59, right: 0, bottom: 34, left: 0 })

    expect(layout.stageWidth).toBe(390)
    expect(layout.scale).toBeCloseTo(390 / 800)
    expect(layout.originX).toBe(70)
    expect(layout.originY).toBe(98)
    expect(layout.scrollNeeded).toBe(false)
  })

  it('selects once and continues on the second press; switching role does not continue', () => {
    const onContinue = jest.fn()
    const view = render(<Harness onContinue={onContinue} />)

    fireEvent.press(view.getByTestId('auth-entry-role-customer'))
    expect(onContinue).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId('auth-entry-role-worker'))
    expect(onContinue).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId('auth-entry-role-worker'))
    expect(onContinue).toHaveBeenCalledWith('worker')
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
