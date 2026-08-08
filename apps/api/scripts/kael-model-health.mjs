#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')
const routingPath = resolve(repoRoot, 'supabase/functions/mobile-api/_shared/kael/kael-providers/routing.config.ts')

async function main() {
  const args = new Set(process.argv.slice(2))
  const inventory = await readRoutingInventory()
  if (args.has('--list')) {
    console.log(JSON.stringify({ mode: 'inventory', models: inventory }, null, 2))
    return
  }

  const selfTest = args.has('--self-test')
  if (!selfTest) {
    const missing = [...new Set(inventory.map((entry) => providerKeyName(entry.provider)))]
      .filter((name) => !process.env[name]?.trim())
    if (missing.length > 0) {
      throw new Error(`Missing provider credentials: ${missing.join(', ')}. Use --list for a no-I/O inventory check.`)
    }
  }

  const runtimePath = resolve(scriptDir, 'kael-model-health-runtime.ts')
  const child = spawn(process.execPath, ['--experimental-transform-types', runtimePath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...(selfTest ? {
        ANTHROPIC_API_KEY: 'self-test-anthropic',
        DEEPSEEK_API_KEY: 'self-test-deepseek',
        PERPLEXITY_API_KEY: 'self-test-perplexity',
        KAEL_MODEL_HEALTH_MAX_RETRIES: '0',
        KAEL_MODEL_HEALTH_SELF_TEST: 'yes',
      } : {}),
    },
    stdio: 'inherit',
  })
  await new Promise((resolvePromise, reject) => {
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`Model-health runtime terminated by ${signal}`))
      else if (code === 0) resolvePromise()
      else reject(new Error(`Model-health runtime failed with exit ${code ?? 1}`))
    })
  })
}

async function readRoutingInventory() {
  const source = await readFile(routingPath, 'utf8')
  const models = new Map()
  for (const [provider, defaultModel, pattern] of [
    ['anthropic', 'claude-sonnet-5', /anthropic\((?:"([^"]+)")?\)/g],
    ['perplexity', 'sonar', /perplexity\((?:"([^"]+)")?\)/g],
    ['deepseek', 'deepseek-v4-pro', /deepseek\((?:"([^"]+)")?\)/g],
  ]) {
    for (const match of source.matchAll(pattern)) {
      const model = match[1] || defaultModel
      models.set(`${provider}:${model}`, { provider, model })
    }
  }
  if (source.includes('deepseekFlash()')) {
    models.set('deepseek:deepseek-v4-flash', { provider: 'deepseek', model: 'deepseek-v4-flash' })
  }
  const inventory = [...models.values()].sort((a, b) => `${a.provider}:${a.model}`.localeCompare(`${b.provider}:${b.model}`))
  if (inventory.length < 5) throw new Error('Routing inventory parser found too few models')
  return inventory
}

function providerKeyName(provider) {
  if (provider === 'anthropic') return 'ANTHROPIC_API_KEY'
  if (provider === 'deepseek') return 'DEEPSEEK_API_KEY'
  return 'PERPLEXITY_API_KEY'
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
