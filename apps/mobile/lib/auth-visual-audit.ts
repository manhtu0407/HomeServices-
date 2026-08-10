import type { Session } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import { resolveLocalVisualAuditRole, type VisualAuditRole } from './auth-visual-audit-role'

export function getLocalVisualAuditRole(): VisualAuditRole | null {
  if (!__DEV__ || Platform.OS !== 'web') return null

  const runtime = globalThis as typeof globalThis & {
    location?: {
      hostname?: string
      search?: string
    }
    sessionStorage?: Parameters<typeof resolveLocalVisualAuditRole>[0]['sessionStorage']
  }
  return resolveLocalVisualAuditRole({
    hostname: runtime.location?.hostname ?? '',
    search: runtime.location?.search ?? '',
    sessionStorage: runtime.sessionStorage,
  })
}

export function buildLocalVisualAuditSession(role: VisualAuditRole): Session {
  const now = Math.floor(Date.now() / 1000)
  const isoNow = new Date(now * 1000).toISOString()
  const displayName = role === 'customer'
    ? 'NestScout Customer'
    : role === 'worker'
      ? 'NestScout Worker'
      : 'NestScout Admin'
  const email = role === 'customer'
    ? 'customer.audit@nestscout.local'
    : role === 'worker'
      ? 'worker.audit@nestscout.local'
      : 'admin.audit@nestscout.local'

  return {
    access_token: 'local-visual-audit',
    expires_at: now + 3600,
    expires_in: 3600,
    refresh_token: 'local-visual-audit',
    token_type: 'bearer',
    user: {
      app_metadata: { provider: 'local-visual-audit', providers: ['local-visual-audit'] },
      aud: 'authenticated',
      created_at: isoNow,
      email,
      id: `local-visual-audit-${role}`,
      role: 'authenticated',
      updated_at: isoNow,
      user_metadata: {
        full_name: displayName,
        name: displayName,
      },
    },
  } as Session
}
