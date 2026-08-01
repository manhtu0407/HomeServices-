import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppLanguage } from './app-language'
import { jobService } from './services'
import { subscribeToJobMessages } from './realtime'
import type { JobMessageResponse } from './api-types'

type JobChatThreadState = {
  error: string | null
  loading: boolean
  messages: JobMessageResponse[]
  sending: boolean
}

type JobChatThreadSnapshot = JobChatThreadState & {
  key: string | null
}

const initialJobChatThreadState: JobChatThreadState = {
  error: null,
  loading: false,
  messages: [],
  sending: false,
}

const messageErrorCopy: Record<AppLanguage, {
  load: string
  send: string
  tooLong: string
}> = {
  vi: {
    load: 'Không thể tải tin nhắn. Vui lòng thử lại.',
    send: 'Không thể gửi tin nhắn. Vui lòng thử lại.',
    tooLong: 'Tin nhắn không được dài quá 5.000 ký tự.',
  },
  en: {
    load: 'Could not load messages. Try again.',
    send: 'Could not send the message. Try again.',
    tooLong: 'Messages cannot exceed 5,000 characters.',
  },
}

export function useJobChatThread(
  jobId: string | null,
  enabled: boolean,
  language: AppLanguage = 'vi',
) {
  const threadKey = enabled && jobId ? jobId : null
  const [snapshot, setSnapshot] = useState<JobChatThreadSnapshot>({
    ...initialJobChatThreadState,
    key: null,
  })
  const requestIdRef = useRef(0)
  const sendInFlightRef = useRef<{ generation: number; threadKey: string } | null>(null)
  const threadGenerationRef = useRef(0)
  const reloadRef = useRef<() => Promise<boolean>>(async () => false)
  const { key: snapshotKey, ...snapshotState } = snapshot
  const state: JobChatThreadState = snapshotKey === threadKey
    ? snapshotState
    : { ...initialJobChatThreadState, loading: Boolean(threadKey) }

  const reload = useCallback(async () => {
    if (!threadKey) return false

    requestIdRef.current += 1
    const requestId = requestIdRef.current
    const threadGeneration = threadGenerationRef.current
    setSnapshot((current) => ({
      ...(current.key === threadKey ? current : initialJobChatThreadState),
      error: null,
      key: threadKey,
      loading: true,
    }))
    let result: Awaited<ReturnType<typeof jobService.listMessages>>
    try {
      result = await jobService.listMessages(threadKey)
    } catch {
      if (
        requestIdRef.current !== requestId
        || threadGenerationRef.current !== threadGeneration
      ) return false
      setSnapshot((current) => ({
        ...(current.key === threadKey ? current : initialJobChatThreadState),
        error: messageErrorCopy[language].load,
        key: threadKey,
        loading: false,
      }))
      return false
    }
    if (
      requestIdRef.current !== requestId ||
      threadGenerationRef.current !== threadGeneration
    ) return false

    if (!result.success) {
      setSnapshot((current) => ({
        ...(current.key === threadKey ? current : initialJobChatThreadState),
        error: messageErrorCopy[language].load,
        key: threadKey,
        loading: false,
      }))
      return false
    }

    setSnapshot((current) => ({
      ...(current.key === threadKey ? current : initialJobChatThreadState),
      error: null,
      key: threadKey,
      loading: false,
      messages: result.data.messages,
    }))
    return true
  }, [language, threadKey])

  const send = useCallback(async (content: string) => {
    if (typeof content !== 'string') return false
    const trimmed = content.trim()
    if (!threadKey || !trimmed) return false
    if (trimmed.length > 5_000) {
      setSnapshot((current) => ({
        ...(current.key === threadKey ? current : initialJobChatThreadState),
        error: messageErrorCopy[language].tooLong,
        key: threadKey,
        sending: false,
      }))
      return false
    }

    const threadGeneration = threadGenerationRef.current
    if (
      sendInFlightRef.current?.threadKey === threadKey &&
      sendInFlightRef.current.generation === threadGeneration
    ) return false
    const sendToken = { generation: threadGeneration, threadKey }
    sendInFlightRef.current = sendToken
    try {
      setSnapshot((current) => ({
        ...(current.key === threadKey ? current : initialJobChatThreadState),
        error: null,
        key: threadKey,
        sending: true,
      }))
      let result: Awaited<ReturnType<typeof jobService.sendMessage>>
      try {
        result = await jobService.sendMessage(threadKey, { content: trimmed })
      } catch {
        if (threadGenerationRef.current !== threadGeneration) return false
        setSnapshot((current) => ({
          ...(current.key === threadKey ? current : initialJobChatThreadState),
          error: messageErrorCopy[language].send,
          key: threadKey,
          sending: false,
        }))
        return false
      }
      if (threadGenerationRef.current !== threadGeneration) return false
      if (!result.success) {
        setSnapshot((current) => ({
          ...(current.key === threadKey ? current : initialJobChatThreadState),
          error: messageErrorCopy[language].send,
          key: threadKey,
          sending: false,
        }))
        return false
      }

      let refreshed: Awaited<ReturnType<typeof jobService.listMessages>> | null = null
      try {
        refreshed = await jobService.listMessages(threadKey)
      } catch {
        // The send already committed; retain its response when the follow-up refresh fails.
      }
      if (threadGenerationRef.current !== threadGeneration) return false
      if (refreshed?.success) {
        setSnapshot((current) => ({
          ...(current.key === threadKey ? current : initialJobChatThreadState),
          error: null,
          key: threadKey,
          messages: refreshed.data.messages,
          sending: false,
        }))
        return true
      }

      setSnapshot((current) => ({
        ...(current.key === threadKey ? current : initialJobChatThreadState),
        error: messageErrorCopy[language].load,
        key: threadKey,
        messages: [
          ...(current.key === threadKey ? current.messages : []),
          result.data.message,
        ],
        sending: false,
      }))
      return true
    } finally {
      if (sendInFlightRef.current === sendToken) sendInFlightRef.current = null
    }
  }, [language, threadKey])

  useEffect(() => {
    const generation = threadGenerationRef.current + 1
    threadGenerationRef.current = generation
    requestIdRef.current += 1

    return () => {
      if (threadGenerationRef.current === generation) {
        threadGenerationRef.current += 1
      }
      requestIdRef.current += 1
    }
  }, [threadKey])

  useEffect(() => {
    reloadRef.current = reload
  }, [reload])

  useEffect(() => {
    const initialReload = setTimeout(() => {
      void reload()
    }, 0)
    return () => clearTimeout(initialReload)
  }, [reload])

  // Re-fetch the server-ordered thread on realtime inserts instead of trusting
  // the payload shape. The mount reload covers the cold open.
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
