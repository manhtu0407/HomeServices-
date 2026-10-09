import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { createElement } from 'react'
import type { WorkerProfileResponse } from '@/lib/api-types'

import { WorkerV5ServiceCardGrid } from '../profile/services-surfaces'

describe('worker service capability editing', () => {
  it('lets an approved worker add a declared skill and saves it with service preferences', async () => {
    const onSave = jest.fn().mockResolvedValue(true)
    const profile = {
      id: 'worker-active',
      service_types: ['hvac'],
      active_service_types: ['hvac'],
      selected_service_types: ['hvac'],
      service_quality: [],
      problem_specializations: [],
    } as unknown as WorkerProfileResponse

    render(createElement(WorkerV5ServiceCardGrid, {
      language: 'vi',
      onSave,
      profile,
      reduceTransparency: false,
    }))

    fireEvent.press(screen.getByTestId('worker-capability-hvac_fault_diagnosis'))
    fireEvent.press(screen.getByTestId('worker-v5-service-preferences-save'))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      selected_service_types: ['hvac'],
      problem_specializations: ['hvac_fault_diagnosis'],
    }))
    await waitFor(() => expect(screen.getByText('Đã lưu dịch vụ muốn nhận.')).toBeTruthy())
  })
})
