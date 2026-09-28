import { Redirect, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'

import { AppLoadingShell } from '@/components/ui/app-loading-shell'
import { savePendingInvite } from '@/lib/referral/pending-invite'

// nestscout://invite/<code> keeps the worker's code until the customer is signed in; the
// customer layout claims it then, so the link works before and after signup alike.
export default function InviteRoute() {
  const params = useLocalSearchParams<{ code?: string | string[] }>()
  const raw = Array.isArray(params.code) ? params.code[0] : params.code
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    void savePendingInvite(raw ?? '').finally(() => {
      if (active) setSaved(true)
    })
    return () => {
      active = false
    }
  }, [raw])

  if (!saved) return <AppLoadingShell />
  return <Redirect href="/" />
}
