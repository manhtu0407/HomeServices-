import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isVisibleCustomerConversationCatalogRow } from '../../../../../supabase/functions/mobile-api/_shared/services/customer-kael-conversation-projection'
import { matchCustomerKaelConversationRoute } from '../../../../../supabase/functions/mobile-api/_shared/router/customer-kael-conversation-routes'

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
    readUtf8(new URL('router.ts', root)),
    ...listTsFiles(new URL('router/', root)).map(readUtf8),
  ].join('\n')
}

function readServiceLayer() {
  const root = new URL('../../../../../supabase/functions/mobile-api/_shared/', import.meta.url)
  return [
    readUtf8(new URL('services.ts', root)),
    ...listTsFiles(new URL('services/', root)).map(readUtf8),
  ].join('\n')
}

function readCustomerConversationService() {
  return readUtf8(new URL(
    '../../../../../supabase/functions/mobile-api/_shared/services/customer-kael-conversation.service.ts',
    import.meta.url,
  ))
}

function readCustomerCaseWorkService() {
  return readUtf8(new URL(
    '../../../../../supabase/functions/mobile-api/_shared/services/kael-chat.service.ts',
    import.meta.url,
  ))
}

function readKaelPersistenceService() {
  return readUtf8(new URL(
    '../../../../../supabase/functions/mobile-api/_shared/services/kael-chat-persistence.service.ts',
    import.meta.url,
  ))
}

function readMigrations() {
  const root = new URL('../../../../../supabase/migrations/', import.meta.url)
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => readUtf8(new URL(entry.name, root)))
    .join('\n')
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
    const migrations = readMigrations()

    expect(router).toContain('/me/kael/conversations')
    expect(router).toContain('customer.kaelConversations.list')
    expect(router).toContain('customerKaelConversationModeParam')
    expect(services).toContain('listCustomerKaelConversations')
    expect(services).toContain('.eq("customer_id", ctx.user.id)')
    expect(services).toContain('.eq("chat_mode", mode)')
    expect(migrations).toContain('create table if not exists public.kael_customer_conversations')
    expect(migrations).toContain("check (chat_mode in ('normal', 'case'))")
    expect(migrations).toContain('case_session_id uuid references public.kael_chat_sessions')
    expect(migrations).toMatch(/unique\s*\(\s*customer_id\s*,\s*chat_mode\s*,\s*client_request_id\s*\)/i)
    expect(services).toContain('.eq("chat_mode", mode)')
  })

  it('persists pre-link turns but refuses to bypass the authoritative Agentic Case Work session', () => {
    const services = readServiceLayer()
    const migrations = readMigrations()

    expect(services).toContain('sendCustomerKaelConversationTurn')
    expect(services).toContain('readLinkedCustomerCaseSession')
    expect(services).toContain('"CASE_WORK_SESSION_REQUIRED"')
    expect(services).toContain('surface: "customer_normal"')
    expect(services).not.toContain('surface: linkedCase?.jobId ? "customer_case" : "customer_normal"')
    expect(services).toContain('scrubSensitiveForLLM')
    expect(services).toContain('client_request_id')
    expect(services).toContain('append_customer_kael_conversation_exchange')
    expect(migrations).toContain('create table if not exists public.kael_customer_conversation_turns')
    expect(migrations).toContain("check (role in ('customer', 'kael', 'system'))")
    expect(migrations).toMatch(/unique[\s\S]*conversation_id[\s\S]*client_request_id/i)
    expect(migrations).toContain('for update;')
    expect(services).toContain('total_turns: asNumber(row.total_turns) + caseDetail.totalTurns')
    expect(services).toContain('case_job_id: caseDetail.jobId')
    expect(services).not.toContain('total_turns: asNumber(caseSession.data.total_turns)')
    expect(services).not.toMatch(/chat_mode:\s*["']normal["'][\s\S]{0,240}service_type:/)
  })

  it('supports soft-delete, rename, and pin through the Customer Edge boundary', () => {
    const router = readRouterLayer()
    const services = readServiceLayer()
    const migrations = readMigrations()

    for (const action of ['archive', 'rename', 'pin']) {
      expect(router).toContain(`customer.kaelConversations.${action}`)
    }
    expect(services).toContain('archiveCustomerKaelConversation')
    expect(services).toContain('renameCustomerKaelConversation')
    expect(services).toContain('setCustomerKaelConversationPinned')
    expect(services).toContain('.order("pinned_at", { ascending: false, nullsFirst: false })')
    expect(migrations).toContain('archived_at timestamptz')
    expect(migrations).toContain('pinned_at timestamptz')
    expect(migrations).toContain('char_length(btrim(title)) between 1 and 64')
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

  it('enables RLS, grants read-only owner access, and blocks cross-actor writes', () => {
    const migrations = readMigrations()

    expect(migrations).toContain('alter table public.kael_customer_conversations enable row level security')
    expect(migrations).toContain('alter table public.kael_customer_conversation_turns enable row level security')
    expect(migrations).toMatch(/to authenticated[\s\S]*\(select auth\.uid\(\)\) = customer_id/i)
    expect(migrations).toContain('grant select on public.kael_customer_conversations to authenticated')
    expect(migrations).toContain('grant select on public.kael_customer_conversation_turns to authenticated')
    expect(migrations).toContain('revoke all on public.kael_customer_conversations from anon')
    expect(migrations).toContain('revoke all on public.kael_customer_conversation_turns from anon')
    expect(migrations).toContain('revoke insert, update, delete on public.kael_customer_conversations from authenticated')
    expect(migrations).toContain('revoke insert, update, delete on public.kael_customer_conversation_turns from authenticated')
  })

  it('covers the composite owner foreign key used by Customer conversation turns', () => {
    const migrations = readMigrations()

    expect(migrations).toMatch(/kael_customer_conversation_turns_owner_idx[\s\S]*conversation_id\s*,\s*customer_id/i)
  })
})
