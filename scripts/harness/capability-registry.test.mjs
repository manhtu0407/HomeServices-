import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import {
  buildCapabilityRegistry,
  checkCapabilityRegistry,
  writeCapabilityRegistry,
} from './capability-registry.mjs'

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

test('manual bank order and transfer claim retain payment confirmation envelopes', () => {
  const registry = buildCapabilityRegistry({ root: resolve(import.meta.dirname, '../..') })
  for (const kind of ['jobs.paymentOrder', 'jobs.paymentOrderClaim']) {
    const policy = registry.entries.find((entry) => entry.kind === kind)
    assert.ok(policy, kind)
    assert.equal(policy.confirmationGate, 'payment', kind)
    assert.equal(policy.operationClass, 'money_impacting', kind)
    assert.equal(policy.requiresResourceCheck, true, kind)
    assert.equal(policy.roles.includes('worker'), false, kind)
  }
})

test('uses the same route digest across checkout line endings', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-capability-'))
  try {
    const path = resolve(root, 'supabase/functions/mobile-api/_shared/http/routes/job.ts')
    const source = [
      'export const route = {',
      '  kind: "jobs.status",',
      '  method: "PATCH",',
      '  roles: ["worker"],',
      '};',
      '',
    ].join('\n')
    write(path, source)
    const lf = buildCapabilityRegistry({ root })
    write(path, source.replaceAll('\n', '\r\n'))
    const crlf = buildCapabilityRegistry({ root })

    assert.equal(crlf.source.sha256, lf.source.sha256)
    assert.deepEqual(crlf.entries, lf.entries)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('accepts generated registry artifacts with checkout line endings', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-capability-output-'))
  try {
    write(
      resolve(root, 'supabase/functions/mobile-api/_shared/http/routes/job.ts'),
      'export const route = { kind: "jobs.status", method: "PATCH", roles: ["worker"] };\n',
    )
    writeCapabilityRegistry({ root })
    const jsonPath = resolve(root, 'config/harness/capabilities.json')
    const tsPath = resolve(root, 'supabase/functions/mobile-api/_shared/platform/authz/capability-registry.ts')
    write(jsonPath, readFileSync(jsonPath, 'utf8').replaceAll('\n', '\r\n'))
    write(tsPath, readFileSync(tsPath, 'utf8').replaceAll('\n', '\r\n'))

    assert.deepEqual(checkCapabilityRegistry({ root }).problems, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('derives resource checks from route descriptor identifiers instead of route namespaces', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-capability-resource-scope-'))
  try {
    write(
      resolve(root, 'supabase/functions/mobile-api/_shared/http/routes/job.ts'),
      [
        'export type Route =',
        '  | { kind: "jobs.create"; method: "POST"; roles: ["customer"] }',
        '  | { kind: "jobs.status"; method: "PATCH"; jobId: string; roles: ["worker"] }',
        '  | { kind: "customer.kaelConversations.get"; method: "GET"; conversationId: string; roles: ["customer"] };',
        '',
      ].join('\n'),
    )

    const entries = Object.fromEntries(
      buildCapabilityRegistry({ root }).entries.map((entry) => [entry.kind, entry]),
    )

    assert.equal(entries['jobs.create'].requiresResourceCheck, false)
    assert.equal(entries['jobs.status'].requiresResourceCheck, true)
    assert.equal(entries['customer.kaelConversations.get'].requiresResourceCheck, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('marks Worker Edge routes as privileged service-owned operations', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-capability-worker-service-'))
  try {
    write(
      resolve(root, 'supabase/functions/mobile-api/_shared/http/routes/worker.ts'),
      [
        'export type Route =',
        '  | { kind: "workers.me"; method: "GET"; roles: ["worker"] }',
        '  | { kind: "workers.earnings"; method: "GET"; roles: ["worker"] }',
        '  | { kind: "workerApplications.submit"; method: "POST"; roles: ["customer"] }',
        '  | { kind: "customers.me"; method: "GET"; roles: ["customer"] };',
        '',
      ].join('\n'),
    )

    const entries = Object.fromEntries(
      buildCapabilityRegistry({ root }).entries.map((entry) => [entry.kind, entry]),
    )

    assert.equal(entries['workers.me'].privileged, true)
    assert.equal(entries['workers.earnings'].privileged, true)
    assert.equal(entries['workerApplications.submit'].privileged, true)
    assert.equal(entries['customers.me'].privileged, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('classifies server-owned Kael AI routes as privileged provider operations', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-capability-stream-'))
  try {
    write(
      resolve(root, 'supabase/functions/mobile-api/_shared/http/routes/kael.ts'),
      [
        'export type Route =',
        '  | { kind: "kael.assistant"; method: "POST"; roles: ["customer"] }',
        '  | { kind: "kael.chat.create"; method: "POST"; roles: ["customer"] }',
        '  | { kind: "kael.chat.stream"; method: "POST"; sessionId: string; roles: ["customer"] }',
        '  | { kind: "kael.chat.evidenceStream"; method: "POST"; sessionId: string; roles: ["customer"] }',
        '  | { kind: "kael.chat.turn"; method: "POST"; sessionId: string; roles: ["customer"] }',
        '  | { kind: "kael.chat.evidence"; method: "POST"; sessionId: string; roles: ["customer"] }',
        '  | { kind: "kael.chat.intakeConfirmation"; method: "POST"; sessionId: string; roles: ["customer"] }',
        '  | { kind: "kael.chat.confirm"; method: "POST"; sessionId: string; roles: ["customer"] }',
        '  | { kind: "customer.kaelConversations.stream"; method: "POST"; conversationId: string; roles: ["customer"] }',
        '  | { kind: "customer.kaelConversations.turn"; method: "POST"; conversationId: string; roles: ["customer"] }',
        '  | { kind: "workers.kaelChat.stream"; method: "POST"; sessionId: string; roles: ["worker"] };',
        '',
      ].join('\n'),
    )

    const entries = Object.fromEntries(
      buildCapabilityRegistry({ root }).entries.map((entry) => [entry.kind, entry]),
    )

    for (const kind of [
      'kael.assistant',
      'kael.chat.create',
      'kael.chat.stream',
      'kael.chat.evidenceStream',
      'kael.chat.turn',
      'kael.chat.evidence',
      'kael.chat.intakeConfirmation',
      'kael.chat.confirm',
      'customer.kaelConversations.stream',
      'customer.kaelConversations.turn',
      'workers.kaelChat.stream',
    ]) {
      assert.equal(entries[kind].privileged, true)
    }

    for (const kind of [
      'kael.chat.stream',
      'kael.chat.evidenceStream',
      'customer.kaelConversations.stream',
      'workers.kaelChat.stream',
    ]) {
      assert.equal(entries[kind].operationClass, 'provider_call')
      assert.equal(entries[kind].sideEffectClass, 'conditional-write')
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('marks customer catalog routes that reconcile or mutate service-owned rows as privileged', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'harness-capability-customer-catalog-'))
  try {
    write(
      resolve(root, 'supabase/functions/mobile-api/_shared/http/routes/customer-kael-conversation-routes.ts'),
      [
        'export type Route =',
        '  | { kind: "customer.kaelConversations.create"; method: "POST"; roles: ["customer"] }',
        '  | { kind: "customer.kaelConversations.list"; method: "GET"; roles: ["customer"] }',
        '  | { kind: "customer.kaelConversations.archive"; method: "DELETE"; conversationId: string; roles: ["customer"] }',
        '  | { kind: "customer.kaelConversations.rename"; method: "PATCH"; conversationId: string; roles: ["customer"] }',
        '  | { kind: "customer.kaelConversations.pin"; method: "PATCH"; conversationId: string; roles: ["customer"] }',
        '  | { kind: "customer.kaelConversations.get"; method: "GET"; conversationId: string; roles: ["customer"] };',
        '',
      ].join('\n'),
    )

    const entries = Object.fromEntries(
      buildCapabilityRegistry({ root }).entries.map((entry) => [entry.kind, entry]),
    )

    for (const kind of [
      'customer.kaelConversations.create',
      'customer.kaelConversations.list',
      'customer.kaelConversations.archive',
      'customer.kaelConversations.rename',
      'customer.kaelConversations.pin',
    ]) {
      assert.equal(entries[kind].privileged, true)
    }
    assert.equal(entries['customer.kaelConversations.get'].privileged, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
