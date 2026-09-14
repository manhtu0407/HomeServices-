import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { StageFiveWork } from '../jobs/stage-five/travel-work/stage-five-work'
import type { Actions, WorkModel } from '../jobs/stage-five/travel-work/stage-five.types'

export const PILLAR = {
  id: 'P165-worker-stage-five-production',
  invariant:
    'Production Stage 5 renders the approved source surface while every visible job, timing, evidence, and action state comes from the real worker workflow contract',
  authority: [
    'governance/RULES.md (data honesty, language, and workflow integrity)',
    'governance/protocols/frontend-test.md G1-G6 (RN layout, state, accessibility, motion, and performance)',
    'the approved Stage 5 source included in NestScout_Stage4_Stage5_Codex_Source.zip',
  ],
  target: 'apps/mobile/components/worker/jobs/stage-five/travel-work/stage-five-work.tsx',
  layer: 'ui-visual',
  siblings: ['P22-worker-jobs-workart-alpha', 'P23-worker-jobs-empty-copy', 'P08-worker-dock-motion'],
  mutation:
    'replace the Stage 5 surface with a fixture-driven or non-native screen, or remove a real workflow action; the source, copy, and action assertions turn red',
} as const satisfies PillarManifest

const model: WorkModel = {
  jobId: 'job_stage5_real',
  stage: 5,
  jobStatus: 'repairing',
  serviceTitle: 'Ổ cắm phòng khách chập chờn',
  serviceCategory: 'Sửa điện',
  addressLine: 'Tòa A, Quận 1',
  arrivedLabel: '09:14',
  startedLabel: '09:32',
  startedAtMs: Date.parse('2026-09-14T02:32:00.000Z'),
  pausedAtMs: null,
  pausedMs: 0,
  phase: 'inspect',
  phaseLabels: ['Đã tới', 'Kiểm tra', 'Đang làm', 'Hồ sơ', 'Hoàn tất'],
  note: null,
  evidenceCount: 1,
  canPrepareCompletion: true,
}

function makeActions(calls: string[]): Actions {
  const action = (id: string) => ({ enabled: true, onPress: () => { calls.push(id) } })
  return {
    back: action('back'),
    chat: action('chat'),
    details: action('details'),
    guide: action('guide'),
    progress: action('progress'),
    pause: action('pause'),
    photo: action('photo'),
    note: action('note'),
    scope: action('scope'),
    support: action('support'),
    editArrival: action('editArrival'),
    complete: action('complete'),
    call: { enabled: false, onPress: () => undefined },
  }
}

describe('Worker Production Stage 5', () => {
  it('keeps the approved visual hierarchy and routes actions through the supplied real-state callbacks', async () => {
    const calls: string[] = []

    withPillarContext(PILLAR, () => {
      render(
        <StageFiveWork
          actions={makeActions(calls)}
          model={model}
          nowMs={Date.parse('2026-09-14T03:02:00.000Z')}
          reduceMotion
        />,
      )

      expect(screen.getByTestId('stage5-work')).toBeOnTheScreen()
      expect(screen.getByText('Bước 5/11')).toBeOnTheScreen()
      expect(screen.getByText('Đang thực hiện công việc')).toBeOnTheScreen()
      expect(screen.getByText('Ổ cắm phòng khách chập chờn')).toBeOnTheScreen()
      expect(screen.getByText('Tòa A, Quận 1')).toBeOnTheScreen()
      expect(screen.getByText('Tiến độ công việc')).toBeOnTheScreen()
      expect(screen.getByText('Chuẩn bị hồ sơ hoàn tất')).toBeOnTheScreen()

    }, 'the Production surface must not replace real data or callbacks with demo behavior')

    for (const testID of ['stage5-pause', 'stage5-photo', 'stage5-note', 'stage5-scope', 'stage5-support', 'stage5-primary']) {
      await act(async () => {
        fireEvent.press(screen.getByTestId(testID))
        await Promise.resolve()
      })
    }

    expect(calls).toEqual(['pause', 'photo', 'note', 'scope', 'support', 'complete'])
    expect(screen.getByTestId('stage5-call')).toBeDisabled()
  })

  it('stays honest when the backend has not released optional values yet', () => {
    withPillarContext(PILLAR, () => {
      render(
        <StageFiveWork
          actions={{}}
          model={{
            ...model,
            jobId: null,
            jobStatus: null,
            serviceTitle: null,
            serviceCategory: null,
            addressLine: null,
            arrivedLabel: null,
            startedLabel: null,
            startedAtMs: null,
            phase: null,
            canPrepareCompletion: false,
          }}
          nowMs={Date.parse('2026-09-14T03:02:00.000Z')}
          reduceMotion
        />,
      )

      expect(screen.getByText('Chưa có công việc')).toBeOnTheScreen()
      expect(screen.getByText('Thông tin địa chỉ được bảo vệ')).toBeOnTheScreen()
      expect(screen.getByText('Bắt đầu lúc —')).toBeOnTheScreen()
      expect(screen.getByTestId('stage5-primary')).toBeDisabled()
    }, 'unknown backend state must remain an explicit empty state')
  })
})
