import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260729223000_customer_profile_avatar.sql',
)

describe('customer avatar migration', () => {
  it('keeps customer avatars private and accepts only bounded still images', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("'customer-avatars', 'customer-avatars', false, 5242880")
    expect(sql).toContain("array['image/jpeg', 'image/png', 'image/webp']")
    expect(sql).not.toMatch(/customer-avatars[\s\S]{0,240}public\s*=\s*true/i)
    expect(sql).not.toMatch(/create\s+policy[\s\S]*customer-avatars/i)
  })
})
