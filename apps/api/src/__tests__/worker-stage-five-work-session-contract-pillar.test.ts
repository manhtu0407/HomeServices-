import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from './pillar-manifest'

export const PILLAR = {
  id: 'P166-worker-stage-five-work-session-contract',
  invariant:
    'Stage 5 work-session actions use the existing worker status boundary, persist only operational state, and never enter the Kael orchestration or customer-status notification path',
  authority: [
    'governance/RULES.md (Agentic boundary and workflow integrity)',
    'governance/protocols/backend-structure.md §24-§25 (Edge contract and DB parity)',
    'governance/protocols/frontend-test.md (real data and capability honesty)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/job/status.ts',
  layer: 'static-type',
  siblings: ['P165-worker-stage-five-production', 'P07-worker-verification-states'],
  mutation:
    'route pause, resume, or note through a new autonomous path, notify the customer for a same-status work-session update, or remove the mobile work-session field; the boundary assertions turn red',
} as const satisfies PillarManifest

const root = resolve(import.meta.dirname, '../../../..')
const read = (file: string) => readFileSync(resolve(root, file), 'utf8')

describe('Worker Production Stage 5 work-session boundary', () => {
  it('keeps pause, resume, and note on the existing status endpoint contract', () => {
    const dto = read('supabase/functions/mobile-api/_shared/http/dto/worker.ts')
    const status = read('supabase/functions/mobile-api/_shared/domains/job/status.ts')
    const service = read('apps/mobile/lib/services.ts')

    withPillarContext(PILLAR, () => {
      expect(dto.indexOf('const result: WorkerStatusUpdateInput')).toBeLessThan(dto.indexOf('if (record.work_session !== undefined)'))
      expect(dto).toContain('action !== "pause" && action !== "resume" && action !== "save_note"')
      expect(dto).toContain('workSession.note.length > 2000')
      expect(status).toContain('const isSameStatusWorkSession')
      expect(status).toContain('"worker_work_session_update"')
      expect(service).toContain('work_session?: WorkerWorkSessionInput')
    }, 'same-status work-session state must remain a bounded extension of the existing worker status contract')
  })

  it('does not notify the customer or queue Kael learning for work-session-only updates', () => {
    const status = read('supabase/functions/mobile-api/_shared/domains/job/status.ts')
    const notificationGate = status.indexOf('if (!isWorkSessionOnly) {\n    await notifyCustomerJobStatus')
    const learningGate = status.indexOf('if (input.status === "completed_by_worker")')

    withPillarContext(PILLAR, () => {
      expect(notificationGate).toBeGreaterThan(-1)
      expect(status.indexOf('await notifyCustomerWorkerCheckedIn', notificationGate)).toBeGreaterThan(-1)
      expect(learningGate).toBeGreaterThan(notificationGate)
      expect(status.slice(notificationGate, learningGate)).not.toContain('queueKaelLearningEvent')
    }, 'operational pause/note state must not create an Agentic turn or customer status notification')
  })
})

function withPillarContext(manifest: PillarManifest, run: () => void, detail: string) {
  try {
    run()
  } catch (error) {
    throw new Error(`${manifest.id}: ${detail}; ${error instanceof Error ? error.message : String(error)}`)
  }
}
