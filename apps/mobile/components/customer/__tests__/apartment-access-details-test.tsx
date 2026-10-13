import { render, screen } from '@testing-library/react-native'
import type { LocalWorkerProfileSummary } from '@nestscout/shared'

import { getCustomerThemeTokens } from '../customer-theme'
import { ApartmentAccessDetails } from '../kael-chat/apartment-access-controls'

const worker = {
  avatarUrl: null, fullName: 'Trần Văn Hùng', id: 'w1', rating: 4.8, totalJobs: 212,
} as LocalWorkerProfileSummary

function renderDetails(photoRefs?: readonly string[]) {
  return render(
    <ApartmentAccessDetails
      checkedInAt="2026-10-13T06:40:00.000Z"
      language="vi"
      photoRefs={photoRefs}
      tokens={getCustomerThemeTokens('light')}
      worker={worker}
    />,
  )
}

describe('ApartmentAccessDetails', () => {
  it('shows the worker\'s lobby photo with who they are and when they checked in', () => {
    renderDetails(['file:///lobby-1.jpg'])
    expect(screen.getByText('Trần Văn Hùng')).toBeTruthy()
    expect(screen.getByTestId('customer-v21-apartment-access-photos-tile-0')).toBeTruthy()
    expect(screen.getByTestId('customer-v21-case-apartment-access-checkin')).toBeTruthy()
  })

  it('shows no photo block when the server sent none', () => {
    renderDetails([])
    expect(screen.queryByTestId('customer-v21-apartment-access-photos-tile-0')).toBeNull()
    expect(screen.getByText('Trần Văn Hùng')).toBeTruthy()
  })
})
