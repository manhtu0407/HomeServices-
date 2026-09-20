// Cost ratchet for GitHub Actions. Private-repository minutes are metered per job, each job is
// rounded up to a whole minute, and reaching the spending limit blocks every workflow at once.
// A monitor cron, a job with no timeout, or a premium runner is therefore a billing defect that
// takes CI down for everyone, not a style preference.
//
// Five properties are enforced on every workflow under .github/workflows:
//   - every job declares a literal timeout-minutes no larger than MAX_TIMEOUT_MINUTES, because a
//     hung job otherwise bills up to the 360-minute default;
//   - no schedule fires more than MAX_SCHEDULED_RUNS_PER_WEEK times a week — availability
//     monitoring belongs on an external uptime service, not on metered runner minutes;
//   - every job runs on a standard Linux runner (Windows and macOS bill several times more per
//     minute, and larger runners at their own rate);
//   - a workflow triggered by pull_request cancels superseded runs;
//   - a workflow triggered by pull_request lists ready_for_review and skips draft pull requests,
//     so iterating in a draft costs nothing until it is marked ready.
//
// A deliberate exception is added to EXCEPTIONS with a reason. An exception that no longer
// excuses anything, or names something that does not exist, fails — otherwise the list is where
// a real cost hole would hide. The billing model and how to measure real usage are in
// docs/ops/github-actions-cost.md.
//
//   node scripts/check-workflow-cost.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOWS = '.github/workflows'

export const MAX_TIMEOUT_MINUTES = 90
export const MAX_SCHEDULED_RUNS_PER_WEEK = 28

const STANDARD_LINUX_RUNNER = /^ubuntu-(?:latest|\d{2}\.\d{2})$/u

export const EXCEPTIONS = [
  {
    workflow: 'release-production.yml',
    job: 'production-release',
    rule: 'timeout',
    max: 240,
    reason: 'waits on EAS store builds for both platforms before it can attest the exact binaries',
  },
]

function indentOf(line) {
  return line.length - line.trimStart().length
}

function isContent(line) {
  const trimmed = line.trim()
  return trimmed !== '' && !trimmed.startsWith('#')
}

function stripValue(raw) {
  return raw.replace(/\s+#.*$/u, '').trim().replace(/^(['"])(.*)\1$/u, '$2')
}

/** Top-level blocks of a workflow: `{ key, inline, lines }`, where `lines` are the block's content lines. */
function topLevelBlocks(text) {
  const blocks = []
  let current = null
  for (const line of text.split(/\r?\n/u)) {
    if (!isContent(line)) continue
    const top = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line)
    if (top && indentOf(line) === 0) {
      current = { key: top[1], inline: stripValue(top[2]), lines: [] }
      blocks.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  }
  return blocks
}

/** The `types:` written under `pull_request:`, or null when the block form is absent. */
function pullRequestTypes(lines, base) {
  const start = lines.findIndex((line) => indentOf(line) === base && /^\s*(?:-\s*)?pull_request:\s*$/u.test(line))
  if (start === -1) return null
  const body = []
  for (const line of lines.slice(start + 1)) {
    if (indentOf(line) <= base) break
    body.push(line)
  }
  const at = body.findIndex((line) => /^\s*types:/u.test(line))
  if (at === -1) return new Set()
  const inline = /^\s*types:\s*\[(.*)\]\s*(?:#.*)?$/u.exec(body[at])
  if (inline) return new Set(inline[1].split(',').map((type) => stripValue(type)).filter(Boolean))
  const found = new Set()
  for (const line of body.slice(at + 1)) {
    const item = /^\s*-\s*(\S+)\s*(?:#.*)?$/u.exec(line)
    if (!item) break
    found.add(stripValue(item[1]))
  }
  return found
}

function parseTriggers(block) {
  const triggers = new Set()
  const crons = []
  let readable = true

  if (block.inline) {
    const names = block.inline.replace(/^\[|\]$/gu, '').split(',').map((name) => name.trim()).filter(Boolean)
    if (block.inline.startsWith('{') || names.length === 0) readable = false
    for (const name of names) triggers.add(name)
    return { triggers, crons, readable, pullRequestTypes: null }
  }

  if (block.lines.length === 0) return { triggers, crons, readable: false, pullRequestTypes: null }
  const base = Math.min(...block.lines.map(indentOf))
  for (const line of block.lines) {
    const cron = /^\s*-\s*cron:\s*(.+?)\s*$/u.exec(line)
    if (cron) {
      crons.push(stripValue(cron[1]))
      continue
    }
    if (indentOf(line) !== base) continue
    const key = /^\s*(?:-\s*)?([a-z_]+):?\s*$/u.exec(line) ?? /^\s*([a-z_]+):/u.exec(line)
    if (key) triggers.add(key[1])
  }
  return { triggers, crons, readable, pullRequestTypes: pullRequestTypes(block.lines, base) }
}

function parseConcurrency(block) {
  if (!block) return { present: false, cancels: false }
  const cancel = block.lines.map((line) => /^\s*cancel-in-progress:\s*(.+?)\s*$/u.exec(line)).find(Boolean)
  const value = cancel ? stripValue(cancel[1]).toLowerCase() : null
  return { present: true, cancels: value !== null && value !== 'false' }
}

function parseJobs(block) {
  if (!block || block.lines.length === 0) return []
  const base = Math.min(...block.lines.map(indentOf))
  const jobs = []
  let current = null
  let condition = null
  for (const line of block.lines) {
    const id = indentOf(line) === base ? /^\s*([A-Za-z0-9_-]+):\s*$/u.exec(line) : null
    if (id) {
      current = { id: id[1], runsOn: null, timeout: null, callsWorkflow: false, hasNeeds: false, condition: null }
      jobs.push(current)
      condition = null
      continue
    }
    if (!current) continue
    if (condition && indentOf(line) > base + 2) {
      current.condition = `${current.condition} ${line.trim()}`.trim()
      continue
    }
    condition = null
    const field = /^\s+(runs-on|timeout-minutes|uses|needs|if):\s*(.*?)\s*$/u.exec(line)
    if (!field || indentOf(line) !== base + 2) continue
    if (field[1] === 'runs-on') current.runsOn = stripValue(field[2])
    else if (field[1] === 'timeout-minutes') current.timeout = stripValue(field[2])
    else if (field[1] === 'needs') current.hasNeeds = true
    else if (field[1] === 'if') {
      current.condition = stripValue(field[2])
      // A folded or literal block scalar carries the expression on the lines below.
      if (/^[>|][-+]?$/u.test(current.condition)) {
        current.condition = ''
        condition = current
      }
    } else current.callsWorkflow = true
  }
  return jobs
}

function expand(field, min, max) {
  const values = new Set()
  for (const part of field.split(',')) {
    const match = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/u.exec(part)
    if (!match) return null
    const step = match[4] === undefined ? 1 : Number(match[4])
    if (step < 1) return null
    const wildcard = match[1] === '*'
    const from = wildcard ? min : Number(match[2])
    const to = wildcard ? max : match[3] !== undefined ? Number(match[3]) : match[4] !== undefined ? max : from
    if (from < min || to > max || from > to) return null
    for (let value = from; value <= to; value += step) values.add(value)
  }
  return values
}

/**
 * Runs per week of a five-field cron, or null when it cannot be read. Day-of-month and month
 * restrictions are ignored, which can only overstate the cadence.
 */
export function cronRunsPerWeek(expression) {
  const fields = String(expression).trim().split(/\s+/u)
  if (fields.length !== 5) return null
  const [minute, hour, , , weekday] = fields
  const minutes = expand(minute, 0, 59)
  const hours = expand(hour, 0, 23)
  const weekdays = weekday === '*' ? null : expand(weekday, 0, 7)
  if (!minutes || !hours || (weekday !== '*' && !weekdays)) return null
  const days = weekdays ? new Set([...weekdays].map((day) => day % 7)).size : 7
  return minutes.size * hours.size * days
}

function describe(exception) {
  return exception.rule === 'schedule'
    ? `${exception.workflow} schedule '${exception.cron}'`
    : `${exception.workflow} job ${exception.job}`
}

/**
 * Pure so the fixture suite can drive it without a repository; the CLI below supplies the real
 * files. `files` is `[{ name, text }]`.
 */
export function checkWorkflows({ files, exceptions = EXCEPTIONS }) {
  const problems = []
  const schedules = []
  const facts = new Map()
  let jobCount = 0

  if (files.length === 0) problems.push(`no workflows found under ${WORKFLOWS}`)

  const excuse = (name, rule, key) =>
    exceptions.find((exception) => exception.workflow === name && exception.rule === rule &&
      (rule === 'schedule' ? exception.cron === key : exception.job === key))

  for (const { name, text } of files) {
    const blocks = topLevelBlocks(text)
    const onBlock = blocks.find((block) => block.key === 'on' || block.key === "'on'" || block.key === 'true')
    const jobs = parseJobs(blocks.find((block) => block.key === 'jobs'))
    facts.set(name, { jobs: new Map(jobs.map((job) => [job.id, job])), crons: new Map() })

    if (jobs.length === 0) {
      problems.push(`${name}: no jobs found — cost cannot be proven for a workflow that cannot be read`)
      continue
    }
    jobCount += jobs.length

    const trigger = onBlock ? parseTriggers(onBlock) : { triggers: new Set(), crons: [], readable: false }
    if (!trigger.readable) problems.push(`${name}: the on: block is not in a form this check can read`)

    for (const cron of trigger.crons) {
      const perWeek = cronRunsPerWeek(cron)
      facts.get(name).crons.set(cron, perWeek)
      schedules.push({ workflow: name, cron, perWeek })
      const exception = excuse(name, 'schedule', cron)
      const limit = exception?.max ?? MAX_SCHEDULED_RUNS_PER_WEEK
      if (perWeek === null) {
        problems.push(`${name} schedule '${cron}': cannot measure the cadence — write a five-field cron this check can read`)
      } else if (perWeek > limit) {
        problems.push(
          `${name} schedule '${cron}': ${perWeek} runs/week exceeds ${limit} — every run bills at least one ` +
          'minute; use an external uptime monitor for availability checks',
        )
      }
    }

    const concurrency = parseConcurrency(blocks.find((block) => block.key === 'concurrency'))
    const isPullRequest = [...trigger.triggers].some((item) => item === 'pull_request' || item === 'pull_request_target')
    if (isPullRequest) {
      if (!concurrency.present) {
        problems.push(`${name}: pull_request trigger with no top-level concurrency — a superseded push would run to completion`)
      } else if (!concurrency.cancels) {
        problems.push(`${name}: concurrency never sets cancel-in-progress — superseded runs keep billing`)
      }
      if (!(trigger.pullRequestTypes ?? new Set()).has('ready_for_review')) {
        problems.push(`${name}: pull_request types do not include ready_for_review — a draft would never run CI once it is marked ready`)
      }
    }

    for (const job of jobs) {
      if (job.callsWorkflow) {
        problems.push(`${name} job ${job.id}: calls a reusable workflow, whose cost this check cannot read`)
        continue
      }
      if (!job.runsOn || !STANDARD_LINUX_RUNNER.test(job.runsOn)) {
        problems.push(
          `${name} job ${job.id}: runs-on '${job.runsOn ?? ''}' is not a standard Linux runner — ` +
          'Windows and macOS bill several times more per minute, and larger runners at their own rate',
        )
      }

      // A job that needs another is skipped with it, so only a job with no `needs` is a root.
      if (isPullRequest && !job.hasNeeds && !/\bdraft\b/u.test(job.condition ?? '')) {
        problems.push(
          `${name} job ${job.id}: runs on draft pull requests — start its if with ` +
          "github.event_name != 'pull_request' || github.event.pull_request.draft == false",
        )
      }

      const exception = excuse(name, 'timeout', job.id)
      const limit = exception?.max ?? MAX_TIMEOUT_MINUTES
      if (job.timeout === null) {
        problems.push(`${name} job ${job.id}: no timeout-minutes — a hung job bills to the 360-minute default`)
      } else if (!/^\d+$/u.test(job.timeout)) {
        problems.push(`${name} job ${job.id}: timeout-minutes ${job.timeout} is not a literal integer`)
      } else if (Number(job.timeout) > limit) {
        problems.push(`${name} job ${job.id}: timeout-minutes ${job.timeout} exceeds ${limit}`)
      }
    }
  }

  for (const exception of exceptions) {
    const label = `exception for ${describe(exception)} (${exception.rule})`
    if (!exception.reason || exception.reason.trim() === '') problems.push(`${label} has no reason`)

    const workflow = facts.get(exception.workflow)
    if (!workflow) {
      problems.push(`exception names ${exception.workflow}, which is not a workflow`)
      continue
    }
    if (exception.rule === 'schedule') {
      if (!workflow.crons.has(exception.cron)) {
        problems.push(`exception names schedule '${exception.cron}' in ${exception.workflow}, which does not exist`)
      } else if ((workflow.crons.get(exception.cron) ?? Infinity) <= MAX_SCHEDULED_RUNS_PER_WEEK) {
        problems.push(`${label} is stale — the schedule now fits the default cadence; delete the exception`)
      }
      continue
    }
    const job = workflow.jobs.get(exception.job)
    if (!job) {
      problems.push(`exception names job ${exception.job} in ${exception.workflow}, which does not exist`)
    } else if (/^\d+$/u.test(job.timeout ?? '') && Number(job.timeout) <= MAX_TIMEOUT_MINUTES) {
      problems.push(`${label} is stale — the job now fits the default ceiling; delete the exception`)
    }
  }

  return { problems, jobs: jobCount, schedules }
}

function main() {
  const directory = resolve(ROOT, WORKFLOWS)
  const files = existsSync(directory)
    ? readdirSync(directory)
      .filter((file) => /\.ya?ml$/u.test(file))
      .sort()
      .map((name) => ({ name, text: readFileSync(resolve(directory, name), 'utf8') }))
    : []

  const report = checkWorkflows({ files })
  if (report.problems.length > 0) {
    console.error('workflow cost problems:')
    for (const problem of report.problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log(
    `workflow cost ok: ${files.length} workflows, ${report.jobs} jobs bounded to ${MAX_TIMEOUT_MINUTES} min, ` +
    `${report.schedules.length} schedules within ${MAX_SCHEDULED_RUNS_PER_WEEK} runs/week`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
