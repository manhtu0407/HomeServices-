// Fixture suite for the workflow cost ratchet.
//
// Each negative case is one billing defect the gate exists to catch, written so the case fails
// if the check is ever weakened: the assertion names the token the message must carry, not
// merely that some problem was raised.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EXCEPTIONS,
  MAX_SCHEDULED_RUNS_PER_WEEK,
  MAX_TIMEOUT_MINUTES,
  checkWorkflows,
  cronRunsPerWeek,
} from './check-workflow-cost.mjs'

const GUARD = "if: ${{ github.event_name != 'pull_request' || github.event.pull_request.draft == false }}"
const PR = 'pull_request:\n    types: [opened, synchronize, reopened, ready_for_review]'
const PUSH = 'push:\n    branches: [main]'

function workflow({ on = PR, concurrency = true, jobs } = {}) {
  const body = jobs ?? `  build:
    ${GUARD}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo ok`
  return `name: fixture

on:
  ${on}
${concurrency ? `
concurrency:
  group: fixture-\${{ github.ref }}
  cancel-in-progress: true
` : ''}
jobs:
${body}
`
}

function run(files, exceptions = []) {
  return checkWorkflows({ files, exceptions })
}

function messages(report) {
  return report.problems.join('\n')
}

test('a bounded Linux workflow with cancelling concurrency raises nothing', () => {
  const report = run([{ name: 'ok.yml', text: workflow() }])
  assert.deepEqual(report.problems, [])
  assert.equal(report.jobs, 1)
})

test('a local reusable workflow is checked through its workflow_call definition', () => {
  const caller = workflow({ jobs: `  prepare:
    ${GUARD}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo ok
  canary:
    needs: prepare
    uses: ./.github/workflows/service.yml` })
  const service = `name: reusable service

on:
  workflow_call:

jobs:
  canary:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - run: echo ok
`
  const report = run([
    { name: 'main.yml', text: caller },
    { name: 'service.yml', text: service },
  ])
  assert.deepEqual(report.problems, [])
  assert.equal(report.jobs, 2)
})

test('a reusable workflow with an over-budget child job is caught', () => {
  const caller = workflow({ jobs: `  prepare:
    ${GUARD}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo ok
  canary:
    needs: prepare
    uses: ./.github/workflows/service.yml` })
  const service = `name: reusable service

on:
  workflow_call:

jobs:
  canary:
    runs-on: ubuntu-latest
    timeout-minutes: ${MAX_TIMEOUT_MINUTES + 1}
    steps:
      - run: echo ok
`
  const report = run([
    { name: 'main.yml', text: caller },
    { name: 'service.yml', text: service },
  ])
  assert.match(messages(report), /service\.yml job canary: timeout-minutes 91 exceeds 90/)
})

test('a reusable workflow reference must resolve to a local workflow_call file', () => {
  for (const ref of [
    './.github/workflows/missing.yml',
    'owner/repository/.github/workflows/service.yml@0123456789abcdef',
  ]) {
    const caller = workflow({ jobs: `  prepare:
    ${GUARD}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo ok
  canary:
    needs: prepare
    uses: ${ref}` })
    const report = run([{ name: 'main.yml', text: caller }])
    assert.match(messages(report), /main\.yml job canary: reusable workflow .* cannot be proven/, ref)
  }
})

test('a local target without workflow_call cannot satisfy a reusable workflow reference', () => {
  const caller = workflow({ jobs: `  prepare:
    ${GUARD}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo ok
  canary:
    needs: prepare
    uses: ./.github/workflows/service.yml` })
  const service = workflow({ on: PUSH, concurrency: false })
  const report = run([
    { name: 'main.yml', text: caller },
    { name: 'service.yml', text: service },
  ])
  assert.match(messages(report), /main\.yml job canary: service\.yml does not declare workflow_call/)
})

test('a job with no timeout-minutes is caught', () => {
  const report = run([{ name: 'a.yml', text: workflow({ jobs: `  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo ok` }) }])
  assert.match(messages(report), /a\.yml job build: no timeout-minutes/)
})

test('a timeout above the ceiling is caught', () => {
  const report = run([{ name: 'a.yml', text: workflow({ jobs: `  build:
    runs-on: ubuntu-latest
    timeout-minutes: ${MAX_TIMEOUT_MINUTES + 1}
    steps:
      - run: echo ok` }) }])
  assert.match(messages(report), new RegExp(`a\\.yml job build: timeout-minutes ${MAX_TIMEOUT_MINUTES + 1} exceeds ${MAX_TIMEOUT_MINUTES}`))
})

test('a timeout that is not a literal integer is caught', () => {
  const report = run([{ name: 'a.yml', text: workflow({ jobs: `  build:
    runs-on: ubuntu-latest
    timeout-minutes: \${{ inputs.limit }}
    steps:
      - run: echo ok` }) }])
  assert.match(messages(report), /a\.yml job build: timeout-minutes .* is not a literal integer/)
})

test('cron cadence is measured in runs per week', () => {
  assert.equal(cronRunsPerWeek('17 * * * *'), 24 * 7)
  assert.equal(cronRunsPerWeek('*/15 * * * *'), 96 * 7)
  assert.equal(cronRunsPerWeek('17 */6 * * *'), 4 * 7)
  assert.equal(cronRunsPerWeek('0 18 * * *'), 7)
  assert.equal(cronRunsPerWeek('0 18 * * 0'), 1)
  assert.equal(cronRunsPerWeek('0 18 * * 1-5'), 5)
  assert.equal(cronRunsPerWeek('0,30 9-17 * * 1,3'), 2 * 9 * 2)
  assert.equal(cronRunsPerWeek('0 18 * * 7'), 1)
})

test('an unparsable cron reads as unknown rather than cheap', () => {
  for (const expression of ['not a cron', '* * * *', '*/0 * * * *', '61 * * * *', '0 25 * * *']) {
    assert.equal(cronRunsPerWeek(expression), null, expression)
  }
})

test('an hourly schedule is caught', () => {
  const report = run([{ name: 'monitor.yml', text: workflow({ on: `schedule:
    - cron: '17 * * * *'` }) }])
  assert.match(messages(report), /monitor\.yml schedule '17 \* \* \* \*': 168 runs\/week exceeds 28/)
})

test('a fifteen-minute schedule is caught', () => {
  const report = run([{ name: 'monitor.yml', text: workflow({ on: `schedule:
    - cron: "*/15 * * * *"` }) }])
  assert.match(messages(report), /monitor\.yml schedule '\*\/15 \* \* \* \*': 672 runs\/week exceeds 28/)
})

test('nightly, six-hourly, and weekly schedules are allowed', () => {
  for (const cron of ['0 18 * * *', '17 */6 * * *', '0 18 * * 0']) {
    const report = run([{ name: 'ok.yml', text: workflow({ on: `schedule:
    - cron: '${cron}'`, concurrency: false }) }])
    assert.deepEqual(report.problems, [], cron)
  }
  assert.equal(MAX_SCHEDULED_RUNS_PER_WEEK, 28)
})

test('an unparsable schedule fails closed', () => {
  const report = run([{ name: 'x.yml', text: workflow({ on: `schedule:
    - cron: 'sometimes'`, concurrency: false }) }])
  assert.match(messages(report), /x\.yml schedule 'sometimes': cannot measure the cadence/)
})

test('a premium or non-literal runner is caught', () => {
  for (const runner of ['macos-latest', 'windows-latest', 'ubuntu-latest-8-cores', '${{ matrix.os }}', '[self-hosted, linux]']) {
    const report = run([{ name: 'r.yml', text: workflow({ jobs: `  build:
    runs-on: ${runner}
    timeout-minutes: 10
    steps:
      - run: echo ok` }) }])
    assert.match(messages(report), /r\.yml job build: runs-on/, runner)
  }
})

test('the standard Linux labels are accepted', () => {
  for (const runner of ['ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04']) {
    const report = run([{ name: 'r.yml', text: workflow({ on: PUSH, concurrency: false, jobs: `  build:
    runs-on: ${runner}
    timeout-minutes: 10
    steps:
      - run: echo ok` }) }])
    assert.deepEqual(report.problems, [], runner)
  }
})

test('a pull_request workflow without concurrency is caught', () => {
  const report = run([{ name: 'pr.yml', text: workflow({ concurrency: false }) }])
  assert.match(messages(report), /pr\.yml: pull_request trigger with no top-level concurrency/)
})

test('concurrency that never cancels is caught', () => {
  const text = workflow({ concurrency: false }).replace('\njobs:', `
concurrency:
  group: fixture
jobs:`)
  const report = run([{ name: 'pr.yml', text }])
  assert.match(messages(report), /pr\.yml: concurrency never sets cancel-in-progress/)
})

test('an expression-valued cancel-in-progress counts as cancelling', () => {
  const text = workflow({ concurrency: false }).replace('\njobs:', `
concurrency:
  group: fixture
  cancel-in-progress: \${{ github.event_name == 'pull_request' }}
jobs:`)
  assert.deepEqual(run([{ name: 'pr.yml', text }]).problems, [])
})

test('a push-only or scheduled workflow needs no concurrency', () => {
  const report = run([{ name: 'p.yml', text: workflow({ on: 'push:\n    branches: [main]', concurrency: false }) }])
  assert.deepEqual(report.problems, [])
})

test('the inline trigger forms are read', () => {
  for (const on of ['pull_request', '[push, pull_request]']) {
    const text = workflow({ concurrency: false }).replace('on:\n  pull_request:', `on: ${on}`)
    assert.match(messages(run([{ name: 'i.yml', text }])), /i\.yml: pull_request trigger with no top-level concurrency/, on)
  }
})

test('a pull_request workflow that leaves out ready_for_review is caught', () => {
  const text = workflow().replace('types: [opened, synchronize, reopened, ready_for_review]', 'types: [opened, synchronize, reopened]')
  assert.match(messages(run([{ name: 'pr.yml', text }])), /pr\.yml: pull_request types do not include ready_for_review/)
})

test('a pull_request workflow with no types is caught', () => {
  const text = workflow().replace('\n    types: [opened, synchronize, reopened, ready_for_review]', '')
  assert.match(messages(run([{ name: 'pr.yml', text }])), /pr\.yml: pull_request types do not include ready_for_review/)
})

test('types written as a block list are read', () => {
  const text = workflow().replace(
    'types: [opened, synchronize, reopened, ready_for_review]',
    'types:\n      - opened\n      - synchronize\n      - ready_for_review',
  )
  assert.deepEqual(run([{ name: 'pr.yml', text }]).problems, [])
})

test('a root job that runs on draft pull requests is caught', () => {
  const report = run([{ name: 'pr.yml', text: workflow({ jobs: `  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo ok` }) }])
  assert.match(messages(report), /pr\.yml job build: runs on draft pull requests/)
})

test('a root job whose condition never mentions draft is caught', () => {
  const report = run([{ name: 'pr.yml', text: workflow({ jobs: `  build:
    if: \${{ github.event_name == 'pull_request' }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo ok` }) }])
  assert.match(messages(report), /pr\.yml job build: runs on draft pull requests/)
})

test('a job that needs a guarded job inherits its draft skip', () => {
  const report = run([{ name: 'pr.yml', text: workflow({ jobs: `  changes:
    ${GUARD}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo ok
  heavy:
    needs: changes
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo ok` }) }])
  assert.deepEqual(report.problems, [])
})

test('a condition written as a block scalar is read', () => {
  const report = run([{ name: 'pr.yml', text: workflow({ jobs: `  build:
    if: >-
      github.event_name != 'pull_request' ||
      github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo ok` }) }])
  assert.deepEqual(report.problems, [])
})

test('a workflow with no pull_request trigger needs no draft guard', () => {
  const report = run([{ name: 'p.yml', text: workflow({ on: PUSH, concurrency: false, jobs: `  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo ok` }) }])
  assert.deepEqual(report.problems, [])
})

test('a workflow with no readable jobs fails closed', () => {
  const report = run([{ name: 'empty.yml', text: 'name: nothing\non:\n  push:\n' }])
  assert.match(messages(report), /empty\.yml: no jobs found/)
})

test('a reviewed exception raises the ceiling for exactly one job', () => {
  const text = workflow({ on: PUSH, concurrency: false, jobs: `  ship:
    runs-on: ubuntu-latest
    timeout-minutes: 240
    steps:
      - run: echo ok
  other:
    runs-on: ubuntu-latest
    timeout-minutes: 240
    steps:
      - run: echo ok` })
  const exceptions = [{ workflow: 'r.yml', job: 'ship', rule: 'timeout', max: 240, reason: 'waits on a store build' }]
  const report = run([{ name: 'r.yml', text }], exceptions)
  assert.match(messages(report), /r\.yml job other: timeout-minutes 240 exceeds 90/)
  assert.doesNotMatch(messages(report), /job ship/)
})

test('an exception that is no longer needed is caught', () => {
  const report = run([{ name: 'r.yml', text: workflow() }], [
    { workflow: 'r.yml', job: 'build', rule: 'timeout', max: 240, reason: 'once needed' },
  ])
  assert.match(messages(report), /exception for r\.yml job build \(timeout\) is stale/)
})

test('an exception that names nothing real is caught', () => {
  const report = run([{ name: 'r.yml', text: workflow() }], [
    { workflow: 'gone.yml', job: 'build', rule: 'timeout', max: 240, reason: 'renamed away' },
    { workflow: 'r.yml', job: 'missing', rule: 'timeout', max: 240, reason: 'renamed away' },
  ])
  assert.match(messages(report), /exception names gone\.yml, which is not a workflow/)
  assert.match(messages(report), /exception names job missing in r\.yml, which does not exist/)
})

test('an exception without a reason is caught', () => {
  const report = run([{ name: 'r.yml', text: workflow() }], [
    { workflow: 'r.yml', job: 'build', rule: 'timeout', max: 240, reason: '' },
  ])
  assert.match(messages(report), /exception for r\.yml job build \(timeout\) has no reason/)
})

test('every shipped exception carries a reason', () => {
  for (const exception of EXCEPTIONS) assert.ok(exception.reason && exception.reason.length > 20, JSON.stringify(exception))
})
