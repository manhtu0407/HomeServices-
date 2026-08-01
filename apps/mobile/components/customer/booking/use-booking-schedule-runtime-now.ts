import { useEffect, useState } from 'react'

const scheduleRefreshMs = 30_000

export function useBookingScheduleRuntimeNow() {
  const [runtimeNow, setRuntimeNow] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = setInterval(() => setRuntimeNow(Date.now()), scheduleRefreshMs)
    return () => clearInterval(intervalId)
  }, [])

  return runtimeNow
}
