import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isVisibleCustomerConversationCatalogRow } from '../../../../../supabase/functions/mobile-api/_shared/domains/customer/kael-conversation-projection'
import { matchCustomerKaelConversationRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/customer-kael-conversation-routes'

function readUtf8(url: URL) {
  return readFileSync(url, 'utf8')
}

function listTsFiles(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir)
    return entry.isDirectory() ? listTsFiles(child) : entry.name.endsWith('.ts') ? [child] : []
  })
}

function readRouterLayer() {
  const root = new URL('../../../../../supabase/functions/mobile-api/_shared/', import.meta.url)
  return [
    readUtf8(new URL('http.ts', root)),
    ...listTsFiles(new URL('http/', root)).map(readUtf8),
  ].join('\n')
}

function readServiceLayer() {
  const root = new URL('../../../../../supabase/functions/mobile-api/_shared/', import.meta.url)
  return [
    readUtf8(new URL('domains.ts', root)),
    ...listTsFiles(new URL('domains/', root)).map(readUtf8),
  ].join('\n')
}

function readCustomerConversationService() {
  const root = new URL(
    '../../../../../supabase/functions/mobile-api/_shared/domains/customer/',
    import.meta.url,
  )
  return ['kael-conversation.ts', 'kael-conversation-turn.ts']
    .map((path) => readUtf8(new URL(path, root)))
    .join('\n')
}

function readCustomerCaseWorkService() {
  const root = new URL(
    '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/',
    import.meta.url,
  )
  return ['create.ts', 'turn.ts', 'evidence.ts'].map((path) =>
    readUtf8(new URL(path, root))
  ).join('\n')
}

function readKaelPersistenceService() {
  return readUtf8(new URL(
    '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/persistence.service.ts',
    import.meta.url,
  ))
}

describe('customer Kael conversation catalog', () => {
  it('matches only the Customer POST stream route', () => {
    const decode = (value: string) => decodeURIComponent(value)

    expect(matchCustomerKaelConversationRoute(
      '/me/kael/conversations/conversation-1/stream',
      'POST',
      decode,
    )).toEqual({
      kind: 'customer.kaelConversations.stream',
      method: 'POST',
      conversationId: 'conversation-1',
      roles: ['customer'],
    })
    expect(matchCustomerKaelConversationRoute(
      '/me/kael/conversations/conversation-1/stream',
      'GET',
      decode,
    )).toBeNull()
  })

  it('hides a linked catalog row when its authoritative Case Work session is unavailable', () => {
    const availableCaseSessions = new Set(['case-live'])

    expect(isVisibleCustomerConversationCatalogRow({ case_session_id: null }, availableCaseSessions)).toBe(true)
    expect(isVisibleCustomerConversationCatalogRow({ case_session_id: 'case-live' }, availableCaseSessions)).toBe(true)
    expect(isVisibleCustomerConversationCatalogRow({ case_session_id: 'case-stale' }, availableCaseSessions)).toBe(false)
  })

  it('keeps normal chat and Case Work in explicit, owner-scoped catalogs', () => {
    const router = readRouterLayer()
    const services = readServiceLayer()

    expect(router).toContain('/me/kael/conversations')
    expect(router).toContain('customer.kaelConversations.list')
    expect(router).toContain('customerKaelConversationModeParam')
    expect(services).toContain('listCustomerKaelConversations')
    expect(services).toContain('.eq("customer_id", ctx.user.id)')
    expect(services).toContain('.eq("chat_mode", mode)')
    expect(services).toContain('.eq("chat_mode", mode)')
  })

  it('persists pre-link turns but refuses to bypass the authoritative Agentic Case Work session', () => {
    const services = readServiceLayer()

    expect(services).toContain('sendCustomerKaelConversationTurn')
    expect(services).toContain('readLinkedCustomerCaseSession')
    expect(services).toContain('"CASE_WORK_SESSION_REQUIRED"')
    expect(services).toContain('surface: "customer_normal"')
    expect(services).not.toContain('surface: linkedCase?.jobId ? "customer_case" : "customer_normal"')
    expect(services).toContain('scrubSensitiveForLLM')
    expect(services).toContain('client_request_id')
    expect(services).toContain('append_customer_kael_conversation_exchange')
    expect(services).toContain('total_turns: asNumber(row.total_turns) + caseDetail.totalTurns')
    expect(services).toContain('case_job_id: caseDetail.jobId')
    expect(services).not.toContain('total_turns: asNumber(caseSession.data.total_turns)')
    expect(services).not.toMatch(/chat_mode:\s*["']normal["'][\s\S]{0,240}service_type:/)
  })

  it('supports soft-delete, rename, and pin through the Customer Edge boundary', () => {
    const router = readRouterLayer()
    const services = readServiceLayer()

    for (const action of ['archive', 'rename', 'pin']) {
      expect(router).toContain(`customer.kaelConversations.${action}`)
    }
    expect(services).toContain('archiveCustomerKaelConversation')
    expect(services).toContain('renameCustomerKaelConversation')
    expect(services).toContain('setCustomerKaelConversationPinned')
    expect(services).toContain('.order("pinned_at", { ascending: false, nullsFirst: false })')
  })

  it('keeps the catalog Customer-only and safely restores a linked case after archive', () => {
    const services = readCustomerConversationService()
    const caseWorkServices = readCustomerCaseWorkService()

    expect(services).toContain('ctx.role !== "customer"')
    expect(services).toContain('Chỉ khách hàng mới được dùng cuộc trò chuyện Kael này')
    expect(services).toContain('restoreCustomerConversationByCaseSession')
    expect(services).toContain('case_session_id: caseSessionId')
    expect(caseWorkServices).toMatch(/createKaelChat[\s\S]{0,240}ctx\.role !== "customer"/)
  })

  it('links a freshly-created Case Work catalog with one idempotent write in parallel with the first turn', () => {
    const services = readCustomerConversationService()
    const caseWorkServices = readCustomerCaseWorkService()

    expect(services).toContain('linkCreatedCustomerCaseConversation')
    expect(services).toContain('.upsert({')
    expect(services).toContain('onConflict: "customer_id,chat_mode,client_request_id"')
    expect(caseWorkServices).toMatch(
      /Promise\.all\(\[[\s\S]{0,500}linkCreatedCustomerCaseConversation[\s\S]{0,700}insertKaelTurn/,
    )
  })

  it('archives a linked catalog entry when first-turn creation is retired', () => {
    const persistence = readKaelPersistenceService()

    expect(persistence).toMatch(
      /retireFailedKaelSessionCreate[\s\S]*status:\s*"abandoned"[\s\S]*from\("kael_customer_conversations"\)[\s\S]*case_session_id[\s\S]*archived_at/,
    )
  })

})
