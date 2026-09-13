import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import type { FavoriteWorkerForMatching } from '@nestscout/shared'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { FindingWorkersReceipt } from '../kael-chat/finding-workers-receipt'
import { getCustomerThemeTokens } from '../customer-theme'

export const PILLAR = {
  id: 'P114-customer-matching-consent-ui',
  invariant: 'Saved-worker fallback needs an explicit accessible opt-in; unresolved actor/job-bound consent cannot be changed by reopening the sheet',
  authority: ['governance/RULES.md #7 (Customer confirmation)', 'governance/RULES.md #8 (no fake success)'],
  target: 'apps/mobile/components/customer/kael-chat/finding-workers-receipt.tsx',
  layer: 'integration',
  siblings: ['P111-customer-matching-selection-mobile', 'P112-saved-worker-fallback-sql'],
  mutation: 'Restore default auto_general:true; the saved-only callback assertion fails',
} as const satisfies PillarManifest

const WORKER = '33333333-3333-4333-8333-333333333333'
const JOB = '22222222-2222-4222-8222-222222222222'
const ID = 'customer-v21-finding-workers-'
const favorite: FavoriteWorkerForMatching = {
  id: WORKER, display_name: 'Thợ kiểm thử', availability: 'available', availability_reason: null,
  avatar_url: null, rating: null, total_jobs: 0,
}
type Props = ComponentProps<typeof FindingWorkersReceipt>

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    language: 'vi', matchingState: { stage: 'awaiting_choice', strategy: 'pending_choice', batch: null, checks: [], event_history: [] },
    selectionState: { jobId: JOB, scopeKey: `owner:${JOB}`, ready: true, choice: null },
    onChoosePreference: jest.fn(async () => true), onLoadSavedWorkers: jest.fn(async () => [favorite]),
    onRetry: jest.fn(), onStop: jest.fn(), reduceMotion: true, tokens: getCustomerThemeTokens('light'), ...overrides,
  }
  const view = render(<FindingWorkersReceipt {...props} />)
  return { props, ...view, rerenderProps: (next: Partial<Props>) => view.rerender(<FindingWorkersReceipt {...props} {...next} />) }
}

async function open() {
  fireEvent.press(screen.getByTestId(`${ID}saved-open`))
  await screen.findByTestId(`${ID}saved-select-${WORKER}`)
}

describe('Customer matching consent UI', () => {
  it('defaults to saved-only and never invents fallback consent', async () => {
    const view = setup()
    await open()
    expect(screen.getByRole('checkbox')).toHaveProp('accessibilityState', { checked: false, disabled: false })
    fireEvent.press(screen.getByTestId(`${ID}saved-select-${WORKER}`))
    await waitFor(() => withPillarContext(PILLAR, () => expect(view.props.onChoosePreference).toHaveBeenCalledWith({
      mode: 'saved_worker_first', worker_id: WORKER, auto_general: false,
    })))
  })

  it.each(['vi', 'en'] as const)('sends fallback only after explicit opt-in in %s', async (language) => {
    const view = setup({ language, tokens: getCustomerThemeTokens('dark') })
    await open()
    const label = language === 'vi' ? 'Cho phép tìm thợ khác nếu thợ đã chọn không nhận' : 'Allow other workers if the selected worker cannot accept'
    const checkbox = screen.getByRole('checkbox', { name: label })
    fireEvent.press(checkbox)
    expect(checkbox).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }))
    fireEvent.press(screen.getByTestId(`${ID}saved-select-${WORKER}`))
    await waitFor(() => expect(view.props.onChoosePreference).toHaveBeenCalledWith({
      mode: 'saved_worker_first', worker_id: WORKER, auto_general: true,
    }))
  })

  it('does not present an unavailable favorite as available; fallback requires opt-in', async () => {
    const view = setup({ onLoadSavedWorkers: jest.fn(async () => [{ ...favorite, availability: 'unavailable' as const }]) })
    await open()
    expect(screen.getByTestId(`${ID}saved-select-${WORKER}`)).toBeDisabled()
    fireEvent.press(screen.getByRole('checkbox'))
    expect(screen.getByText('Chưa thể nhận yêu cầu này')).toBeOnTheScreen()
    expect(screen.getByTestId(`${ID}saved-select-${WORKER}`)).toBeEnabled()
    fireEvent.press(screen.getByTestId(`${ID}saved-select-${WORKER}`))
    await waitFor(() => expect(view.props.onChoosePreference).toHaveBeenCalledWith(expect.objectContaining({ auto_general: true })))
  })

  it('prevents a second choice or consent toggle while the command is in flight', async () => {
    let finish!: (accepted: boolean) => void
    const view = setup({ onChoosePreference: jest.fn(() => new Promise<boolean>((resolve) => { finish = resolve })) })
    await open()
    fireEvent.press(screen.getByTestId(`${ID}saved-select-${WORKER}`))
    fireEvent.press(screen.getByTestId(`${ID}saved-select-${WORKER}`))
    fireEvent.press(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).toHaveProp('accessibilityState', { checked: false, disabled: true })
    expect(view.props.onChoosePreference).toHaveBeenCalledTimes(1)
    await act(async () => { finish(true) })
  })

  it('resets unsubmitted opt-in when the sheet is closed and reopened', async () => {
    setup()
    await open()
    fireEvent.press(screen.getByRole('checkbox'))
    fireEvent.press(screen.getByTestId(`${ID}sheet-close`))
    await open()
    expect(screen.getByRole('checkbox')).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }))
  })

  it('locks both choices while restoring storage or reconciling saved consent', () => {
    const view = setup({ selectionState: { jobId: JOB, scopeKey: `owner:${JOB}`, ready: false, choice: null } })
    expect(screen.getByTestId(`${ID}saved-open`)).toBeDisabled()
    expect(screen.getByTestId(`${ID}general`)).toBeDisabled()
    view.rerenderProps({ selectionState: {
      jobId: JOB, scopeKey: `owner:${JOB}`, ready: true,
      choice: { mode: 'saved_worker_first', worker_id: WORKER, auto_general: true },
    } })
    expect(screen.getByTestId(`${ID}general`)).toBeDisabled()
    expect(screen.getByTestId(`${ID}selection-reconcile`)).toHaveTextContent(/cho phép tìm thợ khác/)
    fireEvent.press(screen.getByTestId(`${ID}general`))
    expect(view.props.onChoosePreference).not.toHaveBeenCalled()
  })

  it('shows the persisted choice instead of an editable draft after an unknown outcome', async () => {
    const view = setup({ onChoosePreference: jest.fn(async () => false) })
    await open()
    fireEvent.press(screen.getByRole('checkbox'))
    await act(async () => { fireEvent.press(screen.getByTestId(`${ID}saved-select-${WORKER}`)) })
    view.rerenderProps({ selectionState: {
      jobId: JOB, scopeKey: `owner:${JOB}`, ready: true,
      choice: { mode: 'saved_worker_first', worker_id: WORKER, auto_general: true },
    } })
    expect(screen.getByRole('checkbox')).toHaveProp('accessibilityState', { checked: true, disabled: true })
    fireEvent.press(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).toHaveProp('accessibilityState', expect.objectContaining({ checked: true }))
    expect(view.props.onChoosePreference).toHaveBeenCalledTimes(1)
  })

  it('does not reuse the open sheet or draft consent across account/job scope', async () => {
    const view = setup()
    await open()
    fireEvent.press(screen.getByRole('checkbox'))
    view.rerenderProps({ selectionState: { jobId: JOB, scopeKey: `other-owner:${JOB}`, ready: true, choice: null } })
    expect(screen.queryByTestId(`${ID}sheet`)).toBeNull()
    await open()
    expect(screen.getByRole('checkbox')).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }))
  })

  it('does not let an older saved-worker response overwrite a reopened sheet', async () => {
    let finish!: (workers: FavoriteWorkerForMatching[]) => void
    setup({ onLoadSavedWorkers: jest.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
      .mockResolvedValueOnce([favorite]) })
    fireEvent.press(screen.getByTestId(`${ID}saved-open`))
    fireEvent.press(screen.getByTestId(`${ID}sheet-close`))
    await open()
    await act(async () => { finish([]) })
    expect(screen.getByTestId(`${ID}saved-select-${WORKER}`)).toBeOnTheScreen()
  })

  it('never invents a zero recipient count when delivery evidence is missing', () => {
    setup({ matchingState: { stage: 'general_search', strategy: 'general', batch: null, checks: [],
      event_history: [{ kind: 'general_batch_sent', occurred_at: '2026-09-05T01:00:00.000Z' }] } })
    expect(screen.queryByText(/đến 0 thợ/)).toBeNull()
    expect(screen.getByTestId(`${ID}timeline`)).toHaveTextContent(/đối chiếu số thợ/)
  })
})
