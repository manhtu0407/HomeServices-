import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import * as WebBrowser from 'expo-web-browser'
import { Linking } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import {
  NESTSCOUT_PRIVACY_POLICY_URL,
  PublicPrivacyPolicyLink,
} from '@/components/ui/public-privacy-policy-link'

jest.mock('expo-web-browser', () => ({
  WebBrowserPresentationStyle: { FULL_SCREEN: 'fullScreen' },
  openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })),
}))

jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(View, props, children),
  }
})

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => 'vi',
  }
})

import { EntryBrandAccessFlow } from '@/components/auth/entry-access/EntryBrandAccessFlow'
import { getCustomerThemeTokens } from '@/components/customer/customer-theme'
import { ProfileLegalView } from '@/components/customer/profile/profile-legal-surfaces'
import { WorkerV5PoliciesBody } from '@/components/worker/profile/settings-utility-surfaces'

export const PILLAR = {
  id: 'P38-public-privacy-policy-link',
  invariant:
    'registration and profile can render a localized, screen-reader-labelled link to the exact public NestScout privacy policy',
  authority: [
    'Apple App Review guideline 5.1.1 (privacy policy access)',
    'governance/design/accessible-content.md (interactive name, role, and target size)',
  ],
  target: 'apps/mobile/components/ui/public-privacy-policy-link.tsx',
  layer: 'ui-visual',
  siblings: ['P08-worker-dock-motion', 'P37-ios-release-readiness'],
  mutation:
    'remove accessibilityRole="link" or replace the public URL — the role/name or exact-open assertion turns red',
} as const satisfies PillarManifest

describe('PublicPrivacyPolicyLink', () => {
  beforeEach(() => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  })

  afterEach(() => {
    jest.mocked(WebBrowser.openBrowserAsync).mockClear()
    jest.restoreAllMocks()
  })

  it.each([
    ['vi', 'Mở Chính sách quyền riêng tư'],
    ['en', 'Open Privacy Policy'],
  ] as const)('opens the official policy in the in-app browser in %s mode', async (language, label) => {
    render(<PublicPrivacyPolicyLink language={language} testID={`policy-${language}`} />)

    const link = screen.getByRole('link', { name: label })
    fireEvent.press(link)

    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalled())
    withPillarContext(PILLAR, () => {
      expect(link).toHaveStyle({ minHeight: 44 })
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
        NESTSCOUT_PRIVACY_POLICY_URL,
        expect.objectContaining({ dismissButtonStyle: 'done' }),
      )
      expect(Linking.openURL).not.toHaveBeenCalled()
      expect(NESTSCOUT_PRIVACY_POLICY_URL).toBe('https://manhtu0407.github.io/nestscout-privacy-policy/')
    }, `${language} policy access must expose the same public destination as store metadata`)
  })

  it('falls back to the system browser when the in-app browser cannot open', async () => {
    jest.mocked(WebBrowser.openBrowserAsync).mockRejectedValueOnce(new Error('native module missing'))
    render(<PublicPrivacyPolicyLink language="vi" testID="policy-fallback" />)

    fireEvent.press(screen.getByRole('link', { name: 'Mở Chính sách quyền riêng tư' }))

    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith(NESTSCOUT_PRIVACY_POLICY_URL))
  })

  it('wires the public policy link into registration and both role profiles', () => {
    const actions = {
      onCompleteOnboarding: jest.fn(async () => ({ success: true })),
      onPasswordLogin: jest.fn(async () => ({ success: true })),
      onRegister: jest.fn(async () => ({ success: true })),
    }
    const registration = render(
      <EntryBrandAccessFlow
        actions={actions}
        initialStep="register"
        restoreRememberedRole={false}
      />,
    )

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('auth-register-privacy-policy')).toHaveProp('accessibilityRole', 'link')
    }, 'registration must expose the public policy before account creation')

    registration.unmount()
    const customerPolicy = render(<ProfileLegalView language="vi" tokens={getCustomerThemeTokens('light')} />)

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-v21-profile-public-privacy-policy')).toHaveProp('accessibilityRole', 'link')
    }, 'the signed-in Profile legal surface must expose the same public policy')

    customerPolicy.unmount()
    render(<WorkerV5PoliciesBody language="vi" reduceTransparency />)

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-public-privacy-policy')).toHaveProp('accessibilityRole', 'link')
    }, 'the worker Profile policy surface must expose the same public policy')
  })
})
