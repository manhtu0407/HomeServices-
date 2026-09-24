// Fixture suite for the Actions usage report. Only the pure billing arithmetic is tested here;
// the GitHub API calls are exercised by running the report against the real repository.

import assert from 'node:assert/strict'
import test from 'node:test'

import { billableMinutes, isBillingBlocked, project, render, summarize } from './ci-usage-report.mjs'

const at = (seconds) => new Date(Date.UTC(2026, 8, 1, 0, 0, seconds)).toISOString()

function job(seconds, overrides = {}) {
  return { name: 'job', conclusion: 'success', steps: 5, started_at: at(0), completed_at: at(seconds), ...overrides }
}

test('every started job is rounded up to a whole minute', () => {
  assert.equal(billableMinutes(job(1)), 1)
  assert.equal(billableMinutes(job(59)), 1)
  assert.equal(billableMinutes(job(60)), 1)
  assert.equal(billableMinutes(job(61)), 2)
  assert.equal(billableMinutes(job(128)), 3)
})

test('skipped jobs and jobs that never started bill nothing', () => {
  assert.equal(billableMinutes(job(300, { conclusion: 'skipped' })), 0)
  assert.equal(billableMinutes({ name: 'job', conclusion: null, started_at: null, completed_at: null }), 0)
  assert.equal(billableMinutes(job(0)), 0)
})

test('a job refused by a spending limit is recognised and bills nothing', () => {
  const blocked = job(4, { conclusion: 'failure', steps: 0 })
  assert.equal(isBillingBlocked(blocked), true)
  assert.equal(billableMinutes(blocked), 0)
})

test('a fast failure that did run steps is not mistaken for a billing block', () => {
  const failed = job(4, { conclusion: 'failure', steps: 3 })
  assert.equal(isBillingBlocked(failed), false)
  assert.equal(billableMinutes(failed), 1)
})

test('a long job with no recorded steps is not a billing block', () => {
  assert.equal(isBillingBlocked(job(300, { conclusion: 'failure', steps: 0 })), false)
})

function run(id, name, event, day, jobs) {
  return { id, name, event, created_at: `2026-09-${day}T10:00:00Z`, jobs }
}

test('the summary bills per job, per workflow, per event, and per day', () => {
  const summary = summarize([
    run(1, 'ci', 'pull_request', '01', [job(20), job(130)]),
    run(2, 'ci', 'push', '01', [job(10)]),
    run(3, 'monitor', 'schedule', '02', [job(12), job(4, { conclusion: 'failure', steps: 0 })]),
  ])
  assert.equal(summary.minutes, 1 + 3 + 1 + 1)
  assert.equal(summary.blockedJobs, 1)
  assert.equal(summary.byWorkflow.get('ci | pull_request').minutes, 4)
  assert.equal(summary.byWorkflow.get('monitor | schedule').runs, 1)
  assert.deepEqual([...summary.byDay.entries()], [['2026-09-01', 5], ['2026-09-02', 1]])
})

test('a month that stays inside the included minutes costs nothing', () => {
  const report = project({ minutes: 1200, elapsedDays: 10, daysInMonth: 30, included: 2000, rate: 0.006 })
  assert.equal(report.overageMinutes, 0)
  assert.equal(report.cost, 0)
  assert.equal(report.projectedMinutes, 3600)
  assert.equal(report.projectedCost, (3600 - 2000) * 0.006)
})

test('spend is the overage beyond the included minutes at the runner rate', () => {
  const report = project({ minutes: 3167, elapsedDays: 20, daysInMonth: 30, included: 2000, rate: 0.006 })
  assert.equal(report.overageMinutes, 1167)
  assert.ok(Math.abs(report.cost - 7.002) < 1e-9)
})

test('headroom and exhaustion follow the recent pace against a budget', () => {
  const report = project({
    minutes: 3167, elapsedDays: 20, daysInMonth: 30, included: 2000, rate: 0.006, budget: 9, recentPerDay: 100,
  })
  assert.equal(report.budgetMinutes, 3500)
  assert.equal(report.headroomMinutes, 333)
  assert.equal(report.daysToBudget, 3.33)
  assert.equal(report.exhaustsBeforeMonthEnd, true)
})

test('a slow pace does not exhaust the budget before the month ends', () => {
  const report = project({
    minutes: 3167, elapsedDays: 20, daysInMonth: 30, included: 2000, rate: 0.006, budget: 9, recentPerDay: 20,
  })
  assert.equal(report.exhaustsBeforeMonthEnd, false)
})

test('an already exhausted budget reports zero headroom rather than a negative one', () => {
  const report = project({ minutes: 3600, elapsedDays: 25, daysInMonth: 30, included: 2000, rate: 0.006, budget: 9 })
  assert.equal(report.headroomMinutes, 0)
  assert.equal(report.exhaustsBeforeMonthEnd, true)
})

function rendered(budget) {
  const summary = summarize([run(1, 'ci', 'push', '01', [job(300)])])
  const options = { repo: 'owner/repo', month: '2026-09', included: 0, rate: 0.006, budget }
  return render({ options, summary, days: ['2026-09-01', '2026-09-02'], daysInMonth: 30 })
}

test('the rendered report states the real rate and how long the budget lasts', () => {
  const text = rendered(0.06)
  assert.match(text, /then \$0\.006\/min: 5 overage min = \$0\.03/)
  assert.match(text, /allows 10 min: 5 min left, 28 days remain/)
  assert.match(text, /lasts 2 days at the month's 3 min\/day/)
  assert.doesNotMatch(text, /EXHAUSTED/)
})

test('a budget with minutes left is never reported as exhausted', () => {
  assert.doesNotMatch(rendered(0.055), /EXHAUSTED/)
})

test('a spent budget is reported as exhausted', () => {
  assert.match(rendered(0.03), /BUDGET EXHAUSTED/)
})

test('blocked days are called out with their count', () => {
  const summary = summarize([run(1, 'ci', 'push', '15', [job(4, { conclusion: 'failure', steps: 0 }), job(90)])])
  const text = render({
    options: { repo: 'o/r', month: '2026-09', included: 2000, rate: 0.006 },
    summary,
    days: ['2026-09-15'],
    daysInMonth: 30,
  })
  assert.match(text, /CI WAS BLOCKED: 1 jobs were refused .*2026-09-15 x1/)
})

test('a spent budget stays exhausted even when nothing ran recently or the month is over', () => {
  const idle = project({
    minutes: 3500, elapsedDays: 25, daysInMonth: 30, included: 2000, rate: 0.006, budget: 9, recentPerDay: 0,
  })
  assert.equal(idle.headroomMinutes, 0)
  assert.equal(idle.daysToBudget, 0)
  assert.equal(idle.exhaustsBeforeMonthEnd, true)
  const lastDay = project({
    minutes: 3500, elapsedDays: 30, daysInMonth: 30, included: 2000, rate: 0.006, budget: 9, recentPerDay: 100,
  })
  assert.equal(lastDay.exhaustsBeforeMonthEnd, true)
})

test('without a budget no headroom or exhaustion is claimed', () => {
  const report = project({ minutes: 3000, elapsedDays: 20, daysInMonth: 30, included: 2000, rate: 0.006 })
  assert.equal(report.headroomMinutes, null)
  assert.equal(report.exhaustsBeforeMonthEnd, null)
})
