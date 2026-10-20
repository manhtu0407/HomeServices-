import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSupabaseImagePlan,
  primeSupabaseImageCache,
  readSupabaseCliVersion,
} from './prime-supabase-images.mjs'

const imageId = `sha256:${'a'.repeat(64)}`

test('reads the locked Supabase CLI version and rejects a changed image set', () => {
  const lockfile = `importers:\n  apps/api:\n    devDependencies:\n      supabase:\n        specifier: ^2.98.2\n        version: 2.98.2\n  apps/mobile:\n    devDependencies: {}`

  assert.equal(readSupabaseCliVersion(lockfile), '2.98.2')
  assert.throws(() => buildSupabaseImagePlan('2.99.0'), /SUPABASE_CLI_VERSION_UNSUPPORTED/u)
})

test('plans only digest-verified Supabase runtime images for linux amd64', () => {
  const plan = buildSupabaseImagePlan('2.98.2')

  assert.deepEqual(plan, [
    {
      service: 'postgres',
      tag: '17.6.1.121',
      digest: 'sha256:d47ea5650400dacaa0cb2026517c95e891d2ec1dfd5f79fcfbf26b551054fa4f',
    },
    {
      service: 'storage-api',
      tag: 'v1.54.1',
      digest: 'sha256:6395ec6600b89e8133ae65e2b203d04f37a24d3626144ea2cb21973bfaa2471c',
    },
    {
      service: 'postgrest',
      tag: 'v14.10',
      digest: 'sha256:78c0a947ae556093def31de0b76c37d36ca09394d603a6e61785f4c0008aeb12',
    },
    {
      service: 'gotrue',
      tag: 'v2.188.1',
      digest: 'sha256:61f1099e790c4f364b70d6fb92cc07e5f90275abf2cf690ff045c63f1d96ee4b',
    },
    {
      service: 'kong',
      tag: '2.8.1',
      digest: 'sha256:e21b0b793879ab96720ed4188f9441260273f4bf775bcbff8d435e019ffb759a',
    },
    {
      service: 'postgres-meta',
      tag: 'v0.96.4',
      digest: 'sha256:97c0d82ff90b54c04992ca1a5f2253acd89775fd288f67bdeac7db54ab6d5343',
    },
    {
      service: 'realtime',
      tag: 'v2.86.3',
      digest: 'sha256:630c1f1e1443762c100147decca9cf87afe52f22a8a96d30fe7d8782741f19fb',
    },
    {
      service: 'imgproxy',
      tag: 'v3.8.0',
      digest: 'sha256:e1a8f4b99dd65b374b5705550505ace929b9dac98694614bbab3510f9e5107dd',
    },
    {
      service: 'mailpit',
      tag: 'v1.22.3',
      digest: 'sha256:168f762c218e167ba88ae7e48194126eb5ba5e99ef652063e3f14f9c4f0ee70f',
    },
  ])
})

test('adds the pinned Edge runtime only when the integration lane requests it', () => {
  const plan = buildSupabaseImagePlan('2.98.2', { includeEdgeRuntime: true })
  const edge = plan.find(({ service }) => service === 'edge-runtime')

  assert.equal(plan.length, 10)
  assert.deepEqual(edge, {
    service: 'edge-runtime',
    tag: 'v1.73.13',
    digest: 'sha256:e8ddc7b0f4888818159d4b665e922de667948e2864c895ed62acdfd29e7c6c80',
  })
})

test('pulls by verified digest and tags the exact ECR reference consumed by the CLI', () => {
  const calls = []
  const runDocker = (args) => {
    calls.push(args)
    if (args[0] === 'image' && args[1] === 'inspect' && args[2] === '--format' && args[3] === '{{.Id}}') {
      return imageId
    }
    if (args[0] === 'image' && args[1] === 'inspect') return `linux/amd64 ${imageId}`
    return ''
  }

  const count = primeSupabaseImageCache({ cliVersion: '2.98.2', runDocker })

  assert.equal(count, 9)
  assert.deepEqual(calls[0], [
    'pull',
    '--platform',
    'linux/amd64',
    'ghcr.io/supabase/postgres@sha256:d47ea5650400dacaa0cb2026517c95e891d2ec1dfd5f79fcfbf26b551054fa4f',
  ])
  assert.deepEqual(calls[2], ['tag', imageId, 'public.ecr.aws/supabase/postgres:17.6.1.121'])
  assert.equal(calls.filter(([command]) => command === 'pull').length, 9)
  assert.equal(calls.filter(([command]) => command === 'tag').length, 9)
})

test('fails closed if the cache tag is not the pinned linux amd64 image', () => {
  const runDocker = (args) => {
    if (args[0] === 'image' && args[1] === 'inspect' && args[3] === '{{.Id}}') return imageId
    if (args[0] === 'image' && args[1] === 'inspect') return `linux/arm64 ${imageId}`
    return ''
  }

  assert.throws(
    () => primeSupabaseImageCache({ cliVersion: '2.98.2', runDocker }),
    /SUPABASE_IMAGE_CACHE_IDENTITY_MISMATCH/u,
  )
})

test('identifies the image service when a digest pull fails', () => {
  const runDocker = (args) => {
    if (args[0] === 'pull' && args[3].includes('/mailpit@')) {
      throw new Error('manifest unavailable')
    }
    if (args[0] === 'image' && args[1] === 'inspect' && args[3] === '{{.Id}}') return imageId
    if (args[0] === 'image' && args[1] === 'inspect') return `linux/amd64 ${imageId}`
    return ''
  }

  assert.throws(
    () => primeSupabaseImageCache({ cliVersion: '2.98.2', runDocker }),
    /SUPABASE_IMAGE_DOCKER_COMMAND_FAILED:mailpit:pull/u,
  )
})
