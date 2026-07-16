import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocalDeal, ServiceType } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'

import { caseDisplayCode } from './case-work-display-model'
import { customerV21ServiceCopy } from './copy'
import { buildKaelProcessSequence } from './kael-process-lines'
import type { CustomerKaelMode } from './types'
import type { KaelProcessLineRuntime } from './use-customer-kael-chat-ui-state'

const kaelProcessAnswerSettleMs = 1100

type StartProcessLineOptions = {
  complexity?: string | null
  mediaCount?: number
  mode: CustomerKaelMode
  serviceType?: ServiceType | null
}

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
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const runRef = useRef(0)
  const waitersRef = useRef<(() => void)[]>([])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current = []
  }, [])

  const resolveWaiters = useCallback(() => {
    const waiters = waitersRef.current
    waitersRef.current = []
    waiters.forEach((resolve) => resolve())
  }, [])

  const stopProcessLines = useCallback(() => {
    runRef.current += 1
    clearTimers()
    resolveWaiters()
    setProcessLines(null)
  }, [clearTimers, resolveWaiters])

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
    resolveWaiters()
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

    return new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        waitersRef.current = waitersRef.current.filter((waiter) => waiter !== finish)
        resolve()
      }
      waitersRef.current.push(finish)
      timersRef.current.push(setTimeout(() => {
        if (runRef.current !== runId) return
        finish()
      }, elapsedMs + kaelProcessAnswerSettleMs))
    })
  }, [caseServiceLabel, clearTimers, deal, language, resolveWaiters, selectedService])

  // Unmount invalidates the latest generation; capturing an older ref value would leave newer timers live.
  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => () => {
    runRef.current += 1
    clearTimers()
    resolveWaiters()
  }, [clearTimers, resolveWaiters])

  return { processLines, startProcessLines, stopProcessLines }
}
