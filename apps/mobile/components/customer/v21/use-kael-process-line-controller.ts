import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocalDeal, ServiceType } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'

import { caseDisplayCode } from './case-work-display-model'
import { customerV21ServiceCopy } from './copy'
import { buildKaelProcessSequence } from './kael-process-lines'
import type { CustomerKaelMode } from './types'
import type { KaelProcessLineRuntime } from './use-customer-kael-chat-ui-state'

type StartProcessLineOptions = {
  complexity?: string | null
  mediaCount?: number
  mode: CustomerKaelMode
  replyReveal?: 'composer_message'
  serviceType?: ServiceType | null
}

export const KAEL_COMPOSER_REPLY_REVEAL_MS = 900

export function useKaelProcessLineController({
  caseServiceLabel,
  deal,
  language,
  selectedService,
}: {
  caseServiceLabel: string | null
  deal: LocalDeal | null
  language: AppLanguage
  selectedService: ServiceType | null
}) {
  const [processLines, setProcessLines] = useState<KaelProcessLineRuntime | null>(null)
  const revealWaitersRef = useRef(new Map<number, () => void>())
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const runRef = useRef(0)

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current = []
  }, [])

  const settleRevealWaiters = useCallback(() => {
    revealWaitersRef.current.forEach((resolve) => resolve())
    revealWaitersRef.current.clear()
  }, [])

  const stopProcessLines = useCallback(() => {
    runRef.current += 1
    clearTimers()
    settleRevealWaiters()
    setProcessLines(null)
  }, [clearTimers, settleRevealWaiters])

  const startProcessLines = useCallback((prompt: string, options: StartProcessLineOptions) => {
    const safePrompt = prompt.trim() || (language === 'vi' ? 'Đã gửi ảnh/video.' : 'Sent media.')
    const serviceType = options.serviceType ?? deal?.draft.serviceType ?? selectedService
    const sequence = buildKaelProcessSequence({
      caseId: deal ? caseDisplayCode(deal, language) : null,
      complexity: options.complexity ?? deal?.estimate?.complexity ?? null,
      distance: deal?.broadcast?.generalArea ?? deal?.draft.districtLabel ?? null,
      hasRealCase: Boolean(deal),
      jobType: serviceType ? customerV21ServiceCopy[language][serviceType].label : caseServiceLabel,
      language,
      mediaCount: options.mediaCount ?? 0,
      message: safePrompt,
      mode: options.mode,
    })
    const runId = runRef.current + 1
    runRef.current = runId
    clearTimers()
    settleRevealWaiters()
    setProcessLines({
      activeIndex: sequence.lines.length > 0 ? 0 : null,
      collapse: null,
      lines: sequence.lines,
      prompt: safePrompt,
      scenarioId: sequence.scenarioId,
      visibleCount: sequence.lines.length > 0 ? 1 : 0,
    })

    let elapsedMs = 0
    sequence.lines.forEach((line, index) => {
      elapsedMs += line.durationMs
      const nextIndex = index + 1
      timersRef.current.push(setTimeout(() => {
        if (runRef.current !== runId) return
        if (nextIndex < sequence.lines.length) {
          setProcessLines((current) => current ? {
            ...current,
            activeIndex: nextIndex,
            visibleCount: Math.max(current.visibleCount, nextIndex + 1),
          } : current)
          return
        }
        setProcessLines((current) => current ? {
          ...current,
          activeIndex: null,
          collapse: sequence.collapse,
          visibleCount: sequence.lines.length,
        } : current)
      }, elapsedMs))
    })

    // Session/menu/evidence actions never wait on presentation. A composer send gets one
    // short reveal window while its API request is already running, so Process Lines remain
    // perceptible without slowing the rest of Kael Chat.
    if (options.replyReveal !== 'composer_message') return Promise.resolve()
    return new Promise<void>((resolve) => {
      revealWaitersRef.current.set(runId, resolve)
      timersRef.current.push(setTimeout(() => {
        revealWaitersRef.current.delete(runId)
        resolve()
      }, KAEL_COMPOSER_REPLY_REVEAL_MS))
    })
  }, [caseServiceLabel, clearTimers, deal, language, selectedService, settleRevealWaiters])

  // Unmount invalidates the latest generation; capturing an older ref value would leave newer timers live.
  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => () => {
    runRef.current += 1
    clearTimers()
    settleRevealWaiters()
  }, [clearTimers, settleRevealWaiters])

  return { processLines, startProcessLines, stopProcessLines }
}
