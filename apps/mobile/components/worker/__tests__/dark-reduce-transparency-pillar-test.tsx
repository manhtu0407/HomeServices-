import React from 'react'
import { Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { color, customerTheme } from '@/design/theme'

import { getCustomerThemeTokens } from '../../customer/customer-theme'
import { HomeStorytellingCard } from '../../customer/home/home-storytelling-card'
import { InfoListCard } from '../ui/screen-atoms-surfaces'

let mockMode: 'light' | 'dark' = 'dark'
jest.mock('../worker-theme', () => ({
  ...jest.requireActual('../worker-theme'),
  getWorkerThemeModeNow: () => mockMode,
  useWorkerThemeMode: () => mockMode,
}))

export const PILLAR = {
  id: 'P321-dark-reduce-transparency-solids',
  invariant:
    'with Reduce Transparency on in dark mode, the solid fallbacks that replace glass follow the theme: a Worker opaque card becomes the dark base card instead of white, and the Customer Home hero, once its light artwork is hidden, draws its title, description and search field in dark-theme ink and surfaces; light mode keeps its existing light fallbacks',
  authority: [
    'governance/design/signature.md §2 and §5 (one neutral dark token set for every surface)',
    'governance/design/accessible-content.md (Reduce Transparency, and text contrast ≥ 4.5:1 in both light and dark)',
  ],
  target: 'apps/mobile/components/worker/ui/screen-atoms-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P320-worker-derived-dark-styles', 'P318-dark-text-contrast'],
  mutation:
    'drop the solidDark ink from the Customer hero title or go back to the plain styles.opaqueCard in InfoListCard — the dark title or the dark card case turns red',
} as const satisfies PillarManifest

const dark = customerTheme.darkLayer

function flatStyle(node: { props: { style?: unknown } }) {
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style && typeof style === 'object' ? (style as Record<string, unknown>) : {}
  return flatten(node.props.style)
}

describe('P321 dark Reduce Transparency solid fallbacks', () => {
  afterEach(() => {
    mockMode = 'dark'
  })

  it('renders a Worker opaque card on the dark base surface, and white in light', () => {
    withPillarContext(PILLAR, () => {
      const { toJSON, rerender } = render(<InfoListCard reduceTransparency><Text>row</Text></InfoListCard>)
      expect(flatStyle(toJSON() as never).backgroundColor).toBe(dark.base)
      mockMode = 'light'
      rerender(<InfoListCard reduceTransparency><Text>row</Text></InfoListCard>)
      expect(flatStyle(toJSON() as never).backgroundColor).toBe(color.mint.white)
    })
  })

  it('draws the Customer Home hero copy and search in dark ink on the solid dark card', () => {
    withPillarContext(PILLAR, () => {
      const tokens = getCustomerThemeTokens('dark')
      render(<HomeStorytellingCard language="vi" reduceTransparency tokens={tokens} />)
      expect(flatStyle(screen.getByText(/Việc nhà có chúng tôi/)).color).toBe(tokens.text)
      expect(flatStyle(screen.getByText(/Kết nối thợ lành nghề/)).color).toBe(tokens.muted)
      expect(flatStyle(screen.getByTestId('customer-v21-home-search')).backgroundColor).toBe(tokens.base)
    })
  })

  it('keeps the light hero palette when the theme is light', () => {
    withPillarContext(PILLAR, () => {
      render(<HomeStorytellingCard language="vi" reduceTransparency tokens={getCustomerThemeTokens('light')} />)
      expect(flatStyle(screen.getByText(/Việc nhà có chúng tôi/)).color).toBe('#16343B')
      expect(flatStyle(screen.getByTestId('customer-v21-home-search')).backgroundColor).toBe('rgba(255,255,255,0.97)')
    })
  })
})
