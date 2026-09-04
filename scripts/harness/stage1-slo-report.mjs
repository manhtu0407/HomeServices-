#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { verifySyntheticSmokeObservationChecksum } from '../../apps/api/scripts/lib/stage1-synthetic-smoke-core.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PREFIX = '[P59_SLO_OBSERVATION] '

export function buildStage1SloReport(observations) {
  if (!Array.isArray(observations) || observations.length !== 20) {
    throw new Error(`Stage 1 Staging SLO requires exactly 20 observations; received ${observations?.length ?? 0}`)
  }
  const releaseIds = new Set()
  const runIds = new Set()
  for (const observation of observations) {
    if (observation?.environment !== 'staging' || !verifySyntheticSmokeObservationChecksum(observation)) {
      throw new Error('Staging SLO observation identity or checksum is invalid')
    }
    if (observation.scenarios?.autoQuote !== true || observation.scenarios?.rfqOrInspection !== true ||
        observation.scenarios?.recovery !== true || observation.releaseIdentityMatch !== true ||
        observation.terminalReconcilePassed !== true || observation.syntheticLeakCount !== 0 ||
        observation.duplicateJobCount !== 0 || observation.duplicateBroadcastCount !== 0 ||
        observation.safeErrorCodeRatio !== 1 || !Number.isSafeInteger(observation.supportTraceCount) ||
        observation.supportTraceCount < 1) {
      throw new Error('Staging SLO observation did not preserve every functional invariant')
    }
    releaseIds.add(observation.releaseId)
    runIds.add(observation.runId)
  }
  if (releaseIds.size !== 1 || runIds.size !== observations.length) {
    throw new Error('Staging SLO observations must cover one release and 20 unique runs')
  }
  const confirmValues = observations.map((item) => item.confirmAcceptanceMs)
  const offerValues = observations.map((item) => item.workerOfferVisibleMs)
  const confirmP95Ms = nearestRankPercentile(confirmValues, 0.95)
  const workerOfferP95Ms = nearestRankPercentile(offerValues, 0.95)
  const report = {
    schemaVersion: 'stage1-staging-slo-report.v1',
    releaseId: observations[0].releaseId,
    environment: 'staging',
    runCount: observations.length,
    confirmAcceptanceP95Ms: confirmP95Ms,
    workerOfferVisibleP95Ms: workerOfferP95Ms,
    limits: { confirmAcceptanceP95Ms: 3_000, workerOfferVisibleP95Ms: 10_000 },
    functionalInvariantPassCount: observations.length,
    duplicateJobCount: 0,
    duplicateBroadcastCount: 0,
    syntheticLeakCount: 0,
    terminalReconcileRatio: 1,
    safeErrorCodeRatio: 1,
    observationSha256s: observations.map((item) => item.observationSha256).sort(),
    reportSha256: '',
  }
  report.reportSha256 = sha256(reportChecksumPayload(report))
  if (confirmP95Ms > report.limits.confirmAcceptanceP95Ms) {
    throw new Error(`Staging confirmation acceptance p95 exceeded 3 seconds: ${confirmP95Ms}ms`)
  }
  if (workerOfferP95Ms > report.limits.workerOfferVisibleP95Ms) {
    throw new Error(`Staging Worker offer visibility p95 exceeded 10 seconds: ${workerOfferP95Ms}ms`)
  }
  return report
}

export async function observationsFromLogDirectory(inputDirectory) {
  const entries = (await readdir(inputDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^run-\d{2}\.log$/u.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
  if (entries.length !== 20) {
    throw new Error(`Stage 1 Staging SLO requires run-01.log through run-20.log; found ${entries.length}`)
  }
  return Promise.all(entries.map(async (entry) => {
    const content = await readFile(resolve(inputDirectory, entry.name), 'utf8')
    const lines = content.split(/\r?\n/u).filter((line) => line.includes(PREFIX))
    if (lines.length !== 1) throw new Error(`${entry.name} must contain exactly one ${PREFIX.trim()} line`)
    return JSON.parse(lines[0].slice(lines[0].indexOf(PREFIX) + PREFIX.length))
  }))
}

export function nearestRankPercentile(values, ratio) {
  if (!Array.isArray(values) || values.length === 0 || !values.every(Number.isSafeInteger) ||
      !Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
    throw new Error('percentile input is invalid')
  }
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(ratio * sorted.length) - 1]
}

function reportChecksumPayload(report) {
  return [
    report.schemaVersion,
    report.releaseId,
    report.environment,
    report.runCount,
    report.confirmAcceptanceP95Ms,
    report.workerOfferVisibleP95Ms,
    report.limits.confirmAcceptanceP95Ms,
    report.limits.workerOfferVisibleP95Ms,
    report.functionalInvariantPassCount,
    report.duplicateJobCount,
    report.duplicateBroadcastCount,
    report.syntheticLeakCount,
    report.terminalReconcileRatio,
    report.safeErrorCodeRatio,
    ...report.observationSha256s,
  ].join('\n')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const observations = await observationsFromLogDirectory(resolve(ROOT, options.inputDirectory))
  const report = buildStage1SloReport(observations)
  const output = resolve(ROOT, options.output)
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`Stage 1 Staging SLO passed: ${basename(output)} (${report.runCount}/20)\n`)
}

function parseArgs(args) {
  const result = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (key === '--input-dir') result.inputDirectory = args[++index]
    else if (key === '--output') result.output = args[++index]
    else throw new Error(`unknown argument: ${key}`)
  }
  if (!result.inputDirectory || !result.output) throw new Error('--input-dir and --output are required')
  return result
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
