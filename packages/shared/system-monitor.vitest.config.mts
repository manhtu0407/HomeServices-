import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

export default defineConfig({
  root,
  plugins: [cloudflareTest({ wrangler: { configPath: resolve(root, 'scripts/system-monitor/wrangler.jsonc') } })],
  test: {
    include: ['scripts/system-monitor/observer-pillar.test.ts'],
    globalSetup: ['scripts/system-monitor/global-setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
})
