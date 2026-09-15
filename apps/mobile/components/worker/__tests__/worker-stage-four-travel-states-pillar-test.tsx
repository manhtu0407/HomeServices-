import type { LocalDeal } from '@nestscout/shared'
import { fireEvent, render, screen, within } from '@testing-library/react-native'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'

import { type PillarManifest, withPillarContext } from '@/__tests__/pillar-manifest'

import type { WorkerV5RoutePreviewState } from '../jobs/use-worker-route-preview'
import type { WorkerJobsLegacyPrototypeRuntime } from '../jobs/worker-jobs-zip-prototype-shared'
import { WorkerJobsProductionStageFour } from '../jobs/worker-jobs-zip-prototype-stage-four'
import { getWorkerThemeTokens } from '../worker-theme'

export const PILLAR = {
  id: 'P184-worker-stage-four-travel-states',
  invariant:
    'Stage 4 renders only backend-authorized travel data: without a matched job the start CTA stays disabled, metrics read "—" and no destination chip appears; a released matched job enables "Bắt đầu di chuyển" and an on-way job switches to "Xác nhận đã tới"',
  authority: [
    'governance/RULES.md #8 (no fake data or placeholder success)',
    'governance/RULES.md #7 (workflow transitions stay server-validated)',
    'governance/protocols/frontend-test.md G2 (state coverage)',
  ],
  target: 'apps/mobile/components/worker/jobs/worker-jobs-zip-prototype-stage-four.tsx',
  layer: 'ui-visual',
  siblings: ['P33-worker-jobs-zip-prototype'],
  mutation:
    'make primaryReady true for every status, or show the destination chip without a released destination — the pre-agentic CTA and chip assertions turn red',
} as const satisfies PillarManifest

jest.mock('../jobs/route-map-surfaces', () => {
  const mockReact = jest.requireActual('react')
  const { View: MockView } = jest.requireActual('react-native')
  return {
    WorkerV5AuthenticatedRouteMapPreview: () => mockReact.createElement(MockView, { testID: 'mock-authenticated-route-map' }),
  }
})

type RenderedNode = { props: { style?: unknown }; children: (RenderedNode | string)[] }

const lightTokens = getWorkerThemeTokens('light')

function releasedDeal(status: 'worker_matched' | 'worker_on_way'): LocalDeal {
  return {
    backendStatus: status,
    broadcast: {
      addressAccess: {
        access_profile: {
          building_note: 'Tòa BE6, The Beverly',
          customer_handoff_note: 'Gặp lễ tân tòa BE6.',
        },
        check_in_required: true,
        customer_handoff_required: false,
        evidence_mode: 'geofence',
        exact_unit_released: false,
        identity_check_required: false,
        release_stage: 'building_released',
      },
      broadcastId: 'broadcast-stage4',
      fullAddressLabel: 'Tòa BE6, Vinhomes Grand Park',
      fullAddressVisible: true,
      generalArea: 'Vinhomes Grand Park',
      jobId: 'job-stage4',
      prebrief: [],
      problemSummary: 'Vệ sinh phòng khách',
      secondsRemaining: null,
      serviceType: 'cleaning',
      status: 'accepted',
    },
    draft: {
      addressLabel: 'Tòa BE6, Vinhomes Grand Park',
      description: 'Vệ sinh phòng khách',
      districtLabel: 'Thành phố Thủ Đức',
      inferredProblemLabel: null,
      mediaCount: 0,
      needsServiceChoice: false,
      problemChips: [],
      serviceType: 'cleaning',
      source: 'kael',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: null,
    id: 'job-stage4',
    scopeChange: null,
    status,
  }
}

const emptyRoute: WorkerV5RoutePreviewState = {
  hasRouteDestination: false,
  locationStatus: 'unavailable',
  mapUri: null,
  origin: null,
  route: null,
}

const liveRoute: WorkerV5RoutePreviewState = {
  hasRouteDestination: true,
  locationStatus: 'ready',
  mapUri: null,
  origin: { latitude: 10.84, longitude: 106.83 },
  route: {
    destination: { latitude: 10.843, longitude: 106.837 },
    distanceMeters: 4200,
    durationSeconds: 720,
    fetchedAt: '2026-09-14T08:00:00.000Z',
    geometry: null,
  },
}

function renderStageFour({
  actionBusy = false,
  deal = null,
  routePreview = emptyRoute,
}: {
  actionBusy?: boolean
  deal?: LocalDeal | null
  routePreview?: WorkerV5RoutePreviewState
} = {}) {
  const runRouteAction = jest.fn()
  const runtime = { state: { deal, lastError: null } } as unknown as WorkerJobsLegacyPrototypeRuntime
  render(
    <WorkerJobsProductionStageFour
      actionBusy={actionBusy}
      language="vi"
      navigateActiveJobChat={jest.fn()}
      navigateJobChat={jest.fn()}
      navigateToScreen={jest.fn()}
      prototypeMode={false}
      reduceMotion={false}
      reduceTransparency={false}
      routePreview={routePreview}
      runRouteAction={runRouteAction}
      runtime={runtime}
    />,
  )
  return { runRouteAction }
}

function backgroundsUnder(root: RenderedNode): string[] {
  const colors: string[] = []
  const visit = (node: RenderedNode) => {
    const color = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)?.backgroundColor
    if (typeof color === 'string') colors.push(color)
    for (const child of node.children) {
      if (typeof child !== 'string') visit(child)
    }
  }
  visit(root)
  return colors
}

describe('Worker Stage 4 travel states', () => {
  it('keeps the pre-agentic screen honest: disabled start CTA, unknown metrics, no destination chip', () => {
    const { runRouteAction } = renderStageFour()
    const primary = screen.getByTestId('stage4-primary')

    withPillarContext(PILLAR, () => {
      expect(primary).toBeDisabled()
      expect(screen.getByText('Bắt đầu di chuyển')).toBeOnTheScreen()
      expect(screen.getByText('Tôi đã sẵn sàng, bắt đầu đến khách hàng')).toBeOnTheScreen()
      expect(screen.getByTestId('stage4-primary-gradient')).toBeOnTheScreen()
      fireEvent.press(primary)
      expect(runRouteAction).not.toHaveBeenCalled()
    }, 'no job: the CTA must render the approved start step but stay disabled')

    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('stage4-destination-chip')).toBeNull()
      expect(screen.getAllByText('—')).toHaveLength(2)
      expect(screen.getByText('Chưa có dữ liệu')).toBeOnTheScreen()
      expect(screen.queryByText('Đang cập nhật')).toBeNull()
      expect(screen.getByText('Chưa mở điểm đến')).toBeOnTheScreen()
      expect(within(screen.getByTestId('stage4-destination-art')).getByText('Chưa có ảnh')).toBeOnTheScreen()
    }, 'no job: every travel value must be an explicit absence, never placeholder data')
  })

  it('keeps the controls Tu removed off the screen and the metric and car icons without a disc', () => {
    renderStageFour({ deal: releasedDeal('worker_matched'), routePreview: liveRoute })

    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('stage4-back')).toBeNull()
      expect(screen.queryByTestId('stage4-help')).toBeNull()
      expect(screen.queryByTestId('stage4-eta-details')).toBeNull()
      expect(screen.queryByTestId('stage4-destination-details')).toBeNull()
      expect(screen.queryByTestId('stage4-support')).toBeNull()
      expect(screen.queryByText('Trợ giúp')).toBeNull()
      expect(screen.queryByText('Hỗ trợ')).toBeNull()
      expect(screen.queryByText('Chi tiết')).toBeNull()
      expect(screen.queryByText('Di chuyển')).toBeNull()
      expect(screen.getByTestId('stage4-directions')).toBeOnTheScreen()
      expect(screen.getByTestId('stage4-share')).toBeOnTheScreen()
    }, 'the back button, header title, help pill, ETA disclosure, "Chi tiết" link and "Hỗ trợ" action were removed on request; directions and share remain')

    withPillarContext(PILLAR, () => {
      expect(backgroundsUnder(screen.getByTestId('stage4-metrics'))).not.toContain(lightTokens.water)
      expect(backgroundsUnder(screen.getByTestId('stage4-eta-sheet'))).not.toContain(lightTokens.water)
    }, 'metric and car icons render bare; a pale mint disc behind them is a regression')
  })

  it('enables the start step for a matched job with a released destination and a live route', () => {
    const { runRouteAction } = renderStageFour({ deal: releasedDeal('worker_matched'), routePreview: liveRoute })
    const primary = screen.getByTestId('stage4-primary')

    withPillarContext(PILLAR, () => {
      expect(primary).toBeEnabled()
      expect(screen.getByText('Bắt đầu di chuyển')).toBeOnTheScreen()
      fireEvent.press(primary)
      expect(runRouteAction).toHaveBeenCalledTimes(1)
    }, 'worker_matched + released destination: the start CTA must run the existing route action once')

    withPillarContext(PILLAR, () => {
      expect(screen.getByText('Bạn sẽ đến trong 12 phút')).toBeOnTheScreen()
      expect(screen.getAllByText('12 phút')).toHaveLength(2)
      expect(screen.getByText(/^4[.,]2 km$/)).toBeOnTheScreen()
      expect(screen.getByTestId('stage4-destination-chip')).toBeOnTheScreen()
      expect(within(screen.getByTestId('stage4-destination-chip')).getByText('Vinhomes Grand Park')).toBeOnTheScreen()
      expect(within(screen.getByTestId('stage4-destination-chip')).getByText('Tòa BE6, The Beverly')).toBeOnTheScreen()
      expect(screen.getAllByText('Tòa BE6, Vinhomes Grand Park')).toHaveLength(1)
      expect(screen.getByText('Thành phố Thủ Đức')).toBeOnTheScreen()
    }, 'live route: ETA and distance come from the route, and the address is not repeated as its own detail line')
  })

  it('hides the destination chip while the backend has not released the destination', () => {
    renderStageFour({ deal: releasedDeal('worker_matched'), routePreview: { ...liveRoute, hasRouteDestination: false, route: null } })

    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('stage4-destination-chip')).toBeNull()
      expect(screen.getByText('Chưa mở điểm đến')).toBeOnTheScreen()
    }, 'a job alone is not a released destination; the chip waits for the backend release')
  })

  it('switches to the arrival step once the worker is on the way', () => {
    const { runRouteAction } = renderStageFour({ deal: releasedDeal('worker_on_way'), routePreview: liveRoute })
    const primary = screen.getByTestId('stage4-primary')

    withPillarContext(PILLAR, () => {
      expect(screen.getByText('Xác nhận đã tới')).toBeOnTheScreen()
      expect(screen.getByText('Tôi đã có mặt tại điểm đến')).toBeOnTheScreen()
      expect(screen.getByText('Đang di chuyển đến địa điểm khách hàng')).toBeOnTheScreen()
      expect(screen.queryByText('Bắt đầu di chuyển')).toBeNull()
      fireEvent.press(primary)
      expect(runRouteAction).toHaveBeenCalledTimes(1)
    }, 'worker_on_way: the CTA must switch to arrival and still route through the existing action')
  })

  it('blocks a second press while an action is running', () => {
    const { runRouteAction } = renderStageFour({ actionBusy: true, deal: releasedDeal('worker_matched'), routePreview: liveRoute })
    const primary = screen.getByTestId('stage4-primary')

    withPillarContext(PILLAR, () => {
      expect(primary).toBeDisabled()
      expect(screen.getByText('Đang xử lý…')).toBeOnTheScreen()
      fireEvent.press(primary)
      expect(runRouteAction).not.toHaveBeenCalled()
    }, 'busy=true must block a second route transition')
  })

  it('shows the authenticated map in place of the unreleased-map card when a map exists', () => {
    renderStageFour({ deal: releasedDeal('worker_matched'), routePreview: { ...liveRoute, mapUri: 'https://example.invalid/map' } })

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('mock-authenticated-route-map')).toBeOnTheScreen()
      expect(screen.queryByTestId('stage4-route-map-empty')).toBeNull()
      expect(screen.queryByTestId('stage4-map-backdrop')).toBeNull()
    }, 'a real map replaces the empty-map card, and no decorative backdrop sits behind the header')
  })
})
