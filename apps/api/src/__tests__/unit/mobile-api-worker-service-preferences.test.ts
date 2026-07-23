import { describe, expect, it } from 'vitest'

import {
  activeServiceTypesForWorker,
  isWorkerServiceQualityLocked,
  selectedServiceTypesForWorker,
  workerAcceptsService,
} from '../../../../../supabase/functions/mobile-api/_shared/services/worker-service-preferences'

describe('worker-selected service preferences', () => {
  it('keeps legacy workers active for every existing service when no selection exists', () => {
    const worker = {
      active_service_types: null,
      selected_service_types: null,
      service_types: ['electrical', 'plumbing'],
    }

    expect(selectedServiceTypesForWorker(worker)).toEqual(['electrical', 'plumbing'])
    expect(activeServiceTypesForWorker(worker)).toEqual(['electrical', 'plumbing'])
    expect(workerAcceptsService(worker, 'electrical')).toBe(true)
  })

  it('lets a worker select any supported service without inheriting the legacy hardcoded list', () => {
    const worker = {
      active_service_types: ['handyman'],
      selected_service_types: ['handyman'],
      service_types: ['electrical', 'plumbing'],
    }

    expect(selectedServiceTypesForWorker(worker)).toEqual(['handyman'])
    expect(activeServiceTypesForWorker(worker)).toEqual(['handyman'])
    expect(workerAcceptsService(worker, 'handyman')).toBe(true)
    expect(workerAcceptsService(worker, 'electrical')).toBe(false)
  })

  it('keeps a quality lock active only until its explicit expiry', () => {
    const now = Date.parse('2026-07-23T12:00:00.000Z')

    expect(isWorkerServiceQualityLocked({
      is_locked: true,
      locked_until: '2026-08-01T12:00:00.000Z',
    }, now)).toBe(true)
    expect(isWorkerServiceQualityLocked({
      is_locked: true,
      locked_until: '2026-07-20T12:00:00.000Z',
    }, now)).toBe(false)
  })
})
