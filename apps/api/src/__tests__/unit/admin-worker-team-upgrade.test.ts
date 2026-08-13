import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchAdminControlRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/admin-control-routes'
import { matchMeRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/me'
import { matchWorkerRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/worker'

describe('worker review upgrade routes', () => {
  it('routes partial drafts and the profile review boundary separately', () => {
    expect(matchWorkerRoute('/workers/registration-draft', 'PATCH')?.kind)
      .toBe('workers.registrationDraft')
    expect(matchAdminControlRoute(
      '/admin/worker-applications/application-1/review-detail',
      'GET',
    )?.kind).toBe('admin.workerApplications.reviewDetail')
    expect(matchAdminControlRoute(
      '/admin/worker-applications/application-1/profile-decision',
      'POST',
    )?.kind).toBe('admin.workerApplications.profileDecision')
  })
})

describe('admin operator provisioning routes', () => {
  it('keeps provisioning Owner-only and activation scoped to the current account', () => {
    expect(matchAdminControlRoute('/admin/sub-admins/provision', 'POST'))
      .toMatchObject({ kind: 'admin.subAdmins.provision', roles: ['admin'] })
    expect(matchAdminControlRoute(
      '/admin/sub-admins/provision/provisioning-1/reset-password',
      'POST',
    ))?.toMatchObject({ kind: 'admin.subAdmins.resetPassword', roles: ['admin'] })
    expect(matchMeRoute('/me/admin-activation', 'GET')?.kind).toBe('me.adminActivation')
    expect(matchMeRoute('/me/admin-activation', 'POST')?.kind).toBe('me.adminActivation.activate')
  })

  it('keeps client metadata from granting a worker or admin role', () => {
    const migration = readFileSync(resolve(
      process.cwd(),
      '../../supabase/migrations/20260813113000_worker_review_admin_provisioning.sql',
    ), 'utf8')

    expect(migration).toContain("'customer'::public.user_role")
    expect(migration).not.toContain("raw_user_meta_data->>'role'")
    expect(migration).not.toMatch(/initial_password\s+(text|varchar)/i)
  })
})
