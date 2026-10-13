import { render, screen } from '@testing-library/react-native'
import type { LocalDeal } from '@nestscout/shared'

import { TripSharingNotice } from '../jobs/active-body-surfaces'

const deal = (status: string) => ({ id: 'job-1', status }) as unknown as LocalDeal

describe('TripSharingNotice', () => {
  it('tells the worker the customer follows the trip and that the position is deleted on arrival', () => {
    render(<TripSharingNotice deal={deal('worker_on_way')} language="vi" locationStatus="ready" tripShared />)
    const text = screen.getByTestId('worker-v5-trip-sharing-notice').props.children
    expect(text).toMatch(/Khách đang theo dõi vị trí của bạn/)
    expect(text).toMatch(/xoá khi bạn tới nơi/)
  })

  it('says the trip is not shared when the phone gives no position', () => {
    render(<TripSharingNotice deal={deal('worker_on_way')} language="vi" locationStatus="denied" tripShared={null} />)
    expect(screen.getByTestId('worker-v5-trip-sharing-notice').props.children).toMatch(/khách chưa theo dõi được/)
  })

  it('does not claim sharing when GPS is ready but the server stored no position', () => {
    render(<TripSharingNotice deal={deal('worker_on_way')} language="vi" locationStatus="ready" tripShared={false} />)
    expect(screen.getByTestId('worker-v5-trip-sharing-notice').props.children).toMatch(/khách chưa theo dõi được/)
  })

  it('waits for the server receipt before saying anything', () => {
    render(<TripSharingNotice deal={deal('worker_on_way')} language="vi" locationStatus="ready" tripShared={null} />)
    expect(screen.queryByTestId('worker-v5-trip-sharing-notice')).toBeNull()
  })

  it('speaks English only in English mode', () => {
    render(<TripSharingNotice deal={deal('worker_on_way')} language="en" locationStatus="ready" tripShared />)
    expect(screen.getByTestId('worker-v5-trip-sharing-notice').props.children).toMatch(/customer follows your position/)
  })

  it.each([['worker_matched', 'ready'], ['arrived', 'ready'], ['worker_on_way', 'loading']] as const)('shows nothing for %s with location %s', (status, location) => {
    render(<TripSharingNotice deal={deal(status)} language="vi" locationStatus={location} tripShared />)
    expect(screen.queryByTestId('worker-v5-trip-sharing-notice')).toBeNull()
  })
})
