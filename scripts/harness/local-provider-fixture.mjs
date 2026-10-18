export function createLocalProviderFixtureFetch({ localOrigin, reply, fetch: transport }) {
  const originError = () => { throw new Error('QA fixture local origin refused') }
  try {
    const local = new URL(localOrigin)
    if (local.origin !== localOrigin || local.protocol !== 'http:' || local.username || local.password ||
        !['127.0.0.1', 'host.docker.internal'].includes(local.hostname) || Number(local.port) < 1024 || !local.port) originError()
  } catch { originError() }
  if (typeof transport !== 'function') originError()
  const content = JSON.stringify(reply)
  if (!content || content.length > 65536) throw new Error('QA fixture reply refused')
  const counts = { local: 0, providerFixture: 0, denied: 0 }
  const deny = message => {
    counts.denied += 1
    throw new Error(message)
  }
  const fixtureFetch = async (input, init) => {
    let request
    let url
    try {
      request = new Request(input, init)
      url = new URL(request.url)
    } catch { return deny('QA fixture network target refused') }
    if (url.username || url.password || url.hash) return deny('QA fixture network target refused')
    if (url.origin === localOrigin && ['/auth/v1/', '/rest/v1/', '/storage/v1/'].some(path => url.pathname.startsWith(path))) {
      counts.local += 1
      return transport(request, {
        headers: request.headers, redirect: 'error',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
      })
    }
    if (url.href !== 'https://api.anthropic.com/v1/messages') return deny('QA fixture network target refused')
    if (request.method !== 'POST') return deny('QA fixture provider request refused')
    let body
    try {
      const text = await request.text()
      if (text.length > 2 * 1024 * 1024) throw new Error('fixture body too large')
      body = JSON.parse(text)
    } catch { return deny('QA fixture provider request refused') }
    if (!body || typeof body.model !== 'string' || !body.model || body.model.length > 100 || !Array.isArray(body.messages)) {
      return deny('QA fixture provider request refused')
    }
    counts.providerFixture += 1
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: content }],
      usage: { input_tokens: 0, output_tokens: 0 },
    }), { headers: { 'content-type': 'application/json' } })
  }
  return { fetch: fixtureFetch, counts: () => ({ ...counts }) }
}
