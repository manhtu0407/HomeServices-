import { defineConfig } from 'vitest/config'

// Authored as .mts so Vite loads this config as ESM. That makes `vitest/config`
// resolve to its ESM build (which `import`s std-env) instead of the CJS build
// (`config.cjs`, which `require()`s the ESM-only std-env and throws
// ERR_REQUIRE_ESM under Vite's config loader).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
