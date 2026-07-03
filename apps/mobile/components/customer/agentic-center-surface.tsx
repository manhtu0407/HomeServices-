import { useEffect } from 'react'
import { useRouter } from 'expo-router'

export function CustomerAgenticCenterSurface() {
  const { replace } = useRouter()

  useEffect(() => {
    replace('/(customer)/kael-chat?mode=case')
  }, [replace])

  return null
}
