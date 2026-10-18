import { render, screen } from '@testing-library/react-native'
import { Platform, Text } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { KaelFreshRow } from '../kael-chat/kael-fresh-row'

export const PILLAR = {
  id: 'P391-customer-chat-row-layout',
  invariant: 'Customer chat rows never request Reanimated layout entering on web, where it can detach FlatList cells from flow; native keeps its entrance feedback',
  authority: ['governance/protocols/frontend-test.md G3', 'AGENTS.md Performance Budget'],
  target: 'apps/mobile/components/customer/kael-chat/kael-fresh-row.tsx',
  layer: 'ui-visual',
  siblings: ['P207-worker-kael-transcript-follow', 'P311-customer-normal-chat-topic-gate'],
  mutation: 'render the Reanimated entering wrapper on web again; the web boundary assertion fails and live Preview cells collapse to zero height',
} as const satisfies PillarManifest

const mockEnteringRequests = jest.fn()
jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  const base = require('react-native-reanimated/mock')
  return {
    ...base,
    default: {
      ...base.default,
      View: ({ children, ...props }: { children?: React.ReactNode; entering?: unknown }) => {
        mockEnteringRequests(props.entering)
        return React.createElement(View, props, children)
      },
    },
  }
})

const initialPlatform = Platform.OS
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: initialPlatform })
  mockEnteringRequests.mockClear()
})

describe('Customer fresh row layout boundary', () => {
  it('keeps web content in normal flow without a layout-entering request', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' })
    render(<KaelFreshRow><Text>Ảnh chưa được gửi</Text></KaelFreshRow>)
    withPillarContext(PILLAR, () => {
      expect(screen.getByText('Ảnh chưa được gửi')).toBeVisible()
      expect(mockEnteringRequests.mock.calls.filter(([entering]) => entering !== undefined)).toHaveLength(0)
    }, 'web rows must not opt into the adapter that leaves cells absolutely positioned')
  })

  it.each(['ios', 'android'] as const)('preserves existing native entrance on %s', (platform) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform })
    render(<KaelFreshRow><Text>Kael đã phản hồi</Text></KaelFreshRow>)
    withPillarContext(PILLAR, () => {
      expect(screen.getByText('Kael đã phản hồi')).toBeVisible()
      expect(mockEnteringRequests.mock.calls.some(([entering]) => entering !== undefined)).toBe(true)
    }, `native ${platform} keeps the existing animation request`)
  })
})
