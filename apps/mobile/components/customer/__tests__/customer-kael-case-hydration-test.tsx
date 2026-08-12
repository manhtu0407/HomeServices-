import { act, render, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'

import { useCustomerCaseHydration } from '../kael-chat/use-customer-case-hydration'

function CaseHydrationProbe({
  accessToken,
  authLoading = false,
  hydrate,
}: {
  accessToken?: string
  authLoading?: boolean
  hydrate: (jobId: string, accessToken?: string) => Promise<boolean>
}) {
  const hydration = useCustomerCaseHydration({
    active: true,
    authLoading,
    hydrate,
    routeJobId: 'job-route-a',
    sessionAccessToken: accessToken,
  })

  return (
    <Text testID="case-hydration-status">
      {hydration.authRequired ? 'auth-required' : hydration.hydrating ? 'loading' : 'settled'}
    </Text>
  )
}

describe('customer Kael Case Work hydration', () => {
  it('waits for the rendered customer session and forwards its token to the job hydration', async () => {
    const hydrate = jest.fn(async () => true)
    const screen = render(
      <CaseHydrationProbe accessToken={undefined} authLoading hydrate={hydrate} />,
    )

    expect(hydrate).not.toHaveBeenCalled()
    screen.rerender(
      <CaseHydrationProbe accessToken="customer-session-token" authLoading={false} hydrate={hydrate} />,
    )

    await waitFor(() => {
      expect(hydrate).toHaveBeenCalledWith('job-route-a', 'customer-session-token')
    })
  })

  it('does not hydrate again when Supabase only refreshes the session token', async () => {
    const hydrate = jest.fn(async () => true)
    const screen = render(
      <CaseHydrationProbe accessToken="customer-session-token" hydrate={hydrate} />,
    )

    await waitFor(() => {
      expect(hydrate).toHaveBeenCalledTimes(1)
    })

    screen.rerender(
      <CaseHydrationProbe accessToken="customer-session-token-refreshed" hydrate={hydrate} />,
    )
    await act(async () => {})

    expect(hydrate).toHaveBeenCalledTimes(1)
  })

  it('does not hydrate again when auth loading flips after the job is already hydrated', async () => {
    const hydrate = jest.fn(async () => true)
    const screen = render(
      <CaseHydrationProbe accessToken="customer-session-token" authLoading hydrate={hydrate} />,
    )

    await waitFor(() => {
      expect(hydrate).toHaveBeenCalledTimes(1)
    })

    screen.rerender(
      <CaseHydrationProbe accessToken="customer-session-token" authLoading={false} hydrate={hydrate} />,
    )
    await act(async () => {})

    expect(hydrate).toHaveBeenCalledTimes(1)
  })

  it('does not start an unauthenticated route hydration after auth has settled', () => {
    const hydrate = jest.fn(async () => true)
    const screen = render(
      <CaseHydrationProbe accessToken={undefined} authLoading={false} hydrate={hydrate} />,
    )

    expect(hydrate).not.toHaveBeenCalled()
    expect(screen.getByTestId('case-hydration-status')).toHaveTextContent('auth-required')
  })
})
