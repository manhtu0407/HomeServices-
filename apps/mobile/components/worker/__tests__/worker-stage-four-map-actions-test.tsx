import type { LocalDeal } from '@nestscout/shared'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Linking, Platform, Share, StyleSheet } from 'react-native'

import { buildDirectionsUrl } from '@/lib/route-navigation'

import { StageFourRouteOverlay } from '../jobs/stage-four-route-overlay'
import type { WorkerV5RoutePreviewState } from '../jobs/use-worker-route-preview'
import type { WorkerJobsLegacyPrototypeRuntime } from '../jobs/worker-jobs-zip-prototype-shared'
import { WorkerJobsProductionStageFour } from '../jobs/worker-jobs-zip-prototype-stage-four'
import { getWorkerThemeTokens } from '../worker-theme'

jest.mock('../jobs/route-map-surfaces', () => {
  const mockReact = jest.requireActual('react')
  const { View: MockView } = jest.requireActual('react-native')
  return {
    WorkerV5AuthenticatedRouteMapPreview: ({ overlay }: { overlay?: unknown }) =>
      mockReact.createElement(MockView, { testID: 'mock-authenticated-route-map' }, overlay),
  }
})

const tokens = getWorkerThemeTokens('light')
const origin = { latitude: 10.7769, longitude: 106.7009 }
const destination = { latitude: 10.7942, longitude: 106.7218 }

const deal = {
  backendStatus: 'worker_on_way',
  broadcast: {
    addressAccess: { release_stage: 'building_released' },
    broadcastId: 'b',
    fullAddressLabel: 'Tòa A, Vinhomes',
    fullAddressVisible: true,
    generalArea: 'Vinhomes',
    jobId: 'job-map',
    prebrief: [],
    problemSummary: 'Sửa điện',
    secondsRemaining: null,
    serviceType: 'electrical',
    status: 'accepted',
  },
  draft: { addressLabel: 'Tòa A', description: 'x', districtLabel: 'Bình Thạnh', mediaCount: 0, needsServiceChoice: false, problemChips: [], serviceType: 'electrical', source: 'kael', timeChoice: 'now' },
  estimate: null,
  id: 'job-map',
  scopeChange: null,
  status: 'worker_on_way',
} as unknown as LocalDeal

const liveMap: WorkerV5RoutePreviewState = {
  hasRouteDestination: true,
  locationStatus: 'ready',
  mapUri: 'https://example.invalid/map',
  origin,
  route: {
    destination,
    distanceMeters: 4200,
    durationSeconds: 960,
    fetchedAt: '2026-10-13T08:00:00.000Z',
    geometry: { type: 'LineString', coordinates: [[106.7009, 10.7769], [106.71, 10.785], [106.7218, 10.7942]] },
  },
}

function renderStageFour(routePreview: WorkerV5RoutePreviewState) {
  const runtime = { state: { deal, lastError: null } } as unknown as WorkerJobsLegacyPrototypeRuntime
  render(
    <WorkerJobsProductionStageFour
      actionBusy={false}
      language="vi"
      navigateActiveJobChat={jest.fn()}
      navigateJobChat={jest.fn()}
      navigateToScreen={jest.fn()}
      prototypeMode={false}
      reduceMotion={false}
      reduceTransparency={false}
      routePreview={routePreview}
      runRouteAction={jest.fn()}
      runtime={runtime}
    />,
  )
}

describe('Stage 4 map actions', () => {
  let openURL: jest.SpyInstance
  let share: jest.SpyInstance

  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction })
    openURL.mockClear()
    share.mockClear()
  })
  afterEach(() => jest.restoreAllMocks())

  it('opens turn-by-turn directions to the building from both direction controls', () => {
    renderStageFour(liveMap)
    const expected = buildDirectionsUrl(Platform.OS, destination)

    fireEvent.press(screen.getByTestId('stage4-map-directions'))
    fireEvent.press(screen.getByTestId('stage4-directions'))

    expect(openURL).toHaveBeenCalledTimes(2)
    expect(openURL).toHaveBeenNthCalledWith(1, expected)
    expect(openURL).toHaveBeenNthCalledWith(2, expected)
  })

  it('shares only the worker position through the system share sheet', () => {
    renderStageFour(liveMap)

    fireEvent.press(screen.getByTestId('stage4-share'))

    expect(share).toHaveBeenCalledTimes(1)
    const message = String(share.mock.calls[0][0].message)
    expect(message).toContain('10.776900,106.700900')
    expect(message).not.toContain('10.794200')
  })

  it('keeps directions and sharing off until a route and a position exist', () => {
    renderStageFour({ hasRouteDestination: true, locationStatus: 'loading', mapUri: null, origin: null, route: null })

    fireEvent.press(screen.getByTestId('stage4-directions'))
    fireEvent.press(screen.getByTestId('stage4-share'))

    expect(openURL).not.toHaveBeenCalled()
    expect(share).not.toHaveBeenCalled()
  })

  it('zooms the map in steps, stops at the limits and fits the whole route again', () => {
    renderStageFour(liveMap)
    const scaleOf = () => {
      const style = StyleSheet.flatten(screen.getByTestId('stage4-map-viewport').props.style) as { transform: { scale?: number }[] }
      return style.transform.find((entry) => entry.scale !== undefined)?.scale
    }

    expect(scaleOf()).toBe(1)
    expect(screen.getByTestId('stage4-map-zoom-out')).toBeDisabled()
    expect(screen.getByTestId('stage4-map-fit')).toBeDisabled()

    fireEvent.press(screen.getByTestId('stage4-map-zoom-in'))
    expect(scaleOf()).toBeCloseTo(1.5, 5)
    fireEvent.press(screen.getByTestId('stage4-map-zoom-in'))
    expect(scaleOf()).toBeCloseTo(2.25, 5)
    fireEvent.press(screen.getByTestId('stage4-map-zoom-in'))
    expect(scaleOf()).toBe(3)
    expect(screen.getByTestId('stage4-map-zoom-in')).toBeDisabled()

    fireEvent.press(screen.getByTestId('stage4-map-zoom-out'))
    expect(scaleOf()).toBeCloseTo(2, 5)
    expect(screen.getByTestId('stage4-map-fit')).toBeEnabled()

    fireEvent.press(screen.getByTestId('stage4-map-fit'))
    expect(scaleOf()).toBe(1)
    expect(screen.getByTestId('stage4-map-fit')).toBeDisabled()
  })

  it('does not offer the layers control, which has no behaviour', () => {
    renderStageFour(liveMap)

    expect(screen.queryByTestId('stage4-map-layers')).toBeNull()
    expect(screen.getByTestId('stage4-map-directions')).toBeEnabled()
  })

  it('draws the position, the building and the route over the live map', () => {
    renderStageFour(liveMap)

    expect(screen.getByTestId('stage4-route-overlay')).toBeOnTheScreen()
    expect(screen.getByTestId('stage4-route-line')).toBeOnTheScreen()
    expect(screen.getByTestId('stage4-route-origin')).toBeOnTheScreen()
    expect(screen.getByTestId('stage4-route-destination')).toBeOnTheScreen()
  })

  it('draws both markers without a line when the route geometry is missing', () => {
    render(<StageFourRouteOverlay destination={destination} geometry={null} origin={origin} tokens={tokens} />)

    expect(screen.queryByTestId('stage4-route-line')).toBeNull()
    expect(screen.getByTestId('stage4-route-origin')).toBeOnTheScreen()
    expect(screen.getByTestId('stage4-route-destination')).toBeOnTheScreen()
  })
})
