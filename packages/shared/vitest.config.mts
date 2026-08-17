import { defineConfig } from 'vitest/config'

// Authored as .mts so Vite loads this config as ESM. That makes `vitest/config`
// resolve to its ESM build (which `import`s std-env) instead of the CJS build
// (`config.cjs`, which `require()`s the ESM-only std-env and throws
// ERR_REQUIRE_ESM under Vite's config loader).
export default defineConfig({
  test: {
    // Collection is narrowed to the pillar suite plus the one case the Kael eval harness
    // drives: apps/api/scripts/kael-multi-turn-eval.mjs executes that file through vitest,
    // so dropping it would make the eval report success while checking nothing.
    include: [
      'src/__tests__/**/*-pillar.test.ts',
      'src/__tests__/kael-multi-turn-eval.test.ts',
    ],
    passWithNoTests: true,
    environment: 'node',
  },
})
