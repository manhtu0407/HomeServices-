import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(__dirname, '../../../../')
const read = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), 'utf-8')

function exportsConstant(source: string, constantName: string): boolean {
  if (source.includes(`export const ${constantName}`)) return true

  const reExports = source.matchAll(/export\s*\{([^}]+)\}/g)
  for (const match of reExports) {
    const names = match[1]
      .split(',')
      .map((value) => value.trim().split(/\s+as\s+/)[1] ?? value.trim().split(/\s+as\s+/)[0])
    if (names.includes(constantName)) return true
  }

  return false
}

describe('shared and Edge domain contracts stay in parity', () => {
  it('exports shared workflow constants from the Edge domain boundary', () => {
    const shared = read('packages/shared/src/constants.ts')
    const edge = read('supabase/functions/_shared/contracts/common.ts')

    for (const constantName of [
      'MESSAGE_SENDERS',
      'NOTIFICATION_STATUSES',
      'LEARNING_CANDIDATE_STATUSES',
      'LEARNING_RULE_STATUSES',
      'PLATFORM_FEE_CUSTOMER',
      'PROBLEM_CHIPS',
      'REVIEW_TAGS',
    ]) {
      expect(exportsConstant(shared, constantName)).toBe(true)
      expect(exportsConstant(edge, constantName)).toBe(true)
    }
  })

  it('exports response contracts for the Kael-first mobile workflow', () => {
    const apiResponses = read('packages/shared/src/types/api-responses.ts')
    const sharedIndex = read('packages/shared/src/index.ts')

    for (const typeName of [
      'KaelChatResponse',
      'ConfirmKaelChatResponse',
      'JobMessageListResponse',
      'JobMessageSendResponse',
      'WorkerCancellationResponse',      'NotificationListResponse',
      'NotificationReadResponse',
      'DevicePushTokenResponse',
    ]) {
      expect(apiResponses).toContain(`export type ${typeName}`)
      expect(sharedIndex).toContain(typeName)
    }

    expect(apiResponses).toContain("'budget_exceeded'")
  })

  it('keeps job chat message validation available on shared and Edge domains', () => {
    const shared = read('packages/shared/src/contracts/job.ts')
    const edge = read('supabase/functions/_shared/contracts/job.ts')

    expect(shared).toContain('export const jobMessageSendSchema')
    expect(edge).toContain('export const jobMessageSendSchema')
  })

  it('keeps public worker application validation shared with the Edge domain', () => {
    const shared = read('packages/shared/src/contracts/worker.ts')
    const edge = read('supabase/functions/_shared/contracts/worker.ts')
    const sharedIndex = read('packages/shared/src/index.ts')

    expect(shared).toContain('export const workerApplicationSubmitSchema')
    expect(shared).toContain('export type WorkerApplicationSubmitInput')
    expect(edge).toContain('export const workerApplicationSubmitSchema')
    expect(edge).toContain('export type WorkerApplicationSubmitInput')
    expect(sharedIndex).toContain('workerApplicationSubmitSchema')
    expect(sharedIndex).toContain('WorkerApplicationSubmitInput')
  })
})
