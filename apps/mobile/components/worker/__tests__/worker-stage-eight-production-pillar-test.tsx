import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { fireEvent, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { StageEightEvidenceScreen } from '../jobs/evidence/stage-eight-evidence'

export const PILLAR = {
  id: 'P100-worker-stage-eight-production-fidelity',
  invariant:
    'Production Worker Stage 8 uses the supplied V3 evidence body without importing its excluded header strip, while completion input remains gated by real after-stage media and a five-character note',
  authority: [
    'governance/RULES.md (workflow integrity, data honesty, and language)',
    'governance/structures/worker-workflow.md B7 (completion evidence boundary)',
    'governance/protocols/frontend-test.md G1/G2 (layout and state coverage)',
  ],
  target: 'apps/mobile/components/worker/jobs/evidence/stage-eight-production-body.tsx',
  layer: 'ui-visual',
  siblings: ['P79-worker-completion-media-ownership', 'P81-completion-media-attachment-sql'],
  mutation:
    'route Production Stage 8 back to the retired body, remove the after-stage upload, or enable submit without both real photo and note — the source and interaction gates turn red',
} as const satisfies PillarManifest

const read = (relativePath: string) => readFileSync(resolve(__dirname, relativePath), 'utf8').replace(/\r\n/g, '\n')

describe('Worker Stage 8 Production fidelity', () => {
  it('routes Production Stage 8 to the fidelity body and excludes the supplied top strip', () => {
    const hostSource = read('../jobs/worker-jobs-production-host.tsx')
    const bodySource = read('../jobs/evidence/stage-eight-production-body.tsx')

    withPillarContext(PILLAR, () => {
      expect(hostSource).toContain("props.screen.id === '2.10-completion-evidence'")
      expect(hostSource).toContain('WorkerJobsProductionStageEightBody')
      expect(bodySource).toContain('showWorkflowHeader={false}')
      expect(bodySource).not.toContain('showWorkflowHeader={true}')
      expect(bodySource).toContain('embedded')
    }, 'Production must use the supplied body while keeping the existing shell/header ownership')
  })

  it('keeps the real B7 media and status boundary wired', () => {
    const bodySource = read('../jobs/evidence/stage-eight-production-body.tsx')

    withPillarContext(PILLAR, () => {
      expect(bodySource).toContain("uploadJobMediaDrafts(jobId, completionPhotos, 'after')")
      expect(bodySource).toContain("runtime.actions.workerUpdateStatus('completed_by_worker'")
      expect(bodySource).toContain('completion_photo_urls: Array.from(new Set')
      expect(bodySource).toContain('navigateNext()')
      expect(bodySource).not.toContain("final_price")
      expect(bodySource).not.toContain("from '.../supabase'")
    }, 'Stage 8 must upload private after evidence and advance only after the workflow status succeeds')
  })

  it('ships the extracted V3 visual asset set', () => {
    const assetDirectory = resolve(__dirname, '../../../assets/worker-stage-eight')
    const assetSource = read('../jobs/evidence/stage-eight-assets.ts')

    for (const fileName of [
      'stage8-hero.png',
      'stage8-logo.png',
      'stage8-upload.png',
    ]) {
      expect(existsSync(resolve(assetDirectory, fileName))).toBe(true)
      expect(assetSource).toContain(fileName)
    }
    for (const fileName of [
      'stage8-camera.png',
      'stage8-check.png',
      'stage8-note.png',
      'stage8-plane.png',
      'stage8-trailing.png',
    ]) {
      expect(existsSync(resolve(assetDirectory, fileName))).toBe(false)
      expect(assetSource).not.toContain(fileName)
    }
  })

  it('draws bare vector section icons and keeps the submit action text-only', () => {
    const evidenceSource = read('../jobs/evidence/stage-eight-evidence.tsx')

    render(
      <StageEightEvidenceScreen
        embedded
        language="vi"
        note=""
        onAddPhoto={jest.fn()}
        onSubmit={jest.fn()}
        photoCount={0}
        showWorkflowHeader={false}
      />,
    )

    withPillarContext(PILLAR, () => {
      expect(evidenceSource).toContain('<StageEightIcon color={C.mint} name={icon}')
      expect(evidenceSource).toContain("sectionLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }")
      expect(evidenceSource).not.toContain('stageEightAssets.plane')
      expect(screen.getByText('Ảnh hoàn tất')).toBeTruthy()
      expect(screen.getByText('Kiểm tra cuối')).toBeTruthy()
      expect(screen.queryByText('Chụp ảnh hiện trường sau khi hoàn thành công việc.')).toBeNull()
      expect(screen.queryByText('Hãy đảm bảo đã bổ sung đầy đủ trước khi gửi.')).toBeNull()
      expect(screen.getByTestId('worker-v5-stage-eight-fidelity-submit')).toHaveTextContent('Gửi hồ sơ hoàn tất', { exact: true })
    }, 'section headers pair a bare mint glyph with a centered title, and the submit action carries no icon')
  })

  it('does not expose the excluded strip when embedded in Production', () => {
    render(
      <StageEightEvidenceScreen
        embedded
        language="vi"
        note=""
        onAddPhoto={jest.fn()}
        onSubmit={jest.fn()}
        photoCount={0}
        showWorkflowHeader={false}
      />,
    )

    expect(screen.getByTestId('worker-v5-stage-eight-fidelity-hero')).toBeTruthy()
    expect(screen.getByTestId('worker-v5-stage-eight-fidelity-upload')).toBeTruthy()
    expect(screen.getByTestId('worker-v5-stage-eight-fidelity-final-check')).toBeTruthy()
    expect(screen.queryByText('NestScout')).toBeNull()
    expect(screen.queryByText('Bước 8 · Bằng chứng')).toBeNull()
  })

  it('keeps the submit action disabled until one photo and a five-character note exist', () => {
    const onSubmit = jest.fn()
    const view = render(
      <StageEightEvidenceScreen
        embedded
        language="vi"
        note=""
        onNoteChange={jest.fn()}
        onSubmit={onSubmit}
        photoCount={1}
        showWorkflowHeader={false}
      />,
    )

    expect(screen.getByTestId('worker-v5-stage-eight-fidelity-submit')).toBeDisabled()
    view.rerender(
      <StageEightEvidenceScreen
        embedded
        language="vi"
        note="Đã lau sạch"
        onNoteChange={jest.fn()}
        onSubmit={onSubmit}
        photoCount={1}
        showWorkflowHeader={false}
      />,
    )

    const submit = screen.getByTestId('worker-v5-stage-eight-fidelity-submit')
    expect(submit).not.toBeDisabled()
    fireEvent.press(submit)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
