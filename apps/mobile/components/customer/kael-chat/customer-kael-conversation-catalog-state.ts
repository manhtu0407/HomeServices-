import type { Dispatch, SetStateAction } from 'react'

import type {
  CustomerKaelConversationResponse,
  CustomerKaelConversationSession,
} from '@/lib/api-types/customer'

export const catalogMemory = new Map<string, CustomerKaelConversationSession[]>()
export const responseMemory = new Map<string, CustomerKaelConversationResponse>()
export const activeResponseByCatalogMemory = new Map<string, CustomerKaelConversationResponse | null>()
export const archivedSessionIdsByCatalogMemory = new Map<string, Set<string>>()
export const CUSTOMER_SESSION_PREFETCH_LIMIT = 6

export function archivedSessionIdsForCatalog(catalogKey: string | null) {
  if (!catalogKey) return new Set<string>()
  const existing = archivedSessionIdsByCatalogMemory.get(catalogKey)
  if (existing) return existing
  const created = new Set<string>()
  archivedSessionIdsByCatalogMemory.set(catalogKey, created)
  return created
}

export type CustomerKaelCatalogState = {
  activeResponse: CustomerKaelConversationResponse | null
  catalogKey: string | null
  creatingSession: boolean
  openingSessionId: string | null
  pendingSessionIds: string[]
  sending: boolean
  sessions: CustomerKaelConversationSession[]
  sessionsError: string | null
  sessionsLoading: boolean
}

export function createCatalogState(
  catalogKey: string | null,
  activeResponseByCatalog: Map<string, CustomerKaelConversationResponse | null>,
): CustomerKaelCatalogState {
  return {
    activeResponse: catalogKey ? activeResponseByCatalog.get(catalogKey) ?? null : null,
    catalogKey,
    creatingSession: false,
    openingSessionId: null,
    pendingSessionIds: [],
    sending: false,
    sessions: catalogKey ? catalogMemory.get(catalogKey) ?? [] : [],
    sessionsError: null,
    sessionsLoading: Boolean(catalogKey && !catalogMemory.has(catalogKey)),
  }
}

function catalogStateForKey(
  current: CustomerKaelCatalogState,
  catalogKey: string | null,
  activeResponseByCatalog: Map<string, CustomerKaelConversationResponse | null>,
) {
  return current.catalogKey === catalogKey
    ? current
    : createCatalogState(catalogKey, activeResponseByCatalog)
}

export function patchCatalogState(
  setState: Dispatch<SetStateAction<CustomerKaelCatalogState>>,
  catalogKey: string | null,
  activeResponseByCatalog: Map<string, CustomerKaelConversationResponse | null>,
  patch: Partial<Omit<CustomerKaelCatalogState, 'catalogKey'>>,
) {
  setState((current) => ({
    ...catalogStateForKey(current, catalogKey, activeResponseByCatalog),
    ...patch,
    catalogKey,
  }))
}

export function setCatalogStateField<
  Field extends Exclude<keyof CustomerKaelCatalogState, 'catalogKey'>,
>(
  setState: Dispatch<SetStateAction<CustomerKaelCatalogState>>,
  catalogKey: string | null,
  activeResponseByCatalog: Map<string, CustomerKaelConversationResponse | null>,
  field: Field,
  next: SetStateAction<CustomerKaelCatalogState[Field]>,
) {
  setState((current) => {
    const scoped = catalogStateForKey(current, catalogKey, activeResponseByCatalog)
    const value = typeof next === 'function'
      ? (next as (previous: CustomerKaelCatalogState[Field]) => CustomerKaelCatalogState[Field])(scoped[field])
      : next
    return { ...scoped, [field]: value } as CustomerKaelCatalogState
  })
}
