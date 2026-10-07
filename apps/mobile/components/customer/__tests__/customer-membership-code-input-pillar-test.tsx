import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { typography } from '@/design/theme'
import { membershipService } from '@/lib/services/membership-service'

import { CustomerMembershipCard } from '../profile/membership-card'

export const PILLAR = {
  id: 'P306-customer-membership-code-input-type',
  invariant:
    'The invite-code field renders its placeholder with the standard body tracking and no fixed line height, so the placeholder sits centered in the 44pt field; the wider tracking applies only once a code is typed',
  authority: [
    'governance/design/accessible-content.md (text keeps its designed tracking and is never clipped or crowded)',
    'governance/RULES.md #5 (one selected language per visible screen)',
  ],
  target: 'apps/mobile/components/customer/profile/membership-card.tsx',
  layer: 'ui-visual',
  siblings: ['P198-customer-usage-rank-card', 'P275-customer-invite-rank-report'],
  mutation:
    'put letterSpacing: 2 back on the base input style or spread typography.body (with its lineHeight) into it — the empty-field tracking and line-height cases turn red',
} as const satisfies PillarManifest

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ session: { access_token: 'customer-token', user: { id: 'owner-customer-token' } } }),
}))

jest.mock('@/lib/services/membership-service', () => ({
  ...jest.requireActual('@/lib/services/membership-service'),
  membershipService: { claimReferralCode: jest.fn(), getMembership: jest.fn() },
}))

const getMembership = membershipService.getMembership as jest.Mock

const CODE_TRACKING = 2
const styleOf = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as StyleProp<TextStyle>) ?? {}

async function renderInput() {
  getMembership.mockResolvedValue({
    success: true,
    data: { points: 0, customer_vnd_per_point: 10000, linked_worker: null },
  })
  render(<CustomerMembershipCard />)
  return screen.findByTestId('customer-membership-code-input')
}

describe('Customer membership invite-code field', () => {
  beforeEach(() => getMembership.mockReset())

  it('shows the placeholder with the standard body tracking and no fixed line height', async () => {
    const input = await renderInput()
    const style = styleOf(input)
    withPillarContext(PILLAR, () =>
      expect({ letterSpacing: style.letterSpacing, lineHeight: style.lineHeight }).toEqual({
        letterSpacing: typography.body.letterSpacing,
        lineHeight: undefined,
      }),
    )
  })

  it('keeps the field text at the body size with no vertical padding of its own', async () => {
    const input = await renderInput()
    const style = styleOf(input)
    withPillarContext(PILLAR, () =>
      expect({ fontSize: style.fontSize, minHeight: style.minHeight, paddingVertical: style.paddingVertical }).toEqual({
        fontSize: typography.body.fontSize,
        minHeight: 44,
        paddingVertical: 0,
      }),
    )
  })

  it('widens the tracking only once a code is typed', async () => {
    const input = await renderInput()
    fireEvent.changeText(input, 'kx7m4q2p')
    const typed = styleOf(screen.getByTestId('customer-membership-code-input'))
    withPillarContext(PILLAR, () => expect(typed.letterSpacing).toBe(CODE_TRACKING))
  })
})
