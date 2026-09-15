import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native'

import type { LocalDeal } from '@nestscout/shared'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

const mockInsets = { bottom: 34, left: 0, right: 0, top: 59 }

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockInsets,
}))

import { StageNineEmptyStage } from '../jobs/stage-nine/stage-nine-empty-stage'
import { STAGE_NINE_EMPTY_SAFE_AREA_EDGES, isStageNineEmptyScreen } from '../jobs/stage-nine/stage-nine-host'
import { isStageNineRecordEmpty, readStageNineRecordState } from '../jobs/stage-nine/stage-nine-model'
import { WorkerJobsLegacyPrototypeStageNineBody } from '../jobs/worker-jobs-zip-prototype-settlement-stages'
import type { WorkerJobsLegacyPrototypeRuntime } from '../jobs/worker-jobs-zip-prototype-shared'

export const PILLAR = {
  id: 'P185-worker-stage-nine-empty-record',
  invariant:
    'Production Stage 9 replaces only its empty completion record with the approved full-screen stage (scene, quote, title, body, and a text-only call to action; no header, process link, or arrow) whose call to action opens the existing Stage 8 flow without submitting, while every submitted, customer-confirmed, or payment state keeps the status layout that reads real data',
  authority: [
    'governance/RULES.md #8 (static empty-state copy may render only where nothing is recorded)',
    'governance/RULES.md #5 (one selected language per visible screen)',
    'governance/structures/worker-workflow.md B7 (completion evidence boundary)',
    'governance/protocols/frontend-test.md G1/G2 (layout and state coverage)',
  ],
  target: 'apps/mobile/components/worker/jobs/stage-nine/stage-nine-empty-stage.tsx',
  layer: 'ui-visual',
  siblings: ['P100-worker-stage-eight-production-fidelity', 'P33-worker-jobs-zip-prototype', 'P68-completion-payment-authority'],
  mutation:
    'drop the hasSubmittedArtifact conjunct from isStageNineRecordEmpty, or point the empty stage call to action at navigateNext — the submitted-record and Stage 8 routing cases turn red',
} as const satisfies PillarManifest

const APPROVED_SCENE_SHA256 = 'f7c80374b697d35c0254a1f0e5cae283eaaa5b9d5ff758202c15bdb103ff3574'
const VIETNAMESE_DIACRITIC = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu

const read = (relativePath: string) => readFileSync(resolve(__dirname, relativePath), 'utf8').replace(/\r\n/g, '\n')
const styleOf = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as StyleProp<TextStyle>) ?? {}
const layout = (width: number) => ({ nativeEvent: { layout: { height: 0, width, x: 0, y: 0 } } })
const deal = (fields: Record<string, unknown>) => ({ status: 'completed_by_worker', ...fields }) as unknown as LocalDeal
const runtimeWith = (dealValue: LocalDeal | null, lastError: string | null = null) =>
  ({ state: { deal: dealValue, lastError } }) as unknown as WorkerJobsLegacyPrototypeRuntime

function renderBody({
  dealValue = null,
  lastError = null,
  prototypeMode = false,
}: { dealValue?: LocalDeal | null; lastError?: string | null; prototypeMode?: boolean } = {}) {
  const navigateNext = jest.fn()
  const navigateToEvidence = jest.fn()
  render(
    <WorkerJobsLegacyPrototypeStageNineBody
      actionBusy={false}
      language="vi"
      navigateNext={navigateNext}
      navigateToEvidence={navigateToEvidence}
      prototypeMode={prototypeMode}
      reduceMotion={false}
      reduceTransparency={false}
      runtime={runtimeWith(dealValue, lastError)}
    />,
  )
  return { navigateNext, navigateToEvidence }
}

describe('Worker Stage 9 empty completion record', () => {
  it('treats the record as empty only while nothing downstream of completion exists', () => {
    const cases: [string, LocalDeal | null, boolean][] = [
      ['no job loaded', null, true],
      ['completed without hydrated evidence', deal({}), true],
      ['whitespace-only note', deal({ completionNotes: '   ' }), true],
      ['submitted photo', deal({ completionPhotoUrls: ['job-media/after-1.jpg'] }), false],
      ['submitted note', deal({ completionNotes: 'Đã thay ổ cắm' }), false],
      ['customer confirmed', deal({ status: 'confirmed_by_customer' }), false],
      ['payment recorded by the backend', deal({ backendStatus: 'paid', payment: { provider: 'platform_bank_manual', status: 'received' } }), false],
      ['legacy direct payment awaiting reconciliation', deal({ payment: { provider: 'direct_worker', status: 'direct_awaiting_worker_confirmation' } }), false],
    ]

    for (const [label, value, expected] of cases) {
      withPillarContext(PILLAR, () => {
        expect(isStageNineRecordEmpty(readStageNineRecordState(value))).toBe(expected)
      }, `${label} must ${expected ? '' : 'not '}count as an empty record`)
    }
  })

  it('renders the approved stage for an empty record and keeps the status layout once evidence exists', () => {
    renderBody()

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-stage-nine-empty')).toBeTruthy()
      expect(screen.queryByTestId('worker-v5-stage-nine-status-card')).toBeNull()
      expect(screen.queryByText('Trạng thái xử lý')).toBeNull()
      expect(screen.queryByText('Xem hồ sơ')).toBeNull()
      expect(screen.queryByText('Chờ khách xác nhận')).toBeNull()
    }, 'the empty record shows only the full-screen stage, never the retired cards and actions')

    screen.unmount()
    renderBody({ dealValue: deal({ completionNotes: 'Đã thay ổ cắm', completionPhotoUrls: ['job-media/after-1.jpg'] }) })

    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('worker-v5-stage-nine-empty')).toBeNull()
      expect(screen.getByTestId('worker-v5-stage-nine-status-card')).toBeTruthy()
      expect(screen.getByText('Đã gửi hồ sơ')).toBeTruthy()
      expect(screen.getByTestId('worker-v5-stage-nine-status-list')).toHaveTextContent(/2 mục/)
    }, 'a submitted record must keep reading its real evidence count and status rows')
  })

  it('opens the existing Stage 8 flow from the call to action without advancing the job', async () => {
    const { navigateNext, navigateToEvidence } = renderBody()

    await act(async () => {
      fireEvent.press(screen.getByTestId('worker-v5-stage-nine-empty-submit'))
    })

    withPillarContext(PILLAR, () => {
      expect(navigateToEvidence).toHaveBeenCalledTimes(1)
      expect(navigateNext).not.toHaveBeenCalled()
    }, '"Gửi hồ sơ ngay" opens the completion form; it never moves the job toward customer review')
  })

  it('keeps a workflow error visible inside the empty stage', () => {
    renderBody({ lastError: 'Không tải được công việc.' })

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-stage-nine-empty')).toBeTruthy()
      expect(screen.getByText('Chưa cập nhật được')).toBeTruthy()
      expect(screen.getByText('Không tải được công việc.')).toBeTruthy()
    }, 'a failed update must never be hidden behind the empty-state artwork')
  })

  it('renders the approved copy without the header, process link, or call-to-action arrow', () => {
    render(<StageNineEmptyStage language="vi" onSubmit={jest.fn()} />)

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-stage-nine-empty-quote')).toHaveTextContent('Mọi công việc tuyệt vời\nđều bắt đầu từ một hồ sơ.', { exact: true })
      expect(screen.getByTestId('worker-v5-stage-nine-empty-title')).toHaveTextContent('Chưa có hồ sơ đã gửi', { exact: true })
      expect(screen.getByTestId('worker-v5-stage-nine-empty-body')).toHaveTextContent('Gửi hồ sơ ngay để hệ thống ghi nhận\nvà bắt đầu hành trình cùng bạn.', { exact: true })
      expect(screen.getByTestId('worker-v5-stage-nine-empty-submit')).toHaveTextContent('Gửi hồ sơ ngay', { exact: true })
      expect(screen.getAllByRole('header')).toHaveLength(1)
      expect(screen.getAllByRole('button')).toHaveLength(1)
    }, 'Stage 9 keeps the approved strings, one screen heading, and a single action')

    withPillarContext(PILLAR, () => {
      expect(screen.queryByText('Hồ sơ')).toBeNull()
      expect(screen.queryByLabelText('Quay lại')).toBeNull()
      expect(screen.queryByText('Tìm hiểu quy trình xử lý')).toBeNull()
      expect(screen.queryByTestId('worker-v5-stage-nine-empty-navigation')).toBeNull()
      expect(screen.queryByTestId('worker-v5-stage-nine-empty-process')).toBeNull()
      expect(screen.queryByTestId('worker-v5-stage-nine-empty-submit-arrow')).toBeNull()
    }, 'the back chevron with "Hồ sơ", the process chevron with its link, and the arrow disc were removed by art direction')
  })

  it('keeps the approved geometry on the 390-wide reference and the tap floor on a 320 phone', () => {
    const view = render(<StageNineEmptyStage bottomClearance={63} language="vi" onSubmit={jest.fn()} />)
    fireEvent(screen.getByTestId('worker-v5-stage-nine-empty'), 'layout', layout(390))

    withPillarContext(PILLAR, () => {
      expect(styleOf(screen.getByTestId('worker-v5-stage-nine-empty-copy')).top).toBe(672)
      expect(styleOf(screen.getByTestId('worker-v5-stage-nine-empty-quote')).top).toBe(141)
      expect(styleOf(screen.getByTestId('worker-v5-stage-nine-empty-scene')).height).toBeCloseTo(672.887, 2)
      expect(styleOf(screen.getByTestId('worker-v5-stage-nine-empty-submit'))).toMatchObject({ borderRadius: 40, height: 76, marginHorizontal: 25, marginTop: 38 })
      expect(styleOf(screen.getByTestId('worker-v5-stage-nine-empty-submit-label')).transform).toEqual([{ scaleX: 0.9 }, { scaleY: 1.06 }])
      expect(styleOf(screen.getByTestId('worker-v5-stage-nine-empty-stage')).height).toBe(1055 + 63)
    }, 'removals keep every remaining element at its reference position, and the call-to-action label centres once the arrow is gone')

    view.rerender(<StageNineEmptyStage language="vi" onSubmit={jest.fn()} />)
    fireEvent(screen.getByTestId('worker-v5-stage-nine-empty'), 'layout', layout(320))

    withPillarContext(PILLAR, () => {
      expect(Number(styleOf(screen.getByTestId('worker-v5-stage-nine-empty-submit')).height)).toBeGreaterThanOrEqual(44)
      const sizes = screen.UNSAFE_getAllByType(Text).map((node) => Number(styleOf(node).fontSize))
      expect(Math.min(...sizes.filter(Number.isFinite))).toBeGreaterThanOrEqual(11)
    }, 'a 320pt phone scales the stage down but never below a 44pt action or 11pt text')
  })

  it('lets the stage own the top edge in Production and leaves it to the host in the review route', () => {
    renderBody()
    fireEvent(screen.getByTestId('worker-v5-stage-nine-empty'), 'layout', layout(390))

    withPillarContext(PILLAR, () => {
      expect(styleOf(screen.getByTestId('worker-v5-stage-nine-empty-quote')).top).toBe(141 + (59 - 34))
      expect(styleOf(screen.getByTestId('worker-v5-stage-nine-empty-stage')).height).toBe(1055 + (59 - 34) + 63)
    }, 'Production drops the SafeAreaView top edge, so content moves only by the inset beyond the 34pt the canvas reserves')

    screen.unmount()
    renderBody({ prototypeMode: true })
    fireEvent(screen.getByTestId('worker-v5-stage-nine-empty'), 'layout', layout(390))

    expect(styleOf(screen.getByTestId('worker-v5-stage-nine-empty-quote')).top).toBe(141)
    expect(styleOf(screen.getByTestId('worker-v5-stage-nine-empty-stage')).height).toBe(1055)
  })

  it('hides the shared worker header only for the empty Stage 9 record', () => {
    const flowSource = read('../worker-v5-flow.tsx')

    withPillarContext(PILLAR, () => {
      expect(flowSource).toContain('const usesStageNineEmptyProduction = isStageNineEmptyScreen(screen.id, runtime.state.deal)')
      expect(flowSource).toContain('usesStageNineEmptyProduction || usesStageFiveProduction || usesStageEightProduction || headerState.usesEarningsOverviewHandoff')
      expect(flowSource).toContain('edges={usesStageNineEmptyProduction ? STAGE_NINE_EMPTY_SAFE_AREA_EDGES : undefined}')
      expect(STAGE_NINE_EMPTY_SAFE_AREA_EDGES).not.toContain('top')
      expect(isStageNineEmptyScreen('2.11-completion-submitted', null)).toBe(true)
      expect(isStageNineEmptyScreen('2.10-completion-evidence', null)).toBe(false)
      expect(isStageNineEmptyScreen('2.11-completion-submitted', deal({ status: 'confirmed_by_customer' }))).toBe(false)
    }, 'the empty stage has no header row, so the shared back button and title must disappear exactly when the empty stage renders')
  })

  it('ignores a second press while the completion flow is still opening', async () => {
    let finish: () => void = () => undefined
    const onSubmit = jest.fn(() => new Promise<void>((resolveOpen) => {
      finish = resolveOpen
    }))
    render(<StageNineEmptyStage language="vi" onSubmit={onSubmit} />)

    fireEvent.press(screen.getByTestId('worker-v5-stage-nine-empty-submit'))
    fireEvent.press(screen.getByTestId('worker-v5-stage-nine-empty-submit'))

    withPillarContext(PILLAR, () => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('worker-v5-stage-nine-empty-submit')).toBeDisabled()
      expect(screen.getByTestId('worker-v5-stage-nine-empty-submit-label')).toHaveTextContent('Đang mở hồ sơ…', { exact: true })
    }, 'a double tap must not open the completion flow twice, and the label keeps showing progress without the arrow spinner')

    await act(async () => {
      finish()
    })
    fireEvent.press(screen.getByTestId('worker-v5-stage-nine-empty-submit'))
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('renders English without Vietnamese copy', () => {
    render(<StageNineEmptyStage language="en" onSubmit={jest.fn()} />)

    withPillarContext(PILLAR, () => {
      const copy = screen.UNSAFE_getAllByType(Text).map((node) => [node.props.children].flat().join(''))
      expect(copy.filter((text) => VIETNAMESE_DIACRITIC.test(text))).toEqual([])
      expect(screen.getByTestId('worker-v5-stage-nine-empty-title')).toHaveTextContent('No submitted record', { exact: true })
    }, 'the English selection must not leak a Vietnamese string from the approved design')
  })

  it('ships the approved scene unchanged', () => {
    const scene = readFileSync(resolve(__dirname, '../../../assets/worker-stage-nine/completion-empty-scene.png'))
    const assetSource = read('../jobs/stage-nine/stage-nine-assets.ts')

    withPillarContext(PILLAR, () => {
      expect(createHash('sha256').update(scene).digest('hex')).toBe(APPROVED_SCENE_SHA256)
      expect(assetSource).toContain("require('@/assets/worker-stage-nine/completion-empty-scene.png')")
    }, 'the raster scene must stay the extracted approved artwork, not a redrawn or regenerated substitute')
  })
})
