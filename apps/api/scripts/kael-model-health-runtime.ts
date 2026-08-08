#!/usr/bin/env node
import { performance } from 'node:perf_hooks'

const selfTest = process.env.KAEL_MODEL_HEALTH_SELF_TEST === 'yes'
const timeoutMs = positiveIntegerEnv('KAEL_MODEL_HEALTH_TIMEOUT_MS', 10_000)
const maxRetries = boundedIntegerEnv('KAEL_MODEL_HEALTH_MAX_RETRIES', 2, 0, 2)

installDenoEnvShim()
if (selfTest) installProviderFetchStub()

const [{ callAI }, { KAEL_ROUTING_CONFIG }] = await Promise.all([
  import('../../../supabase/functions/mobile-api/_shared/kael/kael-providers/provider-client.ts'),
  import('../../../supabase/functions/mobile-api/_shared/kael/kael-providers/routing.config.ts'),
])

const inventory = routingInventory(KAEL_ROUTING_CONFIG)
const secrets = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  perplexityApiKey: process.env.PERPLEXITY_API_KEY,
  durableGuardsEnabled: false,
}
const results = []
for (const entry of inventory) {
  const started = performance.now()
  const response = await callAI({
    provider: entry.provider,
    model: entry.model,
    purpose: entry.purposes[0] as Parameters<typeof callAI>[0]["purpose"],
    messages: [{ role: 'user', content: 'Return a minimal health-check response.' }],
    maxTokens: 4,
    temperature: 0,
    timeoutMs,
    maxRetries,
  }, secrets)
  results.push({
    ...entry,
    status: response.success ? 'ok' : 'failed',
    latency_ms: Math.round(performance.now() - started),
    ...(response.success
      ? { provider_latency_ms: response.latencyMs }
      : { error: `${response.code}: ${response.error}`.slice(0, 240) }),
  })
}

const summary = {
  checked_at: new Date().toISOString(),
  mode: selfTest ? 'provider-client-self-test' : 'provider-client-live',
  models: results,
  passed: results.every((entry) => entry.status === 'ok'),
}
console.log(JSON.stringify(summary, null, 2))
if (!summary.passed) process.exitCode = 1

function routingInventory(config: Record<string, {
  purpose: string
  primary: { provider: string; model: string }
  simpleNormalChatPrimary?: { provider: string; model: string }
  modelFallback?: { provider: string; model: string }
  fallback?: { provider: string; model: string }
  escalation?: { provider: string; model: string }
}>) {
  const models = new Map<string, { provider: 'anthropic' | 'deepseek' | 'perplexity'; model: string; purposes: string[] }>()
  for (const item of Object.values(config)) {
    for (const route of [item.primary, item.simpleNormalChatPrimary, item.modelFallback, item.fallback, item.escalation]) {
      if (!route) continue
      const provider = route.provider as 'anthropic' | 'deepseek' | 'perplexity'
      const key = `${provider}:${route.model}`
      const current = models.get(key) ?? { provider, model: route.model, purposes: [] }
      if (!current.purposes.includes(item.purpose)) current.purposes.push(item.purpose)
      models.set(key, current)
    }
  }
  return [...models.values()]
    .map((item) => ({ ...item, purposes: item.purposes.sort() }))
    .sort((a, b) => `${a.provider}:${a.model}`.localeCompare(`${b.provider}:${b.model}`))
}

function installDenoEnvShim() {
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: { env: { get: (name: string) => process.env[name] } },
  })
}

function installProviderFetchStub() {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('anthropic.com')) {
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: 'OK' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'OK' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function boundedIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback
}
