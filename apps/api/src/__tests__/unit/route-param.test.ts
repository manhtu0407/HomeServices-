import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { isUuidRouteParam } from '@/lib/http/route-param'

const DYNAMIC_API_ROUTES = [
  'src/app/api/jobs/[id]/accept/route.ts',
  'src/app/api/jobs/[id]/cancel/route.ts',
  'src/app/api/jobs/[id]/confirm-completion/route.ts',
  'src/app/api/jobs/[id]/confirm-search/route.ts',
  'src/app/api/jobs/[id]/decline/route.ts',
  'src/app/api/jobs/[id]/review/route.ts',
  'src/app/api/jobs/[id]/route.ts',
  'src/app/api/jobs/[id]/scope-change/route.ts',
  'src/app/api/jobs/[id]/status/route.ts',
  'src/app/api/scope-changes/[id]/decide/route.ts',
] as const

describe('isUuidRouteParam', () => {
  it.each([
    '11111111-1111-4111-8111-111111111111',
    'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
    '00000000-0000-0000-0000-000000000000',
  ])('accepts a canonical PostgreSQL UUID: %s', (value) => {
    expect(isUuidRouteParam(value)).toBe(true)
  })

  it.each([
    'job-1',
    ' 11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/accept',
    '11111111111141118111111111111111',
    '11111111-1111-4111-8111-11111111111g',
    '11111111-1111-4111-8111-111111111111\nforged-log-line',
  ])('rejects an unsafe route identifier: %s', (value) => {
    expect(isUuidRouteParam(value)).toBe(false)
  })

  it.each(DYNAMIC_API_ROUTES)('guards %s before its privileged operation', (route) => {
    const source = readFileSync(resolve(__dirname, '../../..', route), 'utf8')
    const paramRead = source.indexOf('const { id } = await params')
    const guard = source.indexOf('if (!isUuidRouteParam(id))')
    const privilegedAccess = source.indexOf('auth.supabase')

    expect(source).toContain("from '@/lib/http/route-param'")
    expect(paramRead).toBeGreaterThanOrEqual(0)
    expect(guard).toBeGreaterThan(paramRead)
    expect(privilegedAccess).toBeGreaterThan(guard)
  })
})
