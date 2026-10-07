import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { previewContext } from '../../../../../.claude/hooks/preview-session-context.mjs'
import {
  assertProductionSupabaseTargets,
  assertSupabasePublishableKey,
  buildPreviewEnv,
  parseEnvFile,
} from '../../../../../scripts/preview/production-web.mjs'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P324-production-preview-guard',
  invariant:
    'Every Production web preview launcher loads only the public allowlist, refuses any non-Production Supabase origin or server-authority key, and forces the staging payment rail off',
  authority: [
    'governance/RULES.md (no client secrets; Production backend only)',
    'scripts/lib/staging-target-safety.ps1 (Windows twin of the same checks)',
  ],
  target: 'scripts/preview/production-web.mjs',
  layer: 'security-negative',
  siblings: ['P56-stage1-production-release-workflow'],
  mutation:
    'drop assertProductionSupabaseTargets or the allowlist filter from buildPreviewEnv, or restore the `. apps/mobile/.env.local` launch entry; the origin, key, secret-leak, and launch-wiring cases turn red',
} as const satisfies PillarManifest

const root = resolve(__dirname, '../../../../../')
const PROD = 'https://iwevizmsedyqozxlawwl.supabase.co'
const PUBLISHABLE = 'sb_publishable_testOnlyValue'

function jwt(role: string): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ role })}.signature`
}

function envText(lines: Record<string, string>): string {
  return Object.entries(lines)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')
}

describe(PILLAR.id, () => {
  it.each([
    ['another project', 'https://xyylanuyflrjzbjzhqfl.supabase.co', `${PROD}/functions/v1/mobile-api`],
    ['plain http', 'http://iwevizmsedyqozxlawwl.supabase.co', `${PROD}/functions/v1/mobile-api`],
    ['a query string', `${PROD}/?x=1`, `${PROD}/functions/v1/mobile-api`],
    ['embedded credentials', 'https://user:pass@iwevizmsedyqozxlawwl.supabase.co', `${PROD}/functions/v1/mobile-api`],
    ['a non-default port', `${PROD}:8443`, `${PROD}/functions/v1/mobile-api`],
    ['a mobile-api on another origin', PROD, 'https://evil.example/functions/v1/mobile-api'],
    ['a wrong mobile-api path', PROD, `${PROD}/functions/v1/other`],
  ])('refuses %s', (_label, supabaseUrl, mobileApiUrl) => {
    expect(() => assertProductionSupabaseTargets(supabaseUrl, mobileApiUrl), pillarWhy(PILLAR)).toThrow()
  })

  it('accepts the registered Production origin', () => {
    expect(() => assertProductionSupabaseTargets(PROD, `${PROD}/functions/v1/mobile-api`), pillarWhy(PILLAR)).not.toThrow()
  })

  it('refuses keys that carry server authority and accepts publishable or anon keys', () => {
    expect(() => assertSupabasePublishableKey(jwt('service_role')), pillarWhy(PILLAR)).toThrow(/server authority/)
    expect(() => assertSupabasePublishableKey('sb_secret_abc'), pillarWhy(PILLAR)).toThrow()
    expect(() => assertSupabasePublishableKey(' sb_publishable_abc'), pillarWhy(PILLAR)).toThrow()
    expect(() => assertSupabasePublishableKey(PUBLISHABLE), pillarWhy(PILLAR)).not.toThrow()
    expect(() => assertSupabasePublishableKey(jwt('anon')), pillarWhy(PILLAR)).not.toThrow()
  })

  it('exports only the public allowlist and forces the staging payment rail off', () => {
    const text = envText({
      EXPO_PUBLIC_SUPABASE_URL: PROD,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `"${PUBLISHABLE}"`,
      EXPO_PUBLIC_STAGING_PAYMENT_RAIL_ENABLED: 'true',
      SECTION32_NATIVE_CUSTOMER_PASSWORD: 'never-export-me',
    })
    expect(Object.keys(parseEnvFile(text)).sort(), pillarWhy(PILLAR)).toEqual([
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'EXPO_PUBLIC_SUPABASE_URL',
    ])

    const env = buildPreviewEnv(text, '/repo/apps/mobile/.env.local', {
      PATH: '/usr/bin',
      SECTION32_NATIVE_WORKER_PASSWORD: 'inherited-secret',
      EXPO_PUBLIC_API_BASE_URL: 'https://stale.example',
    })
    expect(env.SECTION32_NATIVE_CUSTOMER_PASSWORD, pillarWhy(PILLAR)).toBeUndefined()
    expect(env.SECTION32_NATIVE_WORKER_PASSWORD, pillarWhy(PILLAR)).toBeUndefined()
    expect(env.EXPO_PUBLIC_STAGING_PAYMENT_RAIL_ENABLED, pillarWhy(PILLAR)).toBe('false')
    expect(env.EXPO_PUBLIC_API_BASE_URL, pillarWhy(PILLAR)).toBe(`${PROD}/functions/v1/mobile-api`)
    expect(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, pillarWhy(PILLAR)).toBe(PUBLISHABLE)
    expect(env.EXPO_NO_DOTENV, pillarWhy(PILLAR)).toBe('1')
    expect(env.PATH, pillarWhy(PILLAR)).toBe('/usr/bin')
  })

  it('refuses to build an env that targets a non-Production origin or carries a server key', () => {
    const staging = envText({
      EXPO_PUBLIC_SUPABASE_URL: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    })
    expect(() => buildPreviewEnv(staging, '/x', {}), pillarWhy(PILLAR)).toThrow(/production Supabase origin/)
    const serverKey = envText({ EXPO_PUBLIC_SUPABASE_URL: PROD, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') })
    expect(() => buildPreviewEnv(serverKey, '/x', {}), pillarWhy(PILLAR)).toThrow(/server authority/)
  })

  it('refuses to build an env when a required key is missing', () => {
    expect(() => buildPreviewEnv(envText({ EXPO_PUBLIC_SUPABASE_URL: PROD }), '/x', {}), pillarWhy(PILLAR)).toThrow(
      /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    )
  })

  it('routes every Production launch entry through a guarded launcher', () => {
    const launch = JSON.parse(readFileSync(resolve(root, '.claude/launch.json'), 'utf8')) as {
      configurations: { name: string; runtimeExecutable: string; runtimeArgs: string[] }[]
    }
    const production = launch.configurations.filter((entry) => entry.name.startsWith('mobile-web-production'))
    expect(production.map((entry) => entry.name).sort(), pillarWhy(PILLAR)).toEqual([
      'mobile-web-production',
      'mobile-web-production-posix',
    ])
    for (const entry of production) {
      const command = entry.runtimeArgs.join(' ')
      expect(command, pillarWhy(PILLAR, entry.name)).not.toMatch(/\.env\.local|set -a/)
      expect(command, pillarWhy(PILLAR, entry.name)).toMatch(
        /scripts\/run-mobile-web-production-preview\.ps1|scripts\/preview\/production-web\.mjs/,
      )
    }
  })

  it('registers the preview routing note as a SessionStart hook through the cross-platform runner', () => {
    const settings = JSON.parse(readFileSync(resolve(root, '.claude/settings.json'), 'utf8')) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>
    }
    const commands = (settings.hooks.SessionStart ?? []).flatMap((group) => group.hooks.map((hook) => hook.command))
    expect(
      commands.some((command) => command.includes('scripts/run.mjs" run-node') && command.includes('preview-session-context.mjs')),
      pillarWhy(PILLAR),
    ).toBe(true)
  })

  it('tells a cloud session to say the Preview pane is unavailable instead of falling back to screenshots', () => {
    const cloud = previewContext({ CLAUDE_CODE_REMOTE: 'true' }, 'linux')
    expect(cloud, pillarWhy(PILLAR)).toMatch(/cloud session/)
    expect(cloud, pillarWhy(PILLAR)).toMatch(/Do not substitute screenshots/)
    expect(previewContext({}, 'win32'), pillarWhy(PILLAR)).toContain('`mobile-web-production`')
    expect(previewContext({}, 'darwin'), pillarWhy(PILLAR)).toContain('`mobile-web-production-posix`')
  })
})
