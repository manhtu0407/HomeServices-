import { existsSync, readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import {
  BROADCAST_STATUSES,
  COMPLEXITY_LEVELS,
  JOB_STATUSES,
  LEARNING_CANDIDATE_STATUSES,
  LEARNING_RULE_STATUSES,
  MESSAGE_SENDERS,
  NOTIFICATION_STATUSES,
  PLATFORM_FEE_CUSTOMER,
  PLATFORM_FEE_WORKER,
  PROBLEM_CHIPS,
  REVIEW_TAGS,
  SCOPE_CHANGE_STATUSES,
  SERVICE_TYPES,
  USER_ROLES,
  WORKER_VERIFICATION_STATUSES,
} from '../constants'

const MIGRATIONS_DIR = resolve(__dirname, '../../../../supabase/migrations')
const SQL = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8'))
  .join('\n')

function extractFinalEnumValues(enumName: string): string[] {
  const re = new RegExp(`create\\s+type\\s+${enumName}\\s+as\\s+enum\\s*\\(([^)]+)\\)`, 'gi')
  const matches = [...SQL.matchAll(re)]
  const match = matches.at(-1)
  if (!match) return []

  const values = match[1]
    .replace(/--.*$/gm, '')
    .split(',')
    .map((value) => value.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)

  const alterRe = new RegExp(
    `alter\\s+type\\s+(?:public\\.)?${enumName}\\s+add\\s+value\\s+(?:if\\s+not\\s+exists\\s+)?'([^']+)'(?:\\s+(before|after)\\s+'([^']+)')?`,
    'gi'
  )
  for (const alter of SQL.matchAll(alterRe)) {
    const value = alter[1]
    const position = alter[2]?.toLowerCase()
    const anchor = alter[3]
    if (values.includes(value)) continue
    const anchorIndex = anchor ? values.indexOf(anchor) : -1
    if (anchorIndex >= 0 && position === 'before') {
      values.splice(anchorIndex, 0, value)
    } else if (anchorIndex >= 0 && position === 'after') {
      values.splice(anchorIndex + 1, 0, value)
    } else {
      values.push(value)
    }
  }

  return values
}

describe('database enum constants', () => {
  it.each([
    ['service_type', SERVICE_TYPES],
    ['job_status', JOB_STATUSES],
    ['complexity_level', COMPLEXITY_LEVELS],
    ['user_role', USER_ROLES],
    ['message_sender', MESSAGE_SENDERS],
    ['broadcast_status', BROADCAST_STATUSES],
    ['scope_change_status', SCOPE_CHANGE_STATUSES],
    ['worker_verification_status', WORKER_VERIFICATION_STATUSES],
    ['notification_status', NOTIFICATION_STATUSES],
    ['learning_candidate_status', LEARNING_CANDIDATE_STATUSES],
    ['learning_rule_status', LEARNING_RULE_STATUSES],
  ])('%s matches the final SQL enum', (enumName, values) => {
    const sqlValues = extractFinalEnumValues(enumName)
    expect(sqlValues.length).toBeGreaterThan(0)
    expect([...values]).toEqual(sqlValues)
  })

  it('keeps services hard-scoped to the six approved launch services', () => {
    expect(SERVICE_TYPES).toEqual([
      'electrical',
      'plumbing',
      'cleaning',
      'hvac',
      'upholstery',
      'handyman',
    ])
  })

  it('keeps the full STRUCTURES.md job workflow states', () => {
    expect(JOB_STATUSES).toHaveLength(18)
    expect(JOB_STATUSES[0]).toBe('draft')
    expect(JOB_STATUSES).toContain('awaiting_customer_confirm')
    expect(JOB_STATUSES).toContain('worker_candidate_pending')
    expect(JOB_STATUSES).toContain('scope_change_pending')
    expect(JOB_STATUSES).toContain('confirmed_by_customer')
    expect(JOB_STATUSES[JOB_STATUSES.length - 1]).toBe('cancelled')
  })

  it('keeps the evidence-gated learning states', () => {
    expect(LEARNING_CANDIDATE_STATUSES).toContain('evidence_gate_passed')
    expect(LEARNING_CANDIDATE_STATUSES).toContain('auto_promoted')
    expect(LEARNING_RULE_STATUSES).toContain('monitoring')
    expect(LEARNING_RULE_STATUSES).toContain('rolled_back')
  })
})

describe('business constants', () => {
  it('keeps platform fee constants within documented limits', () => {
    expect(PLATFORM_FEE_CUSTOMER).toBe(0.075)
    expect(PLATFORM_FEE_WORKER).toBe(0.15)
    expect(PLATFORM_FEE_CUSTOMER).toBeLessThanOrEqual(0.1)
    expect(PLATFORM_FEE_WORKER).toBeLessThanOrEqual(0.15)
  })

  it('keeps problem chips aligned with supported services', () => {
    expect(Object.keys(PROBLEM_CHIPS).sort()).toEqual([...SERVICE_TYPES].sort())
    expect(PROBLEM_CHIPS.electrical).toHaveLength(7)
    expect(PROBLEM_CHIPS.plumbing).toHaveLength(7)
    expect(PROBLEM_CHIPS.cleaning).toHaveLength(7)
    expect(PROBLEM_CHIPS.hvac.length).toBeGreaterThan(0)
    expect(PROBLEM_CHIPS.upholstery.length).toBeGreaterThan(0)
    expect(PROBLEM_CHIPS.handyman.length).toBeGreaterThan(0)
  })

  it('does not allow duplicate problem chips within a service', () => {
    for (const chips of Object.values(PROBLEM_CHIPS)) {
      expect(new Set(chips).size).toBe(chips.length)
    }
  })

  it('keeps review tags available for completion feedback', () => {
    expect(REVIEW_TAGS).toHaveLength(5)
    expect(new Set(REVIEW_TAGS).size).toBe(REVIEW_TAGS.length)
  })
})

describe('constants are runtime immutable', () => {
  it.each([
    ['SERVICE_TYPES', SERVICE_TYPES],
    ['JOB_STATUSES', JOB_STATUSES],
    ['USER_ROLES', USER_ROLES],
    ['LEARNING_RULE_STATUSES', LEARNING_RULE_STATUSES],
  ])('%s is frozen', (_name, values) => {
    expect(Object.isFrozen(values)).toBe(true)
    expect(() => {
      ;(values as unknown as string[]).push('invalid')
    }).toThrow()
  })
})

describe('migration source availability', () => {
  it('contains the workflow alignment migration used for enum parity', () => {
    expect(existsSync(resolve(MIGRATIONS_DIR, '20260513114845_align_structures_workflow.sql'))).toBe(true)
  })
})
