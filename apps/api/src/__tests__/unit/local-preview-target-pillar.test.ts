import { describe, expect, it } from 'vitest'
import { buildLocalPreviewEnv } from '../../../../../scripts/preview/local-web.mjs'
import { buildPreviewEnv } from '../../../../../scripts/preview/production-web.mjs'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P390-local-preview-target',
  invariant: 'The local Preview launcher accepts only one exact loopback Auth and Edge origin and public keys, exports no server secrets, and does not weaken the separate Production launcher',
  authority: ['governance/RULES.md #0 (Auth and Edge remain one runtime)', 'governance/RULES.md #1 (no server authority in the client)', 'governance/RULES.md #8 (runtime verification is honest)'],
  target: 'scripts/preview/local-web.mjs',
  layer: 'security-negative',
  siblings: ['P324-production-preview-guard', 'P311-customer-normal-chat-topic-gate'],
  mutation: 'delegate local environment construction to the Production builder; the observed valid-loopback acceptance case turns red; allowing hosted or mixed origins fails the target-negative cases',
} as const satisfies PillarManifest

const publicEnvPath = '/repo/.scratch/local-preview/public.env'
function envText(origin = 'http://127.0.0.1:54321', api = `${origin}/functions/v1/mobile-api`, key = 'sb_publishable_localfixture') {
  return `EXPO_PUBLIC_SUPABASE_URL=${origin}\nEXPO_PUBLIC_API_BASE_URL=${api}\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\nSUPABASE_SERVICE_ROLE_KEY=server-fixture\nDEEPSEEK_API_KEY=provider-fixture\nEXPO_PUBLIC_DEBUG_SECRET=forbidden-fixture\n`
}

describe(PILLAR.id, () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321'])('accepts an exact loopback target: %s', (origin) => {
    const env = buildLocalPreviewEnv(envText(origin), publicEnvPath, {
      PATH: '/runtime/bin', SystemRoot: 'C:/Windows', DEEPSEEK_API_KEY: 'parent-provider-fixture',
      SUPABASE_SERVICE_ROLE_KEY: 'parent-server-fixture', EXPO_PUBLIC_SUPABASE_URL: 'https://old.example.test',
    })
    expect(env.EXPO_PUBLIC_SUPABASE_URL, pillarWhy(PILLAR, origin)).toBe(origin)
    expect(env.EXPO_PUBLIC_API_BASE_URL).toBe(`${origin}/functions/v1/mobile-api`)
    expect(env.EXPO_PUBLIC_WEB_PREVIEW_CLIENT).toBe('true')
    expect(env.EXPO_NO_DOTENV).toBe('1')
    expect(env.NESTSCOUT_MOBILE_ENV_FILE).toBe(publicEnvPath)
    expect(env.PATH).toBe('/runtime/bin')
    expect(JSON.stringify(env)).not.toMatch(/server-fixture|provider-fixture|forbidden-fixture/)
  })

  it.each([
    ['https://iwevizmsedyqozxlawwl.supabase.co', 'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api'],
    ['https://staging.example.test', 'https://staging.example.test/functions/v1/mobile-api'],
    ['http://127.0.0.1:54321', 'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api'],
    ['http://127.0.0.1:54321', 'http://localhost:54321/functions/v1/mobile-api'],
    ['http://127.0.0.1:54321', 'http://127.0.0.1:54322/functions/v1/mobile-api'],
    ['http://127.0.0.1:54321@host.example.test', 'http://host.example.test/functions/v1/mobile-api'],
    ['http://127.0.0.1:54321/', 'http://127.0.0.1:54321/functions/v1/other-api'],
    ['http://127.0.0.1:54321?target=production', 'http://127.0.0.1:54321/functions/v1/mobile-api'],
    ['http://127.0.0.1:54321', 'http://127.0.0.1:54321/functions/v1/mobile-api#fragment'],
    ['http://0.0.0.0:54321', 'http://0.0.0.0:54321/functions/v1/mobile-api'],
  ])('rejects a hosted, mixed or malformed target: %s -> %s', (origin, api) => {
    expect(() => buildLocalPreviewEnv(envText(origin, api), publicEnvPath), pillarWhy(PILLAR, 'both endpoints must be the same exact loopback origin')).toThrow()
  })

  it.each(['sb_secret_serverfixture', 'not-a-key', `eyJhbGciOiJub25lIn0.${Buffer.from('{"role":"service_role"}').toString('base64url')}.signature`])('rejects server authority or invalid keys: %s', (key) => {
    expect(() => buildLocalPreviewEnv(envText(undefined, undefined, key), publicEnvPath)).toThrow()
  })

  it('keeps Production Preview locked to Production', () => {
    expect(() => buildPreviewEnv(envText(), publicEnvPath)).toThrow()
    expect(() => buildLocalPreviewEnv(envText('https://iwevizmsedyqozxlawwl.supabase.co'), publicEnvPath)).toThrow()
  })
})
