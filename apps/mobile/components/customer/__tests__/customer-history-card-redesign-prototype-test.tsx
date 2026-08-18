import { fireEvent, render, screen } from '@testing-library/react-native'

import { CustomerHistoryCardRedesignPrototype } from '../prototypes/customer-history-card-redesign-prototype'

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}))

jest.mock('@/lib/app-language', () => ({
  useAppLanguage: () => 'vi',
}))

jest.mock('../ui/shared-surfaces', () => ({
  V21Screen: ({ children, testID }: { children: React.ReactNode; testID: string }) => <>{<div data-testid={testID}>{children}</div>}</>,
  useCustomerV21SurfaceTheme: () => ({
    tokens: {
      border: '#D8EBE8',
      ghost: '#F3F8F7',
      muted: '#526B73',
      primary: '#08AF9C',
      raised: '#FFFFFF',
      service: '#E6F7F3',
      text: '#071A24',
    },
  }),
}))

jest.mock('@/components/ui/kael-primitives', () => ({
  KaelButton: ({ label, testID }: { label: string; testID: string }) => <button data-testid={testID}>{label}</button>,
}))

jest.mock('@/lib/format', () => ({
  formatVnd: () => '800.000 ₫',
}))

jest.mock('@/design/theme', () => ({
  typography: {
    caption1: {},
    callout: {},
    footnote: {},
    headline: {},
    subheadline: {},
    title2: {},
    title3: {},
  },
}))

describe('CustomerHistoryCardRedesignPrototype', () => {
  it('renders completed and cancelled cards without aura layers', () => {
    render(<CustomerHistoryCardRedesignPrototype />)

    expect(screen.getByTestId('customer-history-card-redesign-prototype-completed')).toBeTruthy()
    expect(screen.getByTestId('customer-history-card-redesign-prototype-cancelled')).toBeTruthy()
    expect(screen.getByTestId('customer-history-card-redesign-prototype-completed-state-mark')).toHaveStyle({ backgroundColor: '#FFFFFF', borderColor: '#071A24' })
    expect(screen.getByTestId('customer-history-card-redesign-prototype-completed-avatar-placeholder-icon')).toBeTruthy()
    expect(screen.getByTestId('customer-history-card-redesign-prototype-completed-avatar')).toHaveStyle({ backgroundColor: '#FFFFFF', borderColor: '#071A24' })
    expect(screen.getByTestId('customer-history-card-redesign-prototype-cancelled-state-mark')).toHaveStyle({ backgroundColor: '#FFFFFF' })
    expect(screen.getByTestId('customer-history-card-redesign-prototype-cancelled-status')).toHaveStyle({ backgroundColor: '#FFFFFF' })
    const favoriteButton = screen.getByTestId('customer-history-card-redesign-prototype-completed-favorite')
    expect(favoriteButton).toHaveStyle({ backgroundColor: '#FFFFFF' })
    expect(favoriteButton.props.accessibilityState).toEqual({ selected: false })
    fireEvent.press(favoriteButton)
    expect(favoriteButton.props.accessibilityState).toEqual({ selected: true })
    expect(screen.queryByText('HT')).toBeNull()
    expect(screen.getByText('Đã hoàn tất')).toBeTruthy()
    expect(screen.getByText('Đã hủy')).toBeTruthy()
    expect(screen.getByText('Lưu thợ')).toBeTruthy()
    expect(screen.getByText('800.000 ₫')).toBeTruthy()
    expect(screen.queryByTestId(/mint-aura|card-skin/)).toBeNull()
  })
})
