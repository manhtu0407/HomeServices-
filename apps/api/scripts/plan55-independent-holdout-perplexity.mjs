#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertPlan55PerplexityJudgeContract,
  buildPlan55PerplexityJudgeResult,
} from './lib/plan55-independent-holdout-agent.mjs'

const API_URL = 'https://api.perplexity.ai/v1/agent'
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 8 * 60 * 1000
const MAX_RETRY_AFTER_MS = 10_000

export async function invokePlan55PerplexityJudge({
  contract,
  reviewPackage,
  apiKey = process.env.PERPLEXITY_API_KEY,
  fetchImpl = fetch,
  sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
} = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim().length < 16 ||
      typeof fetchImpl !== 'function' || typeof sleep !== 'function') {
    throw new Error('plan55_perplexity_configuration_invalid')
  }
  const validatedContract = assertPlan55PerplexityJudgeContract({ contract, reviewPackage })

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    const controller = new AbortController()
    let timeout
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort()
        reject(new Error('plan55_perplexity_timeout'))
      }, REQUEST_TIMEOUT_MS)
    })
    let response
    let retryDelayMs = null
    try {
      try {
        response = await Promise.race([fetchImpl(API_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey.trim()}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(validatedContract.request),
          signal: controller.signal,
        }), timeoutPromise])
      } catch (error) {
        if (controller.signal.aborted) throw new Error('plan55_perplexity_timeout')
        if (error?.message === 'plan55_perplexity_timeout') throw error
        throw new Error('plan55_perplexity_transport_outcome_unknown')
      }

      if (response?.ok) {
        let bodyText
        try {
          bodyText = await Promise.race([
            readBoundedResponseText(response, controller.signal),
            timeoutPromise,
          ])
        } catch (error) {
          if (controller.signal.aborted || error?.message === 'plan55_perplexity_timeout') {
            throw new Error('plan55_perplexity_timeout')
          }
          if (error?.message === 'plan55_perplexity_response_too_large') throw error
          throw new Error('plan55_perplexity_response_unreadable')
        }
        let responseBody
        try {
          responseBody = JSON.parse(bodyText)
        } catch {
          throw new Error('plan55_perplexity_response_invalid')
        }
        return buildPlan55PerplexityJudgeResult({ contract: validatedContract, response: responseBody })
      }

      if (response?.status !== 429 || attempt === 2) {
        cancelResponseBody(response)
        throw new Error(response?.status >= 500
          ? 'plan55_perplexity_server_outcome_unknown'
          : `plan55_perplexity_http_${response?.status ?? 'invalid'}`)
      }
      const retryAfter = Number(response.headers?.get?.('retry-after'))
      retryDelayMs = Number.isFinite(retryAfter) && retryAfter >= 0
        ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
        : 2_000 * (2 ** attempt)
      cancelResponseBody(response)
    } finally {
      clearTimeout(timeout)
      if (!controller.signal.aborted) controller.abort()
    }
    if (retryDelayMs !== null) await sleep(retryDelayMs)
  }
  throw new Error('plan55_perplexity_retry_exhausted')
}

async function main(argv) {
  const args = parseArguments(argv)
  const reviewPackage = readJson(args.reviewPackagePath)
  const contract = readJson(args.contractPath)
  const result = await invokePlan55PerplexityJudge({ contract, reviewPackage })
  writeFileSync(args.outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  process.stdout.write(`${JSON.stringify({
    schema: result.schema,
    status: 'perplexity_judgment_complete',
    model_id: result.model_id,
    invocation_id: result.invocation_id,
    source_sha: result.source_sha,
    package_sha256: result.package_sha256,
    judgments_sha256: result.judgments_sha256,
    source_count: result.sources.length,
    usage: result.usage,
  })}\n`)
}

function parseArguments(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error('arguments_invalid')
    if (flag === '--review-package' && !args.reviewPackagePath) args.reviewPackagePath = resolve(value)
    else if (flag === '--contract' && !args.contractPath) args.contractPath = resolve(value)
    else if (flag === '--output' && !args.outputPath) args.outputPath = resolve(value)
    else throw new Error('arguments_invalid')
    index += 1
  }
  if (!args.reviewPackagePath || !args.contractPath || !args.outputPath) throw new Error('arguments_invalid')
  return args
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error('plan55_perplexity_contract_unreadable')
  }
}

async function readBoundedResponseText(response, signal) {
  if (!response?.body || typeof response.body.getReader !== 'function') {
    throw new Error('plan55_perplexity_response_unreadable')
  }
  const contentLength = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    cancelResponseBody(response)
    throw new Error('plan55_perplexity_response_too_large')
  }

  const reader = response.body.getReader()
  const chunks = []
  let totalBytes = 0
  let completed = false
  const cancelOnAbort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancelOnAbort, { once: true })
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        completed = true
        break
      }
      const chunk = Buffer.from(value)
      totalBytes += chunk.byteLength
      if (totalBytes > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => {})
        throw new Error('plan55_perplexity_response_too_large')
      }
      chunks.push(chunk)
    }
    return Buffer.concat(chunks, totalBytes).toString('utf8')
  } finally {
    signal.removeEventListener('abort', cancelOnAbort)
    if (completed) reader.releaseLock()
  }
}

function cancelResponseBody(response) {
  try {
    const cancellation = response?.body?.cancel?.()
    if (cancellation && typeof cancellation.catch === 'function') void cancellation.catch(() => {})
  } catch {
    // Response cleanup is best effort; only safe status codes are surfaced.
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    const code = String(error?.message ?? '').match(/^[a-z0-9_:-]+$/u)?.[0] ??
      'plan55_perplexity_judge_failed'
    process.stderr.write(`${code}\n`)
    process.exitCode = 1
  }
}
