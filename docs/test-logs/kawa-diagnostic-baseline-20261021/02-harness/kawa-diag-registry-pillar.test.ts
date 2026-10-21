import { writeFileSync } from 'node:fs'
import { it } from 'vitest'

import { getKaelPerformanceProfile } from '../../../../../../supabase/functions/mobile-api/_shared/kael/index'

const SERVICES = ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'] as const

it('dumps the per-service performance profile registry', () => {
  const out = process.env.KAWA_DIAG_OUT
  const registry = Object.fromEntries(SERVICES.map((service) => {
    const profile = getKaelPerformanceProfile(service as never) as Record<string, any> | undefined
    return [service, profile ? {
      id: profile.id,
      supported_work_modes: profile.supported_work_modes,
      quote_drivers: profile.quote_drivers,
      safety_capability_gates: (profile.safety_capability_gates ?? []).map((gate: any) => ({ id: gate.id, kind: gate.kind, required_action: gate.required_action, trigger_signals: gate.trigger_signals })),
      evidence_suggestions: (profile.evidence_suggestions ?? []).map((e: any) => `${e.kind}:${e.focus}`),
      completion_checklist: profile.completion_checklist,
      scope_change_triggers: profile.scope_change_triggers,
      worker_capabilities: profile.worker_capabilities,
    } : null]
  }))
  if (out) writeFileSync(out, `${JSON.stringify({ snapshot: process.env.KAWA_DIAG_SNAPSHOT, registry }, null, 2)}\n`)
})
