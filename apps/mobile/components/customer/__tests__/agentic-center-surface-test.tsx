import { render, waitFor } from '@testing-library/react-native'

const mockReplace = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

import { CustomerAgenticCenterSurface } from '../agentic-center-surface'

describe('CustomerAgenticCenterSurface legacy bridge', () => {
  beforeEach(() => {
    mockReplace.mockClear()
  })

  it('redirects to the current Kael case-work route instead of rendering archived v21 UI', async () => {
    const { queryByTestId } = render(<CustomerAgenticCenterSurface />)

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case'))
    expect(queryByTestId('customer-v21-agentic-center')).toBeNull()
  })
})
