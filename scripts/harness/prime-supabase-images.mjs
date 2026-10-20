import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SUPABASE_CLI_VERSION = '2.98.2'
const DOCKER_COMMAND_TIMEOUT_MS = 15 * 60 * 1000
const SUPABASE_IMAGES = Object.freeze([
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
  // Excluded from `supabase start`, but `gen types` and `db lint` pull it on demand from the
  // rate-limited ECR mirror; priming from GHCR keeps those steps off that pull.
  {
    service: 'postgres-meta',
    tag: 'v0.96.4',
    digest: 'sha256:97c0d82ff90b54c04992ca1a5f2253acd89775fd288f67bdeac7db54ab6d5343',
  },
  {
    service: 'edge-runtime',
    tag: 'v1.73.13',
    digest: 'sha256:e8ddc7b0f4888818159d4b665e922de667948e2864c895ed62acdfd29e7c6c80',
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

export function readSupabaseCliVersion(lockfileText) {
  const lines = lockfileText.split(/\r?\n/u)
  const start = lines.indexOf('  apps/api:')
  if (start < 0) throw new Error('SUPABASE_CLI_LOCK_IMPORTER_MISSING')
  const nextImporter = lines.findIndex((line, index) => index > start && /^  \S/u.test(line))
  const importer = lines.slice(start + 1, nextImporter < 0 ? lines.length : nextImporter).join('\n')
  const version = importer.match(/^      supabase:\r?\n        specifier:\s*\S+\r?\n        version:\s*([0-9]+\.[0-9]+\.[0-9]+)/mu)?.[1]
  if (!version) throw new Error('SUPABASE_CLI_LOCK_VERSION_MISSING')
  return version
}

export function buildSupabaseImagePlan(cliVersion, { includeEdgeRuntime = false } = {}) {
  if (cliVersion !== SUPABASE_CLI_VERSION) throw new Error('SUPABASE_CLI_VERSION_UNSUPPORTED')
  return SUPABASE_IMAGES.filter(({ service }) => includeEdgeRuntime || service !== 'edge-runtime')
}

function runDockerCommand(args) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: DOCKER_COMMAND_TIMEOUT_MS,
    windowsHide: true,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`SUPABASE_IMAGE_DOCKER_COMMAND_FAILED: ${args[0]}`)
  }
  return result.stdout
}

export function primeSupabaseImageCache({ cliVersion, includeEdgeRuntime = false, runDocker = runDockerCommand }) {
  const plan = buildSupabaseImagePlan(cliVersion, { includeEdgeRuntime })
  for (const { service, tag, digest } of plan) {
    const source = `ghcr.io/supabase/${service}@${digest}`
    const target = `public.ecr.aws/supabase/${service}:${tag}`
    try {
      runDocker(['pull', '--platform', 'linux/amd64', source])
    } catch (error) {
      throw new Error(`SUPABASE_IMAGE_DOCKER_COMMAND_FAILED:${service}:pull`, { cause: error })
    }
    const imageId = runDocker(['image', 'inspect', '--format', '{{.Id}}', source]).trim()
    if (!/^sha256:[a-f0-9]{64}$/u.test(imageId)) throw new Error('SUPABASE_IMAGE_SOURCE_ID_INVALID')
    runDocker(['tag', imageId, target])
    const identity = runDocker(['image', 'inspect', '--format', '{{.Os}}/{{.Architecture}} {{.Id}}', target]).trim()
    const [platform, taggedImageId] = identity.split(/\s+/u)
    if (platform !== 'linux/amd64' || taggedImageId !== imageId) {
      throw new Error('SUPABASE_IMAGE_CACHE_IDENTITY_MISMATCH')
    }
  }
  return plan.length
}

function main(args) {
  const unknownArgs = args.filter((argument) => argument !== '--include-edge-runtime')
  if (unknownArgs.length > 0 || new Set(args).size !== args.length) {
    throw new Error('SUPABASE_IMAGE_CACHE_ARGUMENT_INVALID')
  }
  const cliVersion = readSupabaseCliVersion(readFileSync(resolve(ROOT, 'pnpm-lock.yaml'), 'utf8'))
  const count = primeSupabaseImageCache({
    cliVersion,
    includeEdgeRuntime: args.includes('--include-edge-runtime'),
  })
  process.stdout.write(`Prepared ${count} digest-pinned Supabase images for linux/amd64.\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'SUPABASE_IMAGE_CACHE_FAILED'}\n`)
    process.exitCode = 1
  }
}
