import React from 'react'
import { StyleSheet } from 'react-native'
import { render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { customerTheme } from '@/design/theme'

let mockMode: 'light' | 'dark' = 'dark'
jest.mock('../worker-theme', () => ({
  ...jest.requireActual('../worker-theme'),
  getWorkerThemeModeNow: () => mockMode,
  useWorkerThemeMode: () => mockMode,
}))

export const PILLAR = {
  id: 'P323-worker-theme-render-time',
  invariant:
    'Worker stage screens resolve their colours at render time from the light source values: the Stage 5 paint layers draw the flat dark surfaces in dark and their light washes in light, and the Stage 11 stylesheet built while the phone was dark still renders light once a saved Light preference takes effect',
  authority: [
    'governance/design/signature.md §2 and §5 (one neutral dark token set for every surface)',
    'governance/design/accessible-content.md (text contrast ≥ 4.5:1 in both light and dark)',
  ],
  target: 'apps/mobile/components/worker/jobs/stage-eleven/stage-eleven-content.tsx',
  layer: 'ui-visual',
  siblings: ['P320-worker-derived-dark-styles', 'P321-dark-reduce-transparency-solids'],
  mutation:
    'build the Stage 11 stylesheet from the themed proxy again, or let Stage 5 Paint draw its light washes in dark — the light-after-dark or the dark paint case turns red',
} as const satisfies PillarManifest

const dark = customerTheme.darkLayer

function stageElevenModel() {
  const { buildStageElevenModel } = require('../jobs/stage-eleven/stage-eleven-model')
  return buildStageElevenModel({ jobId: 'job-1', status: 'completed', paymentStatus: 'paid', amountReceived: 350000, ledger: [] })
}

describe('P323 Worker theme resolved at render time', () => {
  afterEach(() => {
    mockMode = 'dark'
  })

  it('paints the Stage 5 surfaces flat dark in dark and with the light washes in light', () => {
    const { Paint } = require('../jobs/stage-five/travel-work/stage-five-ui')
    withPillarContext(PILLAR, () => {
      const darkView = render(<Paint background />)
      expect(StyleSheet.flatten((darkView.toJSON() as unknown as { props: { style: object } }).props.style)).toMatchObject({ backgroundColor: dark.canvas })
      darkView.unmount()
      mockMode = 'light'
      const lightView = render(<Paint background />)
      expect(StyleSheet.flatten((lightView.toJSON() as unknown as { props: { style: object } }).props.style)).not.toHaveProperty('backgroundColor')
    })
  })

  it('renders Stage 11 light after its stylesheet was built while the phone was dark', () => {
    mockMode = 'dark'
    // First load of the module, while the phone is dark: its stylesheet is built now.
    const StageElevenContent: React.ComponentType<Record<string, unknown>> = require('../jobs/stage-eleven/stage-eleven-content').StageElevenContent
    const tokens: { canvas: string } = require('../jobs/stage-eleven/stage-eleven.tokens').stageElevenTokens
    mockMode = 'light'
    render(<StageElevenContent actions={{ onEarnings: jest.fn(), onHistory: jest.fn() }} language="vi" model={stageElevenModel()} />)
    withPillarContext(PILLAR, () => {
      expect(StyleSheet.flatten(screen.getByTestId('worker-v5-stage-eleven-payment-confirmed').props.style)).toMatchObject({ backgroundColor: tokens.canvas })
    })
  })
})
