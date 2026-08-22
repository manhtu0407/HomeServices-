import type { Session } from '@supabase/supabase-js'
import type { UserRole } from '@nestscout/shared'

import type { ProfileStatus } from './auth-context'

export function isAuthShellBlocking(input: {
  guestMode?: boolean
  loading: boolean
  profileStatus: ProfileStatus
  role: UserRole | null
  session: Session | null
}) {
  if (input.guestMode) return false
  if (!input.session) return input.loading
  if (input.role) return false
  return input.loading || input.profileStatus === 'loading'
}
