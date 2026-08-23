import { defineConfig } from 'vitest/config'

// Authored as .mts so Vite loads this config as ESM. That makes `vitest/config`
// resolve to its ESM build (which `import`s std-env) instead of the CJS build
// (`config.cjs`, which `require()`s the ESM-only std-env and throws
// ERR_REQUIRE_ESM under Vite's config loader).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Collection is narrowed to the pillar suite. The rest of the tree stays on disk but
    // uncollected; `governance/protocols/test-pillars.md` explains which invariants the
    // pillars carry. An empty positional filter stays red so CI cannot report a test that
    // collection excluded.
    include: ['src/__tests__/**/*-pillar.test.ts'],
    environment: 'node',
  },
})
