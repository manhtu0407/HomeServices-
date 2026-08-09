import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { checkPrivilegedClientBoundaries } from './check-privileged-clients.mjs'

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'privileged-boundary-'))
  write(resolve(root, 'config/harness/privileged-client-allowlist.json'), JSON.stringify({
    version: '1.0.0',
    approvedFactories: [{ path: 'supabase/functions/mobile-api/_shared/platform/privileged/service-client.ts', reason: 'test' }],
  }))
  write(resolve(root, 'supabase/functions/mobile-api/_shared/platform/privileged/service-client.ts'), "import { createClient } from '@supabase/supabase-js'\nexport { createClient }\n")
  write(resolve(root, 'supabase/functions/mobile-api/_shared/platform/auth.ts'), "import { createPrivilegedSupabaseClient } from './privileged/service-client.ts'\n")
  return root
}

test('accepts the canonical privileged client factory', () => {
  const root = fixture()
  try {
    assert.deepEqual(checkPrivilegedClientBoundaries({ root }), { ok: true, problems: [] })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects direct service client construction outside the allowlist', () => {
  const root = fixture()
  try {
    write(resolve(root, 'supabase/functions/mobile-api/_shared/domains/leak.ts'), "import { createClient } from '@supabase/supabase-js'\ncreateClient('x','y')\n")
    const report = checkPrivilegedClientBoundaries({ root })
    assert.equal(report.ok, false)
    assert.ok(report.problems.some((problem) => problem.includes('domains/leak.ts')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
