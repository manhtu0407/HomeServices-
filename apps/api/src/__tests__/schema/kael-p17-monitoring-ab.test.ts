import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('P17 monitoring and A/B setup', () => {
  it('documents provider #6 as Anthropic primary after the F26 A/B rejection', () => {
    const routingConfig = read('supabase/functions/mobile-api/_shared/kael/kael-providers/routing.config.ts')

    expect(routingConfig).toContain(
      'price_synthesis: config("price_synthesis", anthropic(), undefined, 0.01, 3_000, true, 200)',
    )
  })
})
