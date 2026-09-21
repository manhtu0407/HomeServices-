import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P197-customer-profile-erasure-coverage',
  invariant:
    'every personal-data column of customer_profiles is nulled on the account-deletion path, either by the newest prepare_customer_account_deletion or by a trigger on the profiles account_state change — a column added to the table without joining that path outlives the deletion of the account it belongs to',
  authority: [
    'supabase/migrations/20260729210000_customer_account_deletion.sql (the scrub lists customer_profiles columns one by one)',
    'governance/RULES.md Security Invariants — PII Handling (personal data is not kept beyond what the workflow needs)',
  ],
  target: 'supabase/migrations/20260916100000_customer_default_address_column.sql',
  layer: 'security-negative',
  siblings: ['P195-customer-address-persistence', 'P34-admin-finance-bank-reference'],
  mutation:
    'delete the `create trigger profiles_scrub_customer_default_address` statement from 20260916100000 — both the every-column case and the named-address-columns case turn red because nothing on the deletion path nulls default_address any more. Observed',
} as const satisfies PillarManifest

const root = resolve(__dirname, '../../../../..')

// The key and the two bookkeeping timestamps hold no personal data; everything else does.
const NON_PERSONAL_COLUMNS = new Set(['id', 'created_at', 'updated_at'])

const migrations = readdirSync(resolve(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((file) => ({
    file,
    text: readFileSync(resolve(root, 'supabase/migrations', file), 'utf8').replace(/\r\n/g, '\n'),
  }))

/** Body of the newest definition of a function; the open parenthesis keeps a `_v2` wrapper out of the match. */
function newestFunctionBody(name: string) {
  let newest: { file: string; body: string } | null = null
  for (const { file, text } of migrations) {
    const start = text.indexOf(`create or replace function ${name}(`)
    if (start < 0) continue
    const quoted = /\bas\s+(\$[a-z_]*\$)([\s\S]*?)\1/i.exec(text.slice(start))
    if (quoted) newest = { file, body: quoted[2] }
  }
  if (!newest) throw new Error(`no definition of ${name} found in supabase/migrations`)
  return newest
}

function columnsNulledByCustomerProfilesUpdate(body: string) {
  const assignment = /update public\.customer_profiles\s+set([\s\S]*?)where id = (?:p_customer_id|new\.id)/i.exec(body)
  return assignment
    ? [...assignment[1].matchAll(/(\w+)\s*=\s*null/g)].map((match) => match[1])
    : []
}

/** Functions fired when a profile's account_state changes, across every migration. */
function accountStateTriggerFunctions() {
  const names = new Set<string>()
  for (const { text } of migrations) {
    for (const match of text.matchAll(
      /create trigger\s+\w+\s+after update of account_state on public\.profiles[\s\S]*?execute function\s+([a-z_][a-z0-9_.]*)\(\)/gi,
    )) {
      names.add(match[1].toLowerCase())
    }
  }
  return [...names]
}

function scrubbedOnAccountDeletion() {
  const sources: string[] = []
  const columns = new Set<string>()
  const primary = newestFunctionBody('public.prepare_customer_account_deletion')
  sources.push(primary.file)
  columnsNulledByCustomerProfilesUpdate(primary.body).forEach((column) => columns.add(column))
  for (const name of accountStateTriggerFunctions()) {
    const trigger = newestFunctionBody(name)
    sources.push(`${trigger.file} (${name})`)
    columnsNulledByCustomerProfilesUpdate(trigger.body).forEach((column) => columns.add(column))
  }
  return { sources, columns }
}

function customerProfileColumns() {
  const source = readFileSync(
    resolve(root, 'packages/shared/src/types/database/tables/customer.database.types.ts'),
    'utf8',
  ).replace(/\r\n/g, '\n')
  const table = /customer_profiles: \{\s*Row: \{([\s\S]*?)\n\s*\}/.exec(source)
  if (!table) throw new Error('customer_profiles Row was not found in the generated database types')
  return [...table[1].matchAll(/^\s+(\w+):/gm)].map((match) => match[1])
}

describe('P197 customer_profiles — account deletion erases every personal column', () => {
  it('reads a plausible column list rather than passing on an empty parse', () => {
    const columns = customerProfileColumns()
    expect(
      columns.length,
      pillarWhy(PILLAR, 'an empty parse would make the coverage check vacuous'),
    ).toBeGreaterThanOrEqual(7)
    expect(columns).toContain('default_address')
  })

  it('nulls every personal-data column the table has', () => {
    const { sources, columns: scrubbed } = scrubbedOnAccountDeletion()
    const missing = customerProfileColumns().filter(
      (column) => !NON_PERSONAL_COLUMNS.has(column) && !scrubbed.has(column),
    )

    expect(
      missing,
      pillarWhy(PILLAR, `checked ${sources.join(' + ')}; these columns are not nulled by any of them: ${missing.join(', ')}`),
    ).toEqual([])
  })

  it('still nulls the address columns it always did', () => {
    const { columns: scrubbed } = scrubbedOnAccountDeletion()

    for (const column of ['building_name', 'unit_number', 'floor', 'district', 'default_address']) {
      expect(
        scrubbed.has(column),
        pillarWhy(PILLAR, `${column} is an address the customer typed, so deletion must clear it`),
      ).toBe(true)
    }
  })
})
