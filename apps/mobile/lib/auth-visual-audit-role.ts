import type { UserRole } from '@nestscout/shared'

export type VisualAuditRole = Extract<UserRole, 'customer' | 'worker' | 'admin'>

type VisualAuditSessionStorage = {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

const VISUAL_AUDIT_ROLE_SESSION_KEY = 'nestscout.localVisualAuditRole'

export function resolveLocalVisualAuditRole(input: {
  hostname: string
  search: string
  sessionStorage?: VisualAuditSessionStorage
}): VisualAuditRole | null {
  if (!['localhost', '127.0.0.1', '::1'].includes(input.hostname)) return null

  const params = new URLSearchParams(input.search)
  const requestedRole = params.get('ns_audit_role')
  if (requestedRole !== null) {
    const role = visualAuditRoleFromValue(requestedRole)
    try {
      if (role) input.sessionStorage?.setItem(VISUAL_AUDIT_ROLE_SESSION_KEY, role)
      else input.sessionStorage?.removeItem(VISUAL_AUDIT_ROLE_SESSION_KEY)
    } catch {
      return role
    }
    return role
  }

  try {
    return visualAuditRoleFromValue(input.sessionStorage?.getItem(VISUAL_AUDIT_ROLE_SESSION_KEY) ?? '')
  } catch {
    return null
  }
}

function visualAuditRoleFromValue(value: string): VisualAuditRole | null {
  return value === 'customer' || value === 'worker' || value === 'admin' ? value : null
}
