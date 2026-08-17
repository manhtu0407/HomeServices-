import { vi } from 'vitest'

// The only seam between Kael and a model provider is `globalThis.fetch`. Every pipeline test
// therefore hand-rolled the same hostname switch and the same two response envelopes. This
// centralises both, so a pillar can script a run in a few lines and — just as often — assert that
// no provider was reached at all.

export type ProviderName = 'anthropic' | 'deepseek' | 'perplexity'

// Whatever the caller wants the model to have said. `content` is the raw string the adapter
// extracts; structured stages expect it to be JSON, which is the caller's business, not ours.
export type ProviderReply =
  | { content: string; inputTokens?: number; outputTokens?: number }
  | { status: number; error: { message: string; code?: string } }

export type ProviderRequestBody = {
  model?: string
  max_tokens?: number
  messages?: readonly unknown[]
  [key: string]: unknown
}

export type ProviderCall = {
  provider: ProviderName
  url: string
  body: ProviderRequestBody
}

export type ProviderScript = Partial<
  Record<ProviderName, ProviderReply | ((body: ProviderRequestBody) => ProviderReply)>
>

const PROVIDER_BY_HOST: Record<string, ProviderName> = {
  'api.anthropic.com': 'anthropic',
  'api.deepseek.com': 'deepseek',
  'api.perplexity.ai': 'perplexity',
}

function isError(reply: ProviderReply): reply is Extract<ProviderReply, { status: number }> {
  return 'status' in reply
}

// Each provider parses a different envelope; a pillar should describe what the model said, not
// relearn the wire format. Anthropic reads content[].text + usage.input_tokens/output_tokens;
// DeepSeek and Perplexity are OpenAI-compatible.
function envelope(provider: ProviderName, reply: ProviderReply): Response {
  if (isError(reply)) {
    return new Response(JSON.stringify({ error: reply.error }), { status: reply.status })
  }
  const inputTokens = reply.inputTokens ?? 40
  const outputTokens = reply.outputTokens ?? 12
  if (provider === 'anthropic') {
    return new Response(
      JSON.stringify({
        content: [{ type: 'text', text: reply.content }],
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      }),
    )
  }
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: reply.content } }],
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens },
    }),
  )
}

export function scriptedProviderFetch(script: ProviderScript): {
  fetch: typeof globalThis.fetch
  calls: ProviderCall[]
} {
  const calls: ProviderCall[] = []

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const provider = PROVIDER_BY_HOST[new URL(url).hostname]
    // An unmodelled call must fail loudly. A silent default here would let a pillar claim it
    // proved something about a stage that never actually ran.
    if (!provider) throw new Error(`unexpected provider URL ${url}`)

    let body: ProviderRequestBody = {}
    try {
      body = JSON.parse(String(init?.body ?? '{}')) as ProviderRequestBody
    } catch {
      body = {}
    }
    calls.push({ provider, url, body })

    const scripted = script[provider]
    if (scripted === undefined) {
      throw new Error(`provider ${provider} was called but the script does not cover it`)
    }
    return envelope(provider, typeof scripted === 'function' ? scripted(body) : scripted)
  })

  return { fetch: fetchImpl as unknown as typeof globalThis.fetch, calls }
}
