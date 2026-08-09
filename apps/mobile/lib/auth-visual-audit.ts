import type { Session } from '@supabase/supabase-js'
import type { UserRole } from '@nestscout/shared'
import { Platform } from 'react-native'

type VisualAuditRole = Extract<UserRole, 'customer' | 'worker' | 'admin'>

export function getLocalVisualAuditRole(): VisualAuditRole | null {
  if (!__DEV__ || Platform.OS !== 'web') return null

  const runtime = globalThis as typeof globalThis & {
    location?: {
      hostname?: string
      search?: string
    }
  }
  const hostname = runtime.location?.hostname ?? ''
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) return null

  const role = new URLSearchParams(runtime.location?.search ?? '').get('ns_audit_role')
  return role === 'customer' || role === 'worker' || role === 'admin' ? role : null
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
