import { runSystemHealthObserver, type SystemHealthObserverEnv } from './observer'

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/healthz') {
      return Response.json({ service: 'system-health-observer', status: 'ready' }, { headers: { 'cache-control': 'no-store' } })
    }
    return Response.json({ error: 'NOT_FOUND' }, { status: 404, headers: { 'cache-control': 'no-store' } })
  },
  scheduled(_event: { cron: string }, env: SystemHealthObserverEnv, context: { waitUntil(promise: Promise<unknown>): void }) {
    context.waitUntil(runSystemHealthObserver(env).catch(() => undefined))
  },
}
