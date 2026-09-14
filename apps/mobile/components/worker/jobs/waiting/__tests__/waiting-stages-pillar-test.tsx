import { fireEvent, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { waitingCopy } from '../waiting-copy'
import { buildWaitingModel } from '../waiting-model'
import { WaitingContent } from '../waiting-content'
import { readWaitingClock } from '../waiting-time'
import { waitingAssets } from '../waiting-assets'
import { waitingTokens } from '../waiting-tokens'

export const PILLAR = {
  id: 'P183-worker-waiting-stages',
  invariant: 'Production Worker Stage 3 and Stage 7 share the approved waiting surface without sharing workflow decisions, deadlines, or unauthorized actions',
  authority: [
    'governance/RULES.md (workflow integrity, data honesty, and Vietnamese-first UI)',
    'governance/protocols/frontend-test.md G1-G4 (layout, state, accessibility, and native runtime)',
    'NestScout_Waiting_Stages/STAGE_SEPARATION.md (independent stage keys and server-owned decisions)',
  ],
  target: 'apps/mobile/components/worker/jobs/waiting',
  layer: 'ui-visual',
  siblings: ['P33-worker-jobs-zip-prototype', 'P08-worker-dock-motion', 'P07-worker-verification-states'],
  mutation: 'treat a worker_matched job as an approved Stage 7 scope change or replace the Stage 3 waiting key; the separation and Production wiring assertions turn red',
} as const satisfies PillarManifest

const scopeCreatedAt = '2026-09-14T04:00:00.000Z'

describe('Production Worker waiting stages', () => {
  it('keeps Stage 3 and Stage 7 as independent decisions for the same job', () => {
    const stageThree = buildWaitingModel('customer-confirmation', {
      jobId: 'job-1',
      jobStatus: 'worker_candidate_pending',
      scope: { status: 'approved_by_customer', createdAt: scopeCreatedAt },
    })
    const stageSeven = buildWaitingModel('scope-approval', {
      jobId: 'job-1',
      jobStatus: 'worker_matched',
      scope: { status: 'pending', createdAt: scopeCreatedAt },
    })

    withPillarContext(PILLAR, () => {
      expect(stageThree.state).toBe('waiting')
      expect(stageSeven.state).toBe('unavailable')
      expect(stageThree.kind).not.toBe(stageSeven.kind)
      expect(stageThree.clock.requestKey).not.toBe(stageSeven.clock.requestKey)
    }, 'candidate confirmation must not consume scope approval')
  })

  it('uses the scope timestamp only for Stage 7 and stays unknown without a Stage 3 deadline', () => {
    const stageThree = buildWaitingModel('customer-confirmation', {
      jobId: 'job-1',
      jobStatus: 'worker_candidate_pending',
    })
    const stageSeven = buildWaitingModel('scope-approval', {
      jobId: 'job-1',
      jobStatus: 'scope_change_pending',
      scope: { status: 'pending', createdAt: scopeCreatedAt },
    })

    withPillarContext(PILLAR, () => {
      expect(stageThree.clock.startedAt).toBeNull()
      expect(readWaitingClock(stageThree.clock, Date.parse(scopeCreatedAt)).text).toBe('--:--')
      expect(stageSeven.clock.startedAt).toBe(scopeCreatedAt)
      expect(readWaitingClock(stageSeven.clock, Date.parse(scopeCreatedAt) + 125_000)).toMatchObject({
        mode: 'elapsed',
        text: '02:05',
      })
    }, 'absence of a candidate timestamp cannot become a fabricated countdown')
  })

  it('does not turn an expired display into an approval', () => {
    const model = buildWaitingModel('scope-approval', {
      jobId: 'job-1',
      jobStatus: 'scope_change_pending',
      scope: { status: 'pending', createdAt: scopeCreatedAt },
      timing: {
        expiresAt: Date.parse(scopeCreatedAt) + 60_000,
      },
    })
    const reading = readWaitingClock(model.clock, Date.parse(scopeCreatedAt) + 61_000)

    withPillarContext(PILLAR, () => {
      expect(reading.expired).toBe(true)
      expect(model.state).toBe('waiting')
      expect(waitingCopy(model, reading, 'vi').body).toContain('hệ thống xác nhận')
    }, '00:00 only changes the copy; the backend still owns the decision')
  })

  it('keeps Stage 7 runtime copy about a scope proposal', () => {
    const model = buildWaitingModel('scope-approval', {
      jobId: 'job-1',
      jobStatus: 'scope_change_pending',
      scope: { status: 'pending', createdAt: scopeCreatedAt },
    })
    const copy = waitingCopy(model, readWaitingClock(model.clock, Date.parse(scopeCreatedAt) + 5_000), 'vi')

    withPillarContext(PILLAR, () => {
      expect(copy.body).toContain('đề xuất thay đổi')
      expect(copy.body).toContain('phần phát sinh')
      expect(copy.body).not.toContain('kết quả công việc')
    }, 'Stage 7 is not the completion-review stage')
  })

  it('renders the shared native surface and exposes only its own navigation callbacks', () => {
    const onBack = jest.fn()
    const onOpenDetails = jest.fn()
    const model = buildWaitingModel('customer-confirmation', {
      jobId: 'job-1',
      jobStatus: 'worker_candidate_pending',
    })

    render(
      <WaitingContent
        model={model}
        language="vi"
        onBack={onBack}
        onOpenDetails={onOpenDetails}
        previewNowMs={Date.parse('2026-09-14T04:00:00.000Z')}
        reduceMotion
      />,
    )

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('waiting-customer-confirmation')).toBeOnTheScreen()
      expect(screen.getByText('Đang chờ khách xác nhận')).toBeOnTheScreen()
      expect(screen.getByTestId('waiting-time-customer-confirmation')).toHaveTextContent('--:--')
    }, 'Stage 3 must render the supplied waiting composition in the RN tree')

    fireEvent.press(screen.getByTestId('waiting-back-customer-confirmation'))
    fireEvent.press(screen.getByTestId('waiting-details-customer-confirmation'))

    withPillarContext(PILLAR, () => {
      expect(onBack).toHaveBeenCalledTimes(1)
      expect(onOpenDetails).toHaveBeenCalledTimes(1)
    }, 'back and details remain host callbacks, not workflow mutations')
  })

  it('keeps the back control at the top while offsetting the shared body composition', () => {
    const model = buildWaitingModel('scope-approval', {
      jobId: 'job-1',
      jobStatus: 'scope_change_pending',
      scope: { status: 'pending', createdAt: scopeCreatedAt },
    })

    render(<WaitingContent model={model} language="vi" onBack={jest.fn()} onOpenDetails={jest.fn()} reduceMotion />)

    const scale = 390 / waitingTokens.width
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('waiting-header-scope-approval')).toHaveStyle({ height: 82 * scale, paddingTop: 11 * scale })
      expect(screen.getByTestId('waiting-body-scope-approval')).toHaveStyle({ paddingTop: waitingTokens.layout.bodyOffset * scale })
      expect(screen.getByTestId('waiting-scope-approval')).toHaveStyle({ minHeight: (waitingTokens.contentHeight + waitingTokens.layout.bodyOffset) * scale })
    }, 'navigation stays fixed while both waiting stages share the same centered body offset')
  })

  it('keeps both approved artwork pairs locally resolvable', () => {
    withPillarContext(PILLAR, () => {
      expect(waitingAssets['customer-confirmation'].hero).toBeTruthy()
      expect(waitingAssets['customer-confirmation'].footer).toBeTruthy()
      expect(waitingAssets['scope-approval'].hero).toBeTruthy()
      expect(waitingAssets['scope-approval'].footer).toBeTruthy()
    }, 'native assets must resolve without importing preview HTML or remote media')
  })
})
