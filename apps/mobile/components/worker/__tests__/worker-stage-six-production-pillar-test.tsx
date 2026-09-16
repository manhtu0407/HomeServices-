import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'
import { Image } from 'expo-image'
import Svg from 'react-native-svg'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { STAGE_MAX_FONT_MULTIPLIER, STAGE_MIN_FONT_SIZE, STAGE_MIN_TAP_SIZE } from '../jobs/stage-ratio'
import { StageSixTimeline, type StageSixTimelineProps } from '../jobs/stage-six/stage-six-timeline'
import { stageSixTokens } from '../jobs/stage-six/stage-six-tokens'

export const PILLAR = {
  id: 'P193-worker-stage-six-production',
  invariant:
    'Production Stage 6 renders the approved Timeline Card with bare enlarged glyphs and no shared header, progress rail, or stage tabs, scales the phone artboard to the device under the stage-ratio type and tap floors, shows only real draft, evidence, and workflow-formatted price values, and keeps drafts, evidence photos, and the no-change gate on the existing workflow handlers',
  authority: [
    'governance/RULES.md #5 (Vietnamese-first, no mixed language) and #8 (no fake data)',
    'governance/protocols/frontend-test.md G2 (state coverage, accessibility, Reduce Motion)',
    'the approved Mẫu 4 Timeline Card in NestScout-Timeline-Source.zip',
  ],
  target: 'apps/mobile/components/worker/jobs/stage-six/stage-six-timeline.tsx',
  layer: 'ui-visual',
  siblings: ['P33-worker-jobs-zip-prototype', 'P165-worker-stage-five-production', 'P100-worker-stage-eight-production-fidelity'],
  mutation:
    'let the primary action ignore primaryDisabled, open the editor while canEdit is false, render the shared header, the Nhận–Đóng rail, or invented values again, or route Stage 6 back to the retired proposal card; the gate, copy, and wiring assertions turn red',
} as const satisfies PillarManifest

const read = (relativePath: string) => readFileSync(resolve(__dirname, relativePath), 'utf8').replace(/\r\n/g, '\n')

function renderTimeline(overrides: Partial<StageSixTimelineProps> = {}) {
  const handlers = {
    onAddAttachment: jest.fn(),
    onAskKael: jest.fn(),
    onEdit: jest.fn(),
    onPrimary: jest.fn(),
  }
  const props: StageSixTimelineProps = {
    attachmentCount: 0,
    busy: false,
    canEdit: true,
    evidenceCount: 0,
    itemSummary: null,
    language: 'vi',
    priceLabel: 'Chờ Kael tính giá',
    primaryDisabled: false,
    primaryLabel: 'Không phát sinh',
    reason: null,
    reduceMotion: false,
    ...handlers,
    ...overrides,
  }
  const view = render(<StageSixTimeline {...props} />)
  return { handlers, props, view }
}

describe('Worker Stage 6 Production Timeline Card', () => {
  it('renders the approved empty copy without the retired progress rail', () => {
    renderTimeline()

    withPillarContext(PILLAR, () => {
      for (const copy of [
        'Đề xuất thay đổi',
        'Phạm vi công việc',
        'Kael hỗ trợ soạn',
        'Hạng mục bổ sung',
        'Chưa có bản nháp thật',
        'Lý do',
        'Chưa có lý do thật',
        'Bằng chứng',
        'Chưa có ảnh',
        'Khoảng giá',
        'Chờ Kael tính giá',
        'Chưa có',
        'Thêm file, ảnh (nếu có)',
        'Chỉnh sửa',
        'Không phát sinh',
      ]) {
        expect(screen.getByText(copy)).toBeOnTheScreen()
      }
      for (const retired of ['Nhận', 'Đến', 'Làm', 'Duyệt', 'Đóng', 'Bước 6 · Đổi phạm vi', 'Bước 7 · Chờ duyệt']) {
        expect(screen.queryByText(retired)).toBeNull()
      }
      expect(screen.getByTestId('worker-v5-stage-six-proposal-card')).toBeOnTheScreen()
      expect(screen.getByRole('header', { name: 'Phạm vi công việc' })).toBeOnTheScreen()
    }, 'the empty state must match the Timeline Card copy and carry neither the Nhận–Đóng rail nor duplicated stage tabs')
  })

  it('shows real draft, evidence counts, and the workflow price verbatim', () => {
    const { view, props } = renderTimeline({
      attachmentCount: 2,
      evidenceCount: 2,
      itemSummary: '  Thay đúng hai bản lề nứt.  ',
      priceLabel: '300.000 VND',
      reason: 'Hai khớp bản lề đã nứt.',
    })

    withPillarContext(PILLAR, () => {
      expect(screen.getByText('Thay đúng hai bản lề nứt.')).toBeOnTheScreen()
      expect(screen.getByText('Hai khớp bản lề đã nứt.')).toBeOnTheScreen()
      expect(screen.getByText('2 ảnh đính kèm')).toBeOnTheScreen()
      expect(screen.getByText('2 tệp đính kèm')).toBeOnTheScreen()
      expect(screen.getByText('Chọn lại file, ảnh')).toBeOnTheScreen()
      expect(screen.getByText('300.000 VND')).toBeOnTheScreen()
      expect(screen.queryByText('Chờ Kael tính giá')).toBeNull()
    }, 'values come from the workflow as given; the surface must not rewrite or invent them')

    view.rerender(<StageSixTimeline {...props} evidenceCount={Number.NaN} attachmentCount={-3} priceLabel="   " />)

    withPillarContext(PILLAR, () => {
      expect(screen.getByText('Chưa có ảnh')).toBeOnTheScreen()
      expect(screen.getByText('Chưa có')).toBeOnTheScreen()
      expect(screen.getByText('Chờ Kael tính giá')).toBeOnTheScreen()
    }, 'unsafe counts and a blank price fall back to the honest empty copy, never to 0 or a fabricated range')
  })

  it('routes every control to its host handler and keeps the no-change gate closed until the workflow opens it', () => {
    const { handlers, props, view } = renderTimeline({ primaryDisabled: true })

    fireEvent.press(screen.getByTestId('worker-v5-stage-six-edit-action'))
    fireEvent.press(screen.getByTestId('worker-v5-stage-six-row-items'))
    fireEvent.press(screen.getByTestId('worker-v5-stage-six-row-reason'))
    fireEvent.press(screen.getByTestId('worker-v5-stage-six-row-evidence'))
    fireEvent.press(screen.getByTestId('worker-v5-stage-six-attachment'))
    fireEvent.press(screen.getByTestId('worker-v5-stage-six-row-price'))
    fireEvent.press(screen.getByTestId('worker-v5-stage-six-kael-action'))
    fireEvent.press(screen.getByTestId('worker-v5-stage-six-primary-action'))

    withPillarContext(PILLAR, () => {
      expect(handlers.onEdit).toHaveBeenCalledTimes(3)
      expect(handlers.onAddAttachment).toHaveBeenCalledTimes(2)
      expect(handlers.onAskKael).toHaveBeenCalledTimes(2)
      expect(screen.getByTestId('worker-v5-stage-six-primary-action')).toBeDisabled()
      expect(handlers.onPrimary).not.toHaveBeenCalled()
    }, 'primaryDisabled=true must block Không phát sinh; it is the release gate that stops an empty proposal reaching approval wait')

    view.rerender(<StageSixTimeline {...props} primaryDisabled={false} />)
    fireEvent.press(screen.getByTestId('worker-v5-stage-six-primary-action'))

    withPillarContext(PILLAR, () => {
      expect(handlers.onPrimary).toHaveBeenCalledTimes(1)
    }, 'once the workflow opens the gate the primary action reaches the host exactly once')
  })

  it('locks every scope-editor path when editing is closed and every control while Kael is busy', () => {
    const { handlers, props, view } = renderTimeline({ canEdit: false })

    withPillarContext(PILLAR, () => {
      for (const testID of [
        'worker-v5-stage-six-edit-action',
        'worker-v5-stage-six-attachment',
        'worker-v5-stage-six-row-items',
        'worker-v5-stage-six-row-reason',
        'worker-v5-stage-six-row-evidence',
      ]) {
        expect(screen.getByTestId(testID)).toBeDisabled()
      }
      expect(screen.getByTestId('worker-v5-stage-six-kael-action')).not.toBeDisabled()
      expect(screen.getByTestId('worker-v5-stage-six-row-price')).not.toBeDisabled()
    }, 'canEdit=false closes the draft rows, the attachment tile, and Chỉnh sửa, but Kael stays reachable')

    fireEvent.press(screen.getByTestId('worker-v5-stage-six-attachment'))
    expect(handlers.onAddAttachment).not.toHaveBeenCalled()

    view.rerender(<StageSixTimeline {...props} busy canEdit primaryLabel="Kael đang tính..." />)

    withPillarContext(PILLAR, () => {
      for (const testID of [
        'worker-v5-stage-six-edit-action',
        'worker-v5-stage-six-attachment',
        'worker-v5-stage-six-kael-action',
        'worker-v5-stage-six-row-items',
        'worker-v5-stage-six-row-price',
        'worker-v5-stage-six-primary-action',
      ]) {
        expect(screen.getByTestId(testID)).toBeDisabled()
      }
      expect(screen.getByTestId('worker-v5-stage-six-primary-busy')).toBeOnTheScreen()
      expect(screen.getByText('Kael đang tính...')).toBeOnTheScreen()
      expect(screen.getByTestId('worker-v5-stage-six-primary-action')).toBeBusy()
    }, 'busy must disable every control and show progress in place of the check mark')
  })

  it('keeps English mode free of Vietnamese copy and clips the handwritten Vietnamese caption', () => {
    const { props, view } = renderTimeline()
    const vietnameseHeight = StyleSheet.flatten(screen.getByTestId('worker-v5-stage-six-workart').props.style).height as number

    view.rerender(<StageSixTimeline {...props} language="en" priceLabel="Waiting for Kael estimate" primaryLabel="No scope issue" />)
    const englishHeight = StyleSheet.flatten(screen.getByTestId('worker-v5-stage-six-workart').props.style).height as number

    withPillarContext(PILLAR, () => {
      for (const copy of ['Change proposal', 'Work scope', 'Kael drafts', 'Additional scope', 'No real draft', 'Price range', 'None', 'Edit', 'No scope issue']) {
        expect(screen.getByText(copy)).toBeOnTheScreen()
      }
      for (const vietnamese of ['Phạm vi công việc', 'Kael hỗ trợ soạn', 'Chưa có', 'Chỉnh sửa', 'Thêm file, ảnh (nếu có)']) {
        expect(screen.queryByText(vietnamese)).toBeNull()
      }
      expect(englishHeight).toBe(Math.round(vietnameseHeight * stageSixTokens.workartIllustrationRatio))
      expect(englishHeight).toBeLessThan(vietnameseHeight)
    }, 'English mode must not show Vietnamese text, including the caption painted into the workart')
  })

  it('keeps Stage 6 on the existing workflow handlers and release gate in Production', () => {
    const bodySource = read('../jobs/worker-jobs-zip-prototype-work-stages.tsx')
    const flowSource = read('../worker-v5-flow.tsx')
    const surfaceSource = read('../jobs/worker-jobs-zip-prototype-surface.tsx')
    const timelineSource = read('../jobs/stage-six/stage-six-timeline.tsx')

    withPillarContext(PILLAR, () => {
      expect(flowSource).toContain("const usesStageSixProduction = screen.id === '2.8-scope-change' && scopeMode !== 'edit'")
      expect(flowSource).toContain('usesStageSixProduction || usesStageFiveProduction || usesStageEightProduction ||')
    }, 'the Timeline Card opens without the shared back/title/subtitle header, while the scope editor keeps it as its only exit')

    withPillarContext(PILLAR, () => {
      expect(bodySource).toContain('<StageSixTimeline')
      expect(bodySource).toContain('primaryDisabled={proposalSubmitted || !proposalReady || scopeChange.scopeQuoting}')
      expect(bodySource).toContain('canEdit={!secondaryDisabled}')
      expect(bodySource).toContain('onEdit={scopeChange.onOpenScopeEditPath}')
      expect(bodySource).toContain('onAddAttachment={() => void scopeChange.onAddPhotos()}')
      expect(bodySource).toContain('scopeChange={scopeChange}')
      expect(bodySource).toContain('onAskKael={navigateJobChat}')
      expect(bodySource).toContain('busy={scopeChange.scopeQuoting || scopeChange.scopeProposing}')
      expect(bodySource).not.toContain('WorkerV5ProgressRail')
      expect(bodySource).not.toContain('stageProposalCard')
      expect(surfaceSource).toContain('reduceMotion={props.reduceMotion}')
      expect(timelineSource).not.toContain('formatVnd')
      expect(timelineSource).not.toContain('Bước')
      expect(timelineSource).toContain('const pressedStyle = reduceMotion ? styles.pressedStatic : styles.pressed')
      expect(timelineSource).toContain('pressedStatic: { opacity: 0.88 }')
    }, 'Stage 6 is a presentational swap: drafts, evidence photos, Kael chat, and the no-change gate stay on the workflow hook, and Reduce Motion drops the press scale')
  })

  it('draws bare enlarged glyphs, keeps the Kael icon and label on one line, and holds the house type and tap floors', () => {
    const { view, props } = renderTimeline()

    const slotScale = (testID: string, canvasHeight: number) => (StyleSheet.flatten(screen.getByTestId(testID).props.style).height as number) / canvasHeight
    const glyphSize = (testID: string) => screen.getByTestId(testID).findByType(Svg).props.width as number
    const heroScale = slotScale('worker-v5-stage-six-hero-icon', 44)

    withPillarContext(PILLAR, () => {
      for (const testID of ['worker-v5-stage-six-hero-icon', 'worker-v5-stage-six-attachment-icon']) {
        expect(StyleSheet.flatten(screen.getByTestId(testID).props.style).backgroundColor).toBeUndefined()
      }
      for (const key of ['items', 'reason', 'evidence', 'price']) {
        const node = StyleSheet.flatten(screen.getByTestId(`worker-v5-stage-six-node-${key}`).props.style)
        expect(node.backgroundColor).toBe(stageSixTokens.colors.surface)
        expect(node.borderWidth).toBeUndefined()
      }
      expect(glyphSize('worker-v5-stage-six-hero-icon')).toBeCloseTo(27 * heroScale * stageSixTokens.glyphScale, 5)
      expect(glyphSize('worker-v5-stage-six-node-items')).toBeCloseTo(18 * heroScale * stageSixTokens.glyphScale, 5)
      expect(glyphSize('worker-v5-stage-six-attachment-icon')).toBeCloseTo(23 * heroScale * stageSixTokens.glyphScale, 5)
      expect(StyleSheet.flatten(screen.getByTestId('worker-v5-stage-six-kael-action').props.style).flexDirection).toBe('row')
      const plus = StyleSheet.flatten(screen.getByTestId('worker-v5-stage-six-attachment-plus').props.style)
      expect(plus.width).toBe(plus.height)
      expect(plus.borderRadius as number).toBeLessThan((plus.height as number) / 2)
    }, 'the tinted icon tiles are gone, each glyph is drawn 1.25× inside its unchanged slot, Kael reads as one line, and the add button is a rounded square')

    withPillarContext(PILLAR, () => {
      for (const text of screen.UNSAFE_getAllByType(Text)) {
        expect(text.props.maxFontSizeMultiplier).toBe(STAGE_MAX_FONT_MULTIPLIER)
        expect(StyleSheet.flatten(text.props.style).fontSize).toBeGreaterThanOrEqual(STAGE_MIN_FONT_SIZE)
      }
      for (const testID of ['worker-v5-stage-six-edit-action', 'worker-v5-stage-six-primary-action', 'worker-v5-stage-six-row-items']) {
        expect(StyleSheet.flatten(screen.getByTestId(testID).props.style).minHeight).toBeGreaterThanOrEqual(STAGE_MIN_TAP_SIZE)
      }
    }, 'Dynamic Type is capped at the stage-ratio multiplier, no copy drops under the 11pt floor, and phone tap targets stay at least 44pt')

    view.rerender(<StageSixTimeline {...props} language="en" />)
    withPillarContext(PILLAR, () => {
      expect(StyleSheet.flatten(screen.getByTestId('worker-v5-stage-six-kael-action').props.style).flexDirection).toBe('row')
    })
  })

  it('scales the approved phone artboard with the device instead of fixed pixels', () => {
    const timelineSource = read('../jobs/stage-six/stage-six-timeline.tsx')
    const ratioSource = read('../jobs/stage-ratio.ts')

    withPillarContext(PILLAR, () => {
      expect(ratioSource).toContain('stageSix: STAGE_REFERENCE_WIDTH / 370,')
      expect(stageSixTokens.referenceWidth.compact).toBe(370)
      expect(timelineSource).toContain('stageFontSize(size, STAGE_REFERENCE_SCALE.stageSix, windowWidth)')
      expect(timelineSource).toContain('width / stageSixTokens.referenceWidth[variant]')
      expect(timelineSource).toContain('const buttonMinHeight = stageTapSize(L.button.height, scale)')
    }, 'phone geometry is the 370pt artboard times the device ratio, and type resolves through the shared stage-ratio ramp')
  })

  it('previews the real attached photos in the tile and falls back to a glyph when a ref cannot be signed', () => {
    const { view, props } = renderTimeline({ attachmentCount: 2, attachmentPreviews: ['file:///burnt-wire.jpg', 'file:///socket.jpg'] })

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-stage-six-attachment-thumbs')).toBeOnTheScreen()
      expect(screen.getByTestId('worker-v5-stage-six-attachment-thumb-0').findByType(Image).props.source).toEqual({ uri: 'file:///burnt-wire.jpg' })
      expect(screen.getByTestId('worker-v5-stage-six-attachment-thumb-1').findByType(Image).props.source).toEqual({ uri: 'file:///socket.jpg' })
      expect(screen.queryByTestId('worker-v5-stage-six-attachment-icon')).toBeNull()
      expect(screen.getByText('2 tệp đính kèm')).toBeOnTheScreen()
    }, 'the tile previews the photos the worker actually attached, in the order the workflow holds them')

    view.rerender(
      <StageSixTimeline
        {...props}
        attachmentCount={1}
        attachmentPreviews={['supabase://job-media/22222222-2222-4222-8222-222222222222/scope_change_evidence/burnt-wire.jpg']}
      />,
    )

    withPillarContext(PILLAR, () => {
      const thumb = screen.getByTestId('worker-v5-stage-six-attachment-thumb-0')
      expect(thumb.findAllByType(Image)).toHaveLength(0)
      expect(thumb.findByType(Svg)).toBeTruthy()
      expect(screen.getByText('1 tệp đính kèm')).toBeOnTheScreen()
    }, 'a private storage ref that cannot be signed shows an empty frame, never a broken or invented image')
  })

  it('ships the approved workart asset', () => {
    const assetSource = read('../jobs/stage-six/stage-six-assets.ts')

    expect(existsSync(resolve(__dirname, '../../../assets/worker-stage-six/scope-workart.png'))).toBe(true)
    expect(assetSource).toContain('scope-workart.png')
  })
})
