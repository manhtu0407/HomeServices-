import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import {
  reconcileMatchingPushReceipts,
  sendPushToUsers,
} from '../../../../../../supabase/functions/mobile-api/_shared/platform/push'

export const PILLAR = {
  id: 'P57-stage1-provider-push-receipt',
  invariant:
    'an Expo send ticket is only submitted; delivery and push proof require a provider receipt bound to the still-enabled exact device-token generation',
  authority: ['Expo Push Service documentation (push tickets and receipts)'],
  target: 'supabase/functions/mobile-api/_shared/platform/push.ts',
  layer: 'security-negative',
  siblings: ['P49-durable-matching-delivery', 'P50-reachable-cohort-matching'],
  mutation: 'count an ok send ticket as delivered or omit token updated_at from the ticket binding — the submission case turns red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

describe('Stage 1 provider push receipts', () => {
  it('persists an ok Expo ticket as submitted for the exact token generation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ status: 'ok', id: 'expo-ticket-57' }],
    }))))
    const client = makeSequenceClient(
      [{
        data: [{
          id: 'token-57',
          user_id: 'worker-57',
          push_token: 'ExponentPushToken[p57]',
          updated_at: '2026-08-23T07:00:00.000Z',
        }],
        error: null,
      }],
      {
        record_matching_push_provider_ticket: [{
          data: [{ recorded: true }],
          error: null,
        }],
      },
    )

    const result = await sendPushToUsers(
      client as unknown as Parameters<typeof sendPushToUsers>[0],
      ['worker-57'],
      { title: 'Có yêu cầu mới', body: 'Mở NestScout để xem yêu cầu.' },
      {
        matchingDeliveryId: 'delivery-57',
      } as Parameters<typeof sendPushToUsers>[3] & { matchingDeliveryId: string },
    )

    expect(result, pillarWhy(PILLAR, 'send ticket status ok is not provider delivery proof')).toEqual({
      submitted: 1,
      failed: 0,
      errors: [],
    })
    expect(result).not.toHaveProperty('delivered')
    expect(client.calls).toContainEqual({
      table: 'rpc:record_matching_push_provider_ticket',
      operations: [[
        'rpc',
        'record_matching_push_provider_ticket',
        {
          p_delivery_id: 'delivery-57',
          p_device_push_token_id: 'token-57',
          p_device_push_token_updated_at: '2026-08-23T07:00:00.000Z',
          p_provider_ticket_id: 'expo-ticket-57',
        },
      ]],
    })
    expect(client.calls.some((call) => call.table === 'rpc:mark_matching_delivery_delivered')).toBe(false)
  })

  it('records a current-token provider receipt only as provider handoff', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { 'expo-ticket-57': { status: 'ok' } },
    }))))
    const client = makeSequenceClient([], {
      claim_due_matching_push_provider_tickets: [{
        data: [{
          provider_ticket_row_id: 'ticket-row-57',
          provider_ticket_id: 'expo-ticket-57',
        }],
        error: null,
      }],
      apply_matching_push_provider_receipt: [{
        data: [{ outcome: 'provider_handoff', token_disabled: false }],
        error: null,
      }],
    })

    await expect(reconcileMatchingPushReceipts(
      client as unknown as Parameters<typeof reconcileMatchingPushReceipts>[0],
      'worker-57',
    )).resolves.toEqual({
      checked: 1,
      failed: 0,
      providerHandoffs: 1,
      staleTokenReceipts: 0,
      tokensDisabled: 0,
      unresolved: 0,
    })
    expect(client.calls.some((call) => call.table === 'rpc:mark_matching_delivery_delivered')).toBe(false)
  })

  it('claims every due receipt without binding the maintainer id as a recipient worker', async () => {
    const client = makeSequenceClient([], {
      claim_due_matching_push_provider_tickets: [{ data: [], error: null }],
    })

    await expect(reconcileMatchingPushReceipts(
      client as unknown as Parameters<typeof reconcileMatchingPushReceipts>[0],
      'matching-maintainer:iwevizmsedyqozxlawwl_f762b8fd_57',
    )).resolves.toMatchObject({ checked: 0 })
    expect(
      client.calls,
      pillarWhy(PILLAR, 'a non-UUID maintainer id sent as p_worker_id fails the uuid cast on every tick'),
    ).toContainEqual({
      table: 'rpc:claim_due_matching_push_provider_tickets',
      operations: [['rpc', 'claim_due_matching_push_provider_tickets', { p_limit: 50 }]],
    })
    expect(client.calls.some((call) => call.table === 'rpc:claim_matching_push_provider_tickets')).toBe(false)
  })

  it('does not convert a stale-token receipt into push proof', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { 'expo-ticket-stale-57': { status: 'ok' } },
    }))))
    const client = makeSequenceClient([], {
      claim_due_matching_push_provider_tickets: [{
        data: [{
          provider_ticket_row_id: 'ticket-row-stale-57',
          provider_ticket_id: 'expo-ticket-stale-57',
        }],
        error: null,
      }],
      apply_matching_push_provider_receipt: [{
        data: [{ outcome: 'stale_token', token_disabled: false }],
        error: null,
      }],
    })

    await expect(reconcileMatchingPushReceipts(
      client as unknown as Parameters<typeof reconcileMatchingPushReceipts>[0],
      'worker-57',
    )).resolves.toMatchObject({
      providerHandoffs: 0,
      staleTokenReceipts: 1,
    })
  })

  it('records DeviceNotRegistered as failed and disables only the bound generation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        'expo-ticket-error-57': {
          status: 'error',
          details: { error: 'DeviceNotRegistered' },
        },
      },
    }))))
    const client = makeSequenceClient([], {
      claim_due_matching_push_provider_tickets: [{
        data: [{
          provider_ticket_row_id: 'ticket-row-error-57',
          provider_ticket_id: 'expo-ticket-error-57',
        }],
        error: null,
      }],
      apply_matching_push_provider_receipt: [{
        data: [{ outcome: 'failed', token_disabled: true }],
        error: null,
      }],
    })

    await expect(reconcileMatchingPushReceipts(
      client as unknown as Parameters<typeof reconcileMatchingPushReceipts>[0],
      'worker-57',
    )).resolves.toMatchObject({
      failed: 1,
      tokensDisabled: 1,
    })
    expect(client.calls).toContainEqual({
      table: 'rpc:apply_matching_push_provider_receipt',
      operations: [[
        'rpc',
        'apply_matching_push_provider_receipt',
        {
          p_provider_ticket_row_id: 'ticket-row-error-57',
          p_provider_status: 'error',
          p_provider_error_code: 'DeviceNotRegistered',
        },
      ]],
    })
  })

  it('treats an omitted provider receipt as unresolved recovery, not an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: {} }))))
    const client = makeSequenceClient([], {
      claim_due_matching_push_provider_tickets: [{
        data: [{
          provider_ticket_row_id: 'ticket-row-missing-57',
          provider_ticket_id: 'expo-ticket-missing-57',
        }],
        error: null,
      }],
    })

    await expect(reconcileMatchingPushReceipts(
      client as unknown as Parameters<typeof reconcileMatchingPushReceipts>[0],
      'worker-57',
    )).resolves.toMatchObject({
      failed: 0,
      unresolved: 1,
    })
    expect(client.calls.some((call) => call.table === 'rpc:apply_matching_push_provider_receipt')).toBe(false)
  })
})
