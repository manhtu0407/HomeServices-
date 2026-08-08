import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockBack = jest.fn()
const mockGetPublicCharter = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}))

jest.mock('@/lib/app-language', () => ({
  useAppLanguage: () => 'vi',
}))

jest.mock('@/lib/services', () => ({
  kaelCharterService: { getPublicCharter: (...args: unknown[]) => mockGetPublicCharter(...args) },
}))

import KaelCharterScreen from '../kael-charter'

beforeEach(() => {
  mockBack.mockReset()
  mockGetPublicCharter.mockReset()
  mockGetPublicCharter.mockResolvedValue({
    success: true,
    data: {
      charter_version: '2026-08-06.p11',
      identity_summary: 'Kael là trợ lý AI của NestScout.',
      locked_files: ['identity.md'],
      tunable_files: ['tone-matrix.yaml'],
      forbidden_categories: ['ai_refusal_hedge'],
      mission_values: ['Trust'],
    },
  })
})

describe('Kael public charter screen', () => {
  it('renders the live public charter and exposes its p11 version', async () => {
    render(<KaelCharterScreen />)
    await waitFor(() => expect(screen.getByTestId('kael-public-charter')).toBeTruthy())
    expect(screen.getByText('Phiên bản 2026-08-06.p11')).toBeTruthy()
    expect(screen.getByText('Kael là trợ lý AI của NestScout.')).toBeTruthy()
    expect(screen.getByText('• Tin cậy')).toBeTruthy()
    expect(screen.getByText('• identity.md')).toBeTruthy()
    expect(screen.getByText('• tone-matrix.yaml')).toBeTruthy()
  })

  it('returns through the router', () => {
    render(<KaelCharterScreen />)
    fireEvent.press(screen.getByTestId('kael-charter-back'))
    expect(mockBack).toHaveBeenCalledTimes(1)
  })
})
