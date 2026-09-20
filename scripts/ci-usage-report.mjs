// Reconstructs GitHub Actions usage for one calendar month from the workflow runs themselves.
//
// The billing API needs a `user` token scope that agent tokens do not carry, so this bills each
// job the way GitHub does — rounded up to a whole minute, skipped jobs free — and prices the
// total against the plan's included minutes and an optional budget. Against a real invoice it
// lands within a few percent; the gap is runs still in flight and storage charges, which this
// does not model.
//
//   node scripts/ci-usage-report.mjs [--month YYYY-MM] [--repo owner/name] [--budget USD]
//                                    [--included MINUTES] [--rate USD_PER_MINUTE]
//
// Needs an authenticated `gh`. A job that GitHub refused to start because a spending limit was
// reached fails within seconds having run no steps. It bills nothing and is counted apart, since
// a non-zero count means CI was blocked. The model and the runbook are in
// docs/ops/github-actions-cost.md.
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run_ = promisify(execFile)

export const DEFAULTS = { included: 2000, rate: 0.006 }

const BLOCKED_MAX_MS = 10_000
const RECENT_DAYS = 7
const JOB_FETCH_WORKERS = 6

export function isBillingBlocked(job) {
  if (job.conclusion !== 'failure' || job.steps !== 0 || !job.started_at || !job.completed_at) return false
  return Date.parse(job.completed_at) - Date.parse(job.started_at) <= BLOCKED_MAX_MS
}

/** Minutes one job bills: rounded up, and zero when it never ran or was refused by a spending limit. */
export function billableMinutes(job) {
  if (!job.started_at || !job.completed_at || job.conclusion === 'skipped' || isBillingBlocked(job)) return 0
  const ms = Date.parse(job.completed_at) - Date.parse(job.started_at)
  return ms > 0 ? Math.ceil(ms / 60_000) : 0
}

/** Totals for `runs`, each carrying its `jobs`, in the order the runs are given. */
export function summarize(runs) {
  const byWorkflow = new Map()
  const byDay = new Map()
  const blockedDays = new Map()
  const topRuns = []
  let minutes = 0
  let jobs = 0
  let blockedJobs = 0

  for (const run of runs) {
    const day = run.created_at.slice(0, 10)
    let runMinutes = 0
    for (const job of run.jobs ?? []) {
      jobs += 1
      if (isBillingBlocked(job)) {
        blockedJobs += 1
        blockedDays.set(day, (blockedDays.get(day) ?? 0) + 1)
        continue
      }
      runMinutes += billableMinutes(job)
    }
    minutes += runMinutes
    byDay.set(day, (byDay.get(day) ?? 0) + runMinutes)
    const key = `${run.name} | ${run.event}`
    const entry = byWorkflow.get(key) ?? { runs: 0, minutes: 0 }
    entry.runs += 1
    entry.minutes += runMinutes
    byWorkflow.set(key, entry)
    topRuns.push({ id: run.id, name: run.name, event: run.event, branch: run.head_branch, minutes: runMinutes })
  }

  topRuns.sort((a, b) => b.minutes - a.minutes)
  return { runs: runs.length, jobs, minutes, blockedJobs, blockedDays, byWorkflow, byDay, topRuns }
}

/** Spend so far, the month-end projection, and how long a budget lasts at the recent pace. */
export function project({
  minutes, elapsedDays, daysInMonth, included = DEFAULTS.included, rate = DEFAULTS.rate, budget, recentPerDay,
}) {
  const overageMinutes = Math.max(0, minutes - included)
  const projectedMinutes = Math.round((minutes / elapsedDays) * daysInMonth)
  const report = {
    overageMinutes,
    cost: overageMinutes * rate,
    projectedMinutes,
    projectedCost: Math.max(0, projectedMinutes - included) * rate,
    budgetMinutes: null,
    headroomMinutes: null,
    daysToBudget: null,
    exhaustsBeforeMonthEnd: null,
  }
  if (budget === undefined || budget === null) return report

  report.budgetMinutes = Math.round(included + budget / rate)
  report.headroomMinutes = Math.max(0, report.budgetMinutes - minutes)
  const pace = recentPerDay ?? minutes / elapsedDays
  if (report.headroomMinutes === 0) report.daysToBudget = 0
  else report.daysToBudget = pace > 0 ? Math.round((report.headroomMinutes / pace) * 100) / 100 : Infinity
  report.exhaustsBeforeMonthEnd = report.headroomMinutes === 0 || report.daysToBudget < daysInMonth - elapsedDays
  return report
}

async function gh(args) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const { stdout } = await run_('gh', args, { maxBuffer: 256 * 1024 * 1024, windowsHide: true })
      return stdout
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('the GitHub CLI (gh) is not installed or not on PATH')
      if (attempt === 4) throw error
      await new Promise((done) => setTimeout(done, 1500 * attempt))
    }
  }
}

const lines = (stdout) => stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))

function daysOf(month, throughDay) {
  const [year, monthIndex] = [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1]
  const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  return Array.from({ length: Math.min(count, throughDay) }, (_, index) =>
    new Date(Date.UTC(year, monthIndex, index + 1)).toISOString().slice(0, 10))
}

async function fetchRuns(repo, days) {
  const runs = []
  for (const day of days) {
    // The API returns at most 1000 results for any query that filters on `created`, hence one window per day.
    const found = lines(await gh([
      'api', '--paginate', '-X', 'GET', `repos/${repo}/actions/runs`,
      '-f', `created=${day}..${day}`, '-f', 'per_page=100',
      '--jq', '.workflow_runs[] | {id,name,event,created_at,head_branch}',
    ]))
    if (found.length >= 900) console.error(`warning: ${day} returned ${found.length} runs, near the API's 1000 cap`)
    runs.push(...found)
  }
  return runs
}

async function attachJobs(repo, runs) {
  let next = 0
  const worker = async () => {
    while (next < runs.length) {
      const target = runs[next]
      next += 1
      // filter=all keeps re-run attempts, which bill as well.
      target.jobs = lines(await gh([
        'api', '--paginate', '-X', 'GET', `repos/${repo}/actions/runs/${target.id}/jobs`,
        '-f', 'filter=all', '-f', 'per_page=100',
        '--jq', '.jobs[] | {name,conclusion,started_at,completed_at,steps:(.steps|length)}',
      ]))
    }
  }
  await Promise.all(Array.from({ length: JOB_FETCH_WORKERS }, worker))
}

function parseArguments(argv) {
  const options = { month: new Date().toISOString().slice(0, 7), ...DEFAULTS }
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]]
    if (value === undefined) throw new Error(`${flag} needs a value`)
    if (flag === '--month') options.month = value
    else if (flag === '--repo') options.repo = value
    else if (flag === '--budget') options.budget = Number(value)
    else if (flag === '--included') options.included = Number(value)
    else if (flag === '--rate') options.rate = Number(value)
    else throw new Error(`unknown argument: ${flag}`)
  }
  if (!/^\d{4}-\d{2}$/u.test(options.month)) throw new Error('--month must look like 2026-09')
  for (const key of ['budget', 'included', 'rate']) {
    if (options[key] !== undefined && !Number.isFinite(options[key])) throw new Error(`--${key} must be a number`)
  }
  return options
}

const money = (value) => `$${value.toFixed(2)}`
const pad = (value, width) => String(value).padEnd(width)
const padLeft = (value, width) => String(value).padStart(width)

export function render({ options, summary, days, daysInMonth }) {
  const elapsed = Math.max(1, days.length)
  const recentDays = days.slice(-RECENT_DAYS)
  const recentMinutes = recentDays.reduce((sum, day) => sum + (summary.byDay.get(day) ?? 0), 0)
  const recentPace = recentMinutes / Math.max(1, recentDays.length)
  const monthPace = summary.minutes / elapsed
  const report = project({
    minutes: summary.minutes,
    elapsedDays: elapsed,
    daysInMonth,
    included: options.included,
    rate: options.rate,
    budget: options.budget,
    recentPerDay: recentPace,
  })

  const out = []
  out.push(`${options.repo}  ${options.month}  (${elapsed} of ${daysInMonth} days)`)
  out.push(`${summary.runs} runs, ${summary.jobs} jobs, ${summary.minutes} billable minutes`)
  out.push(`included ${options.included} min, then $${options.rate.toFixed(3)}/min: ${report.overageMinutes} overage min = ${money(report.cost)}`)
  out.push(`projected month end: ${report.projectedMinutes} min = ${money(report.projectedCost)} at this month's average pace`)
  if (report.headroomMinutes !== null) {
    const lasts = (pace) => (pace > 0 ? `${Math.round((report.headroomMinutes / pace) * 10) / 10} days` : 'indefinitely')
    out.push(`budget ${money(options.budget)} allows ${report.budgetMinutes} min: ${report.headroomMinutes} min left, ${daysInMonth - elapsed} days remain`)
    out.push(
      `  lasts ${lasts(monthPace)} at the month's ${monthPace.toFixed(0)} min/day, ` +
      `${lasts(recentPace)} at the last ${recentDays.length} days' ${recentPace.toFixed(0)} min/day`,
    )
    if (report.headroomMinutes === 0) out.push('  BUDGET EXHAUSTED: new jobs are refused until it is raised or the month resets')
  }
  if (summary.blockedJobs > 0) {
    const detail = [...summary.blockedDays].map(([day, count]) => `${day} x${count}`).join(', ')
    out.push(`CI WAS BLOCKED: ${summary.blockedJobs} jobs were refused (no steps, failed in seconds): ${detail}`)
  }

  out.push('', 'by workflow | event')
  for (const [key, entry] of [...summary.byWorkflow].sort((a, b) => b[1].minutes - a[1].minutes).slice(0, 12)) {
    out.push(`  ${padLeft(entry.minutes, 5)} min  ${padLeft(entry.runs, 4)} runs  ${pad((entry.minutes / entry.runs).toFixed(1), 5)} min/run  ${key}`)
  }
  out.push('', 'by day (cumulative)')
  let cumulative = 0
  for (const [day, minutes] of summary.byDay) {
    cumulative += minutes
    out.push(`  ${day}  ${padLeft(minutes, 5)}  ${padLeft(cumulative, 6)}`)
  }
  out.push('', 'most expensive runs')
  for (const top of summary.topRuns.slice(0, 5)) out.push(`  ${padLeft(top.minutes, 4)} min  ${pad(top.name, 28)} ${pad(top.event, 18)} ${top.branch}`)
  return out.join('\n')
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  options.repo ??= (await gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])).trim()

  const today = new Date()
  const isCurrent = options.month === today.toISOString().slice(0, 7)
  const days = daysOf(options.month, isCurrent ? today.getUTCDate() : 31)
  const daysInMonth = daysOf(options.month, 31).length

  const runs = await fetchRuns(options.repo, days)
  await attachJobs(options.repo, runs)
  console.log(render({ options, summary: summarize(runs), days, daysInMonth }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ci-usage-report: ${error.message}`)
    process.exit(1)
  })
}
