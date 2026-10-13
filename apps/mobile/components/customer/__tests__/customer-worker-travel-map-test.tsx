import { fireEvent, render, screen } from '@testing-library/react-native'
import type { LocalWorkerTravel } from '@nestscout/shared'

import { getCustomerThemeTokens } from '../customer-theme'
import { CustomerWorkerTravelMap } from '../kael-chat/customer-worker-travel-map'
import { smoothPathData } from '../kael-chat/case-work-travel-model'

const NOW = Date.parse('2026-10-13T07:00:00.000Z')

const travel = (overrides: Partial<LocalWorkerTravel> = {}): LocalWorkerTravel => ({
  position: [10.8423, 106.8304],
  remainingMeters: 3300,
  remainingSeconds: 600,
  route: [[10.8406, 106.8271], [10.8411, 106.829], [10.8423, 106.8304], [10.8431, 106.8325], [10.849, 106.8421]],
  totalMeters: 5400,
  updatedAt: new Date(NOW - 20_000).toISOString(),
  ...overrides,
})

function renderMap(value: LocalWorkerTravel) {
  const view = render(
    <CustomerWorkerTravelMap
      destinationLabel="Nhà bạn"
      language="vi"
      now={NOW}
      reduceMotion
      tokens={getCustomerThemeTokens('light')}
      travel={value}
      workerName="Trần Văn Hùng"
    />,
  )
  fireEvent(screen.getByTestId('customer-v21-worker-travel-map'), 'layout', { nativeEvent: { layout: { height: 0, width: 360, x: 0, y: 0 } } })
  return view
}

describe('CustomerWorkerTravelMap', () => {
  it('keeps the name tags and shows the trip figures without a status pill or legend', () => {
    renderMap(travel())
    expect(screen.getByText('Trần Văn Hùng')).toBeTruthy()
    expect(screen.getByText('Nhà bạn')).toBeTruthy()
    for (const gone of ['Cập nhật vừa xong', 'Đã đi', 'Còn lại', 'Chim bay']) expect(screen.queryByText(gone)).toBeNull()
    expect(screen.getByTestId('customer-v21-worker-travel-eta').props.children).toBe('10 phút')
    expect(screen.getByTestId('customer-v21-worker-travel-remaining').props.children).toBe('3,3 km')
  })

  it('says the position is old instead of promising an arrival time', () => {
    renderMap(travel({ updatedAt: new Date(NOW - 10 * 60_000).toISOString() }))
    expect(screen.getByText('Vị trí cuối 10 phút trước. Giờ đến chỉ tính khi có vị trí mới')).toBeTruthy()
    expect(screen.getByTestId('customer-v21-worker-travel-eta').props.children).toBe('Đang chờ vị trí mới')
  })
})

describe('smoothPathData', () => {
  it('passes through every point as a curve and keeps short inputs straight', () => {
    expect(smoothPathData([])).toBe('')
    expect(smoothPathData([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('M1.0 2.0 L3.0 4.0')
    const path = smoothPathData([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }])
    expect(path.startsWith('M0.0 0.0 C')).toBe(true)
    expect(path.match(/C/g)).toHaveLength(2)
    expect(path.endsWith('20.0 0.0')).toBe(true)
  })
})
