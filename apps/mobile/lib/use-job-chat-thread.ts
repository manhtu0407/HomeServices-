import { useCallback, useEffect, useRef, useState } from 'react'
import { jobService } from './services'
import type { JobMessageResponse } from './api-types'

type JobChatThreadState = {
  error: string | null
  loading: boolean
  messages: JobMessageResponse[]
  sending: boolean
}

const initialJobChatThreadState: JobChatThreadState = {
  error: null,
  loading: false,
  messages: [],
  sending: false,
}

export function useJobChatThread(jobId: string | null, enabled: boolean) {
  const [state, setState] = useState<JobChatThreadState>(initialJobChatThreadState)
  const requestIdRef = useRef(0)

  const reload = useCallback(async () => {
    if (!jobId || !enabled) {
      setState(initialJobChatThreadState)
      return false
    }

    requestIdRef.current += 1
    const requestId = requestIdRef.current
    setState((current) => ({ ...current, error: null, loading: true }))
    const result = await jobService.listMessages(jobId)
    if (requestIdRef.current !== requestId) return false

    if (!result.success) {
      setState((current) => ({ ...current, error: result.error, loading: false }))
      return false
    }

    setState((current) => ({
      ...current,
      error: null,
      loading: false,
      messages: result.data.messages,
    }))
    return true
  }, [enabled, jobId])

  const send = useCallback(async (content: string) => {
    const trimmed = content.trim()
    if (!jobId || !enabled || !trimmed) return false

    setState((current) => ({ ...current, error: null, sending: true }))
    const result = await jobService.sendMessage(jobId, { content: trimmed })
    if (!result.success) {
      setState((current) => ({ ...current, error: result.error, sending: false }))
      return false
    }

    const refreshed = await jobService.listMessages(jobId)
    if (refreshed.success) {
      setState((current) => ({
        ...current,
        error: null,
        messages: refreshed.data.messages,
        sending: false,
      }))
      return true
    }

    setState((current) => ({
      ...current,
      error: refreshed.error,
      messages: [...current.messages, result.data.message],
      sending: false,
    }))
    return true
  }, [enabled, jobId])

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    ...state,
    reload,
    send,
  }
}
