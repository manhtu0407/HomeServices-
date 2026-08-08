import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  applyPerformanceAnswer,
  createInitialPerformanceIntake,
  getServicePerformancePlaybook,
  runKaelAgenticPerformanceStep,
  type IntakeAnswerValue,
  type LaunchServiceLineId,
} from '../index'

type PerformanceCase = {
  id: string
  service: LaunchServiceLineId
  kind: 'performance_playbook'
  max_turns: number
  turns: Array<{ slot: string; answer: IntakeAnswerValue }>
}

type DiagnosticCase = {
  id: string
  service: 'electrical' | 'plumbing'
  kind: 'diagnostic_intake'
  max_turns: number
  turns: Array<{ slot: string; question_vi: string; answer: string }>
}

const fixturePath = resolve(__dirname, '../../../../apps/api/fixtures/kael-eval/conversation-cases.json')
const cases = JSON.parse(readFileSync(fixturePath, 'utf8')) as Array<PerformanceCase | DiagnosticCase>

describe('Kael multi-turn conversation eval', () => {
  it('covers all six launch services with at least 18 deterministic conversations', () => {
    expect(cases.length).toBeGreaterThanOrEqual(18)
    expect(new Set(cases.map((item) => item.service))).toEqual(new Set([
      'electrical',
      'plumbing',
      'home_cleaning',
      'hvac_basic_maintenance',
      'upholstery_care',
      'handyman_minor_installation',
    ]))
  })

  it.each(cases.filter((item): item is PerformanceCase => item.kind === 'performance_playbook'))(
    '$id never repeats an answered slot and reaches scope-ready within the turn budget',
    (testCase) => {
      let state = createInitialPerformanceIntake(testCase.service)
      const asked = new Set<string>()
      let turnCount = 0
      for (const turn of testCase.turns) {
        const decision = runKaelAgenticPerformanceStep({ state })
        expect(decision.kind).toBe('ask_question')
        if (decision.kind !== 'ask_question') throw new Error('expected ask_question')
        expect(decision.question.id).toBe(turn.slot)
        expect(asked.has(decision.question.id)).toBe(false)
        expect(decision.question.labelVi.toLocaleLowerCase('vi').includes(' và ')).toBe(false)
        asked.add(decision.question.id)
        state = applyPerformanceAnswer(state, decision.question.id, turn.answer)
        turnCount += 1
      }
      const finalDecision = runKaelAgenticPerformanceStep({ state })
      expect(finalDecision.kind).not.toBe('ask_question')
      expect(turnCount).toBeLessThanOrEqual(testCase.max_turns)
      expect(asked.size).toBe(turnCount)
      expect(getServicePerformancePlaybook(testCase.service).questions.filter((question) => question.required).length).toBe(turnCount)
    },
  )

  it.each(cases.filter((item): item is DiagnosticCase => item.kind === 'diagnostic_intake'))(
    '$id has one safe question per turn with no repeated diagnostic slot',
    (testCase) => {
      const slots = testCase.turns.map((turn) => turn.slot)
      expect(new Set(slots).size).toBe(slots.length)
      expect(testCase.turns.length).toBeLessThanOrEqual(testCase.max_turns)
      for (const turn of testCase.turns) {
        expect(turn.question_vi.trim().endsWith('?')).toBe(true)
        expect(turn.question_vi.toLocaleLowerCase('vi').includes(' và ')).toBe(false)
        expect(turn.answer.trim()).not.toBe('')
      }
    },
  )
})
