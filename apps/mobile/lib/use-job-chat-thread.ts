import { useCallback, useEffect, useRef, useState } from 'react'
import { jobService } from './services'
import { subscribeToJobMessages } from './realtime'
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
  const reloadRef = useRef<() => Promise<boolean>>(async () => false)

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
    reloadRef.current = reload
  }, [reload])

  useEffect(() => {
    void reload()
  }, [reload])

  // H9-1 (Notes.md): live delivery of the counterparty's messages. Without this
  // the thread only refreshed on mount and after the user's own send, so a
  // worker asking "đồng hồ điện ở đâu?" stayed invisible until the customer
  // happened to send something. Subscribe to INSERTs and re-fetch the
  // authoritative list (server-ordered, deduped) instead of trusting the
  // payload shape. Poll is not added back; realtime is the delivery path and the
  // mount reload covers the cold open. unsubscribe runs on jobId/enabled change.
  useEffect(() => {
    if (!jobId || !enabled) return
    const handle = subscribeToJobMessages(jobId, () => {
      void reloadRef.current()
    })
    return () => {
      void handle?.unsubscribe()?.catch(() => {})
    }
  }, [enabled, jobId])

  return {
    ...state,
    reload,
    send,
  }
}
