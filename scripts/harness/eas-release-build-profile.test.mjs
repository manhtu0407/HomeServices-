import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addReleaseBuildEnvironment } from './eas-release-build-profile.mjs'

const release = {
  releaseId: 'harness-123456789abc-123456789abc',
  gitSha: 'a'.repeat(40),
}

test('adds release identity to the production profile environment without changing other profiles', () => {
  const source = {
    build: {
      preview: { environment: 'production', env: { PREVIEW_ONLY: 'yes' } },
      production: { environment: 'production', env: { EXISTING_FLAG: 'enabled' } },
    },
  }

  const prepared = addReleaseBuildEnvironment(source, release)

  assert.deepEqual(prepared.build.production.env, {
    EXISTING_FLAG: 'enabled',
    NESTSCOUT_RELEASE_ID: release.releaseId,
    NESTSCOUT_BUILD_GIT_SHA: release.gitSha,
  })
  assert.deepEqual(prepared.build.preview, source.build.preview)
  assert.deepEqual(source.build.production.env, { EXISTING_FLAG: 'enabled' })
})

test('refuses incomplete release identity instead of building an unbound client', () => {
  assert.throws(() => addReleaseBuildEnvironment({ build: { production: {} } }, {
    ...release,
    releaseId: '',
  }), /release id/u)
  assert.throws(() => addReleaseBuildEnvironment({ build: { production: {} } }, {
    ...release,
    gitSha: 'not-a-sha',
  }), /git sha/u)
})
