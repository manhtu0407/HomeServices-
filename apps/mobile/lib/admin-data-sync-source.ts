import { supabase } from './supabase'

export type AdminDataSection = 'overview' | 'operations' | 'workers' | 'finance' | 'team' | 'system'
export type AdminDataRevisions = Partial<Record<AdminDataSection, number>>

const ADMIN_SECTIONS = new Set<AdminDataSection>(['overview', 'operations', 'workers', 'finance', 'team', 'system'])

export async function readAdminDataRevisions(): Promise<{ revisions: AdminDataRevisions; success: true } | { success: false }> {
  if (!supabase) return { success: false }
  const { data, error } = await supabase
    .from('admin_data_revisions')
    .select('section, revision')
  if (error || !data) return { success: false }

  const revisions: AdminDataRevisions = {}
  for (const row of data) {
    if (ADMIN_SECTIONS.has(row.section as AdminDataSection)) {
      revisions[row.section as AdminDataSection] = Number(row.revision)
    }
  }
  return { revisions, success: true }
}

