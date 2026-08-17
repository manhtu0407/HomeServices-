import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from './pillar-manifest'
import { SERVICE_TYPES } from '../constants'
import {
  isLocalWorkerGate,
  isValidRemoteBroadcastSnapshot,
  isValidRemoteJobSnapshot,
} from '../mobile-workflow/remote-snapshot-validation'

export const PILLAR = {
  id: 'P04-remote-snapshot-validation',
  invariant:
    'a server-supplied snapshot is trusted only when every field is in range, the service is one of the six, and the backend status agrees with the local status',
  authority: [
    'governance/RULES.md #6 (six services, nothing else)',
    'governance/RULES.md #0 (mobile trusts the Edge boundary, not arbitrary payloads)',
    'governance/RULES.md #8 (no silent degradation)',
  ],
  target: 'packages/shared/src/mobile-workflow/remote-snapshot-validation.ts',
  layer: 'security-negative',
  siblings: ['P09-kael-pii-scrub', 'P06-payment-unlock-gate'],
  mutation:
    'drop the `job.backendStatus === job.status` conjunct from isValidRemoteJobSnapshot — the disagreeing-status case turns red',
} as const satisfies PillarManifest

const VALID_JOB = {
  id: 'job-p04',
  status: 'worker_matched',
  serviceType: 'electrical',
  description: 'Cầu dao nhảy khi bật bếp từ.',
  problemChips: ['Cầu dao trip'],
  addressLabel: 'Chung cư X, Quận 7',
  districtLabel: 'Quận 7',
} as const

const VALID_BROADCAST = {
  broadcastId: 'bc-p04',
  jobId: 'job-p04',
  status: 'sent',
  serviceType: 'electrical',
  problemSummary: 'Cầu dao nhảy khi bật bếp từ',
  generalArea: 'Quận 7',
  secondsRemaining: 60,
} as const

const job = (patch: Record<string, unknown>) => ({ ...VALID_JOB, ...patch })
const broadcast = (patch: Record<string, unknown>) => ({ ...VALID_BROADCAST, ...patch })

describe('isValidRemoteJobSnapshot', () => {
  it('accepts a well-formed snapshot', () => {
    expect(isValidRemoteJobSnapshot(VALID_JOB), pillarWhy(PILLAR, 'the baseline must pass')).toBe(true)
  })

  it.each(SERVICE_TYPES.map((serviceType) => [serviceType]))(
    'accepts the supported service type %s',
    (serviceType) => {
      expect(
        isValidRemoteJobSnapshot(job({ serviceType })),
        pillarWhy(PILLAR, `${serviceType} is one of the six approved services`),
      ).toBe(true)
    },
  )

  it.each([
    ['an unsupported service', 'gardening'],
    ['a case-shifted service', 'ELECTRICAL'],
    ['an empty service', ''],
    ['a non-string service', 7],
  ])('rejects %s', (_label, serviceType) => {
    expect(
      isValidRemoteJobSnapshot(job({ serviceType })),
      pillarWhy(PILLAR, 'accepting an unlisted service would put Kael outside its approved scope'),
    ).toBe(false)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an array', []],
    ['a string', 'job'],
    ['a number', 42],
    ['a boolean', true],
  ])('rejects %s as a snapshot', (_label, value) => {
    expect(
      isValidRemoteJobSnapshot(value),
      pillarWhy(PILLAR, 'a non-object payload must never reach the workflow reducer'),
    ).toBe(false)
  })

  it.each([
    ['at the description limit', 'x'.repeat(2_000), true],
    ['one character past the description limit', 'x'.repeat(2_001), false],
  ])('%s', (_label, description, expected) => {
    expect(
      isValidRemoteJobSnapshot(job({ description })),
      pillarWhy(PILLAR, `description length ${description.length}`),
    ).toBe(expected)
  })

  it.each([
    ['at the chip-count limit', Array.from({ length: 10 }, () => 'chip'), true],
    ['one chip past the limit', Array.from({ length: 11 }, () => 'chip'), false],
    ['a chip at the length limit', ['x'.repeat(100)], true],
    ['a chip one character too long', ['x'.repeat(101)], false],
    ['a non-array chip list', 'chip', false],
  ])('%s', (_label, problemChips, expected) => {
    expect(
      isValidRemoteJobSnapshot(job({ problemChips })),
      pillarWhy(PILLAR, 'chip bounds cap how much attacker-controlled text the UI renders'),
    ).toBe(expected)
  })

  it.each([
    ['zero media', 0, true],
    ['the media ceiling', 5, true],
    ['one past the media ceiling', 6, false],
    ['negative media', -1, false],
    ['fractional media', 1.5, false],
    ['media sent as a string', '3', false],
  ])('%s', (_label, mediaCount, expected) => {
    expect(
      isValidRemoteJobSnapshot(job({ mediaCount })),
      pillarWhy(PILLAR, `mediaCount=${String(mediaCount)}`),
    ).toBe(expected)
  })

  // The two statuses come from different places in the payload. Letting them disagree
  // would let a stale backend status drive a later local phase.
  it('accepts a backend status that agrees with the local status', () => {
    expect(
      isValidRemoteJobSnapshot(job({ backendStatus: 'worker_matched' })),
      pillarWhy(PILLAR, 'agreeing statuses are the normal case'),
    ).toBe(true)
  })

  it('rejects a backend status that disagrees with the local status', () => {
    expect(
      isValidRemoteJobSnapshot(job({ backendStatus: 'arrived' })),
      pillarWhy(PILLAR, 'status=worker_matched with backendStatus=arrived must not be trusted'),
    ).toBe(false)
  })

  it.each([
    ['an empty id', '', false],
    ['a whitespace-only id', '   ', false],
    ['an id at the length limit', 'x'.repeat(200), true],
    ['an id one character too long', 'x'.repeat(201), false],
  ])('%s', (_label, id, expected) => {
    expect(isValidRemoteJobSnapshot(job({ id })), pillarWhy(PILLAR, `id length ${String(id).length}`)).toBe(
      expected,
    )
  })
})

describe('isValidRemoteBroadcastSnapshot', () => {
  it('accepts a well-formed broadcast', () => {
    expect(
      isValidRemoteBroadcastSnapshot(VALID_BROADCAST),
      pillarWhy(PILLAR, 'the baseline must pass'),
    ).toBe(true)
  })

  it.each([
    ['a null countdown', null, true],
    ['a zero countdown', 0, true],
    ['a negative countdown', -1, false],
    ['a fractional countdown', 1.5, false],
    ['an absent countdown', undefined, false],
  ])('%s', (_label, secondsRemaining, expected) => {
    expect(
      isValidRemoteBroadcastSnapshot(broadcast({ secondsRemaining })),
      pillarWhy(PILLAR, 'a negative countdown would render an expired offer as live'),
    ).toBe(expected)
  })

  it('rejects an unknown broadcast status', () => {
    expect(
      isValidRemoteBroadcastSnapshot(broadcast({ status: 'totally_new' })),
      pillarWhy(PILLAR, 'an unmodelled status would fall through the worker UI gates'),
    ).toBe(false)
  })
})

describe('isLocalWorkerGate', () => {
  it.each([['backend_pending'], ['local_deal_audit'], ['remote_backend']])('accepts the known gate %s', (gate) => {
    expect(isLocalWorkerGate(gate), pillarWhy(PILLAR, `${gate} is a modelled gate`)).toBe(true)
  })

  // A membership test written as a plain object lookup would answer true for inherited
  // keys; these confirm the set-based check does not.
  it.each([['__proto__'], ['constructor'], ['toString'], ['hasOwnProperty'], ['']])(
    'rejects the inherited or empty key %s',
    (gate) => {
      expect(
        isLocalWorkerGate(gate),
        pillarWhy(PILLAR, 'prototype keys must not be mistaken for modelled gates'),
      ).toBe(false)
    },
  )
})
