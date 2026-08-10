import { resolveLocalVisualAuditRole } from '../auth-visual-audit-role'

type SessionStorage = {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

function createSessionStorage(): SessionStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

describe('local visual-audit identity', () => {
  it('keeps Customer and Worker roles isolated in tab-scoped session storage after route normalization', () => {
    const customerStorage = createSessionStorage()
    const workerStorage = createSessionStorage()

    expect(resolveLocalVisualAuditRole({
      hostname: 'localhost',
      search: '?ns_audit_role=customer',
      sessionStorage: customerStorage,
    })).toBe('customer')

    expect(resolveLocalVisualAuditRole({
      hostname: 'localhost',
      search: '?ns_audit_role=worker',
      sessionStorage: workerStorage,
    })).toBe('worker')

    expect(resolveLocalVisualAuditRole({
      hostname: 'localhost',
      search: '',
      sessionStorage: customerStorage,
    })).toBe('customer')

    expect(resolveLocalVisualAuditRole({
      hostname: 'localhost',
      search: '',
      sessionStorage: workerStorage,
    })).toBe('worker')
  })

  it('clears a tab-scoped audit role when an explicit invalid role is supplied', () => {
    const storage = createSessionStorage()
    expect(resolveLocalVisualAuditRole({
      hostname: 'localhost',
      search: '?ns_audit_role=customer',
      sessionStorage: storage,
    })).toBe('customer')

    expect(resolveLocalVisualAuditRole({
      hostname: 'localhost',
      search: '?ns_audit_role=unsupported',
      sessionStorage: storage,
    })).toBeNull()

    expect(resolveLocalVisualAuditRole({
      hostname: 'localhost',
      search: '',
      sessionStorage: storage,
    })).toBeNull()
  })
})
