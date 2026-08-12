import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')
const listFilesUnder = (relDir: string): string[] =>
  readdirSync(resolve(ROOT, relDir), { withFileTypes: true }).flatMap((entry) => {
    const relPath = `${relDir}/${entry.name}`
    return entry.isDirectory() ? listFilesUnder(relPath) : [relPath]
  })
const readMobileApiTypesLayer = () =>
  [
    read('apps/mobile/lib/api-types.ts'),
    ...listFilesUnder('apps/mobile/lib/api-types')
      .filter((relPath) => relPath.endsWith('.ts'))
      .sort()
      .map(read),
  ].join('\n')

describe('Plan §31 B4 knowledge governance', () => {
  it('keeps Edge admin approval as the only writer path for knowledge candidate apply', () => {
    const services = read('supabase/functions/mobile-api/_shared/domains.ts') + read('supabase/functions/mobile-api/_shared/domains/admin/learning.ts')
    const responseContract = read('supabase/functions/mobile-api/_shared/domains/contracts/admin-learning.ts')
    const mobileTypes = readMobileApiTypesLayer()

    expect(services).toContain('admin_review_and_approve_learning_candidate_atomic')
    expect(services).not.toContain('rpc("apply_approved_learning_candidate_to_knowledge"')
    expect(services).toContain('knowledge_apply')
    expect(responseContract).toContain('knowledge_apply')
    expect(mobileTypes).toContain('knowledge_apply')
    expect(services).not.toContain('.from("worker_safety_patterns").insert')
    expect(services).not.toContain('.from("service_knowledge_boxes").insert')
  })

  it('preserves B1 retrieval tables while B4 governance migration is present', () => {
    const knowledge = read('supabase/functions/mobile-api/_shared/kael/tools/knowledge.ts')
    expect(knowledge).toContain('service_knowledge_boxes')
    expect(knowledge).toContain('worker_safety_patterns')
    expect(knowledge).toContain('legal_awareness_patterns')
  })
})
