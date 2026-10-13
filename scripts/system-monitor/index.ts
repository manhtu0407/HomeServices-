import { isSystemHealthObserverConfigured, runSystemHealthObserver, type SystemHealthObserverEnv } from './observer'

export default {
  async fetch(request: Request, env: SystemHealthObserverEnv): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/healthz') {
      const configured = isSystemHealthObserverConfigured(env)
      return Response.json({ service: 'system-health-observer', status: configured ? 'configured' : 'not_configured' }, {
        status: configured ? 200 : 503,
        headers: { 'cache-control': 'no-store' },
      })
    }
    return Response.json({ error: 'NOT_FOUND' }, { status: 404, headers: { 'cache-control': 'no-store' } })
  },
  scheduled(event: { cron: string; scheduledTime: number }, env: SystemHealthObserverEnv, context: { waitUntil(promise: Promise<unknown>): void }) {
    context.waitUntil(runSystemHealthObserver(env, { scheduledTime: event.scheduledTime }).catch(() => undefined))
  },
}
