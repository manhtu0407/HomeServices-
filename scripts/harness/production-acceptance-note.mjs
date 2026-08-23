#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { verifySyntheticCleanupReceipt } from '../../apps/api/scripts/lib/stage1-synthetic-cleanup-core.mjs'
import { verifyProductionUiNormalityReceipt } from '../check-production-ui-copy.mjs'
import { compareDeploymentState } from './deployment-drift.mjs'
import { checkHarnessRelease, resolveReleaseArtifactPath } from './release-bundle.mjs'
import { assertReleaseTarget } from './release-safety.mjs'
import { verifyStage1PromotionPacket } from './stage1-promotion-packet.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function buildProductionAcceptanceRpcArgs(input) {
  const releaseProblems = checkHarnessRelease(input?.release)
  if (releaseProblems.length > 0 || input.release.environment !== 'production') {
    throw new Error(`Production acceptance release is invalid: ${releaseProblems.join('; ')}`)
  }
  if (!verifyProductionUiNormalityReceipt(input.productionUiReceipt) ||
      input.productionUiReceipt.sourceSha256 !== input.release.productionUiSourceSha256) {
    throw new Error('Production UI normality receipt is invalid or belongs to different source')
  }
  if (!verifySyntheticCleanupReceipt(input.cleanupReceipt) ||
      input.cleanupReceipt.releaseId !== input.release.releaseId ||
      input.cleanupReceipt.cohortId !== input.promotionPacket?.cohortId ||
      input.cleanupReceipt.status !== 'cleaned' || input.cleanupReceipt.memberCount !== 2 ||
      input.cleanupReceipt.workerMemberCount !== 1 || input.cleanupReceipt.workerMarkerCount !== 1 ||
      input.cleanupReceipt.activeDeliverySignalCount !== 0 || input.cleanupReceipt.scenarioRecordCount !== 0) {
    throw new Error('Production exact-cohort cleanup receipt is invalid')
  }
  const packetProblems = verifyStage1PromotionPacket(input.promotionPacket)
  if (packetProblems.length > 0 || input.promotionPacket.release.releaseId !== input.release.releaseId ||
      input.promotionPacket.release.productionUiSourceSha256 !== input.productionUiReceipt.sourceSha256 ||
      input.promotionPacket.productionUiNormality.receiptSha256 !== input.productionUiReceipt.receiptSha256) {
    throw new Error(`Production promotion packet is invalid: ${packetProblems.join('; ')}`)
  }
  const drift = compareDeploymentState({
    release: input.release,
    inventory: input.release.migrationInventory,
    remote: input.hostedState,
  })
  if (!drift.ok || input.hostedState.environment !== 'production' ||
      input.hostedState.projectRef !== 'iwevizmsedyqozxlawwl') {
    throw new Error(`Production hosted state does not prove the promoted release: ${drift.problems.join('; ')}`)
  }
  for (const [name, value] of Object.entries({
    hostedStateSha256: input.hostedStateSha256,
    promotionPacketSha256: input.promotionPacket.packetSha256,
  })) {
    if (!/^[0-9a-f]{64}$/u.test(value ?? '')) throw new Error(`${name} is invalid`)
  }
  return Object.freeze({
    p_release_id: input.release.releaseId,
    p_cohort_id: input.promotionPacket.cohortId,
    p_ui_source_sha256: input.productionUiReceipt.sourceSha256,
    p_ui_scanned_file_count: input.productionUiReceipt.scannedFileCount,
    p_ui_visible_literal_count: input.productionUiReceipt.visibleLiteralCount,
    p_ui_generated_at: input.productionUiReceipt.generatedAt,
    p_ui_receipt_sha256: input.productionUiReceipt.receiptSha256,
    p_cleanup_run_id: input.cleanupReceipt.runId,
    p_cleanup_member_count: input.cleanupReceipt.memberCount,
    p_cleanup_worker_member_count: input.cleanupReceipt.workerMemberCount,
    p_cleanup_worker_marker_count: input.cleanupReceipt.workerMarkerCount,
    p_cleanup_generated_at: input.cleanupReceipt.generatedAt,
    p_cleanup_receipt_sha256: input.cleanupReceipt.receiptSha256,
    p_hosted_state_sha256: input.hostedStateSha256,
    p_promotion_packet_sha256: input.promotionPacket.packetSha256,
  })
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const target = assertReleaseTarget({
    environment: 'production',
    projectRef: options.projectRef,
    projectUrl: options.projectUrl,
  })
  const releaseBytes = readArtifact(options.release)
  const uiBytes = readArtifact(options.productionUiNormality)
  const cleanupBytes = readArtifact(options.cleanup)
  const hostedBytes = readArtifact(options.hosted)
  const packetBytes = readArtifact(options.promotionPacket)
  const args = buildProductionAcceptanceRpcArgs({
    release: JSON.parse(releaseBytes),
    productionUiReceipt: JSON.parse(uiBytes),
    cleanupReceipt: JSON.parse(cleanupBytes),
    hostedState: JSON.parse(hostedBytes),
    hostedStateSha256: sha256Bytes(hostedBytes),
    promotionPacket: JSON.parse(packetBytes),
  })
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const rows = await callAcceptanceRpc(target.projectUrl, serviceRoleKey, args)
  const note = rows?.[0]
  if (!note || note.release_id !== args.p_release_id ||
      note.cohort_id !== args.p_cohort_id || note.acceptance_status !== 'verified' ||
      note.production_ui_receipt_sha256 !== args.p_ui_receipt_sha256 ||
      note.cleanup_receipt_sha256 !== args.p_cleanup_receipt_sha256 ||
      note.hosted_state_sha256 !== args.p_hosted_state_sha256 ||
      note.promotion_packet_sha256 !== args.p_promotion_packet_sha256 ||
      !/^[0-9a-f]{64}$/u.test(note.note_sha256 ?? '')) {
    throw new Error('Supabase Production acceptance note was not recorded exactly')
  }
  const receipt = {
    schemaVersion: 'stage1-production-acceptance-note.v1',
    status: 'verified',
    projectRef: target.projectRef,
    releaseId: note.release_id,
    cohortId: note.cohort_id,
    noteSha256: note.note_sha256,
    productionUiReceiptSha256: note.production_ui_receipt_sha256,
    cleanupReceiptSha256: note.cleanup_receipt_sha256,
    hostedStateSha256: note.hosted_state_sha256,
    promotionPacketSha256: note.promotion_packet_sha256,
    createdAt: note.created_at,
  }
  const output = resolveReleaseArtifactPath(ROOT, options.output)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`)
  process.stdout.write(`Supabase Production acceptance note verified: ${relative(ROOT, output).replaceAll('\\', '/')}\n`)
}

export async function callAcceptanceRpc(projectUrl, serviceRoleKey, args, fetchImpl = fetch) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetchImpl(`${projectUrl}/rest/v1/rpc/record_stage1_production_acceptance_note`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    })
    const text = await boundedResponseText(response, 64 * 1_024)
    if (!response.ok) throw new Error(`Production acceptance RPC returned HTTP ${response.status}`)
    const value = JSON.parse(text)
    if (!Array.isArray(value) || value.length !== 1) throw new Error('Production acceptance RPC returned an invalid row set')
    return value
  } finally {
    clearTimeout(timeout)
  }
}

async function boundedResponseText(response, maximumBytes) {
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > maximumBytes) throw new Error('Production acceptance RPC response exceeded its bound')
  return new TextDecoder().decode(bytes)
}

function readArtifact(path) {
  return readFileSync(resolveReleaseArtifactPath(ROOT, path))
}

function parseArgs(args) {
  const values = {}
  const allowed = new Set([
    '--project-ref', '--project-url', '--release', '--production-ui-normality',
    '--cleanup', '--hosted', '--promotion-packet', '--output',
  ])
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!allowed.has(key)) throw new Error(`unknown argument: ${key}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    values[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value
  }
  for (const key of ['projectRef', 'projectUrl', 'release', 'productionUiNormality', 'cleanup', 'hosted', 'promotionPacket', 'output']) {
    if (!values[key]) throw new Error(`Production acceptance note option is missing: ${key}`)
  }
  return values
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`missing required environment variable ${name}`)
  return value
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
