import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocalDeal, ServiceType } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatProgress } from '@/lib/api-types'

import { caseDisplayCode } from './case-work-display-model'
import { customerV21ServiceCopy } from './copy'
import {
  buildEvidencePreparationLine,
  buildEvidenceProgressLine,
  type KaelEvidenceMediaProfile,
} from './kael-evidence-progress'
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

type StartEvidenceProcessLineOptions = Partial<KaelEvidenceMediaProfile> & {
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
  const revealWaitersRef = useRef<Map<number, () => void> | null>(null)
  const revealWaiters = revealWaitersRef.current
    ?? (revealWaitersRef.current = new Map<number, () => void>())
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const runRef = useRef(0)
  const evidenceProfileRef = useRef<KaelEvidenceMediaProfile | null>(null)

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current = []
  }, [])

  const settleRevealWaiters = useCallback(() => {
    revealWaiters.forEach((resolve) => resolve())
    revealWaiters.clear()
  }, [revealWaiters])

  const stopProcessLines = useCallback(() => {
    runRef.current += 1
    evidenceProfileRef.current = null
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
    evidenceProfileRef.current = null
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
      revealWaiters.set(runId, resolve)
      timersRef.current.push(setTimeout(() => {
        revealWaiters.delete(runId)
        resolve()
      }, KAEL_COMPOSER_REPLY_REVEAL_MS))
    })
  }, [caseServiceLabel, clearTimers, deal, language, revealWaiters, selectedService, settleRevealWaiters])

  const startEvidenceProcessLines = useCallback((options: StartEvidenceProcessLineOptions) => {
    const runId = runRef.current + 1
    runRef.current = runId
    evidenceProfileRef.current = {
      hasImage: Boolean(options.hasImage),
      hasVideo: Boolean(options.hasVideo),
      hasVoiceTranscript: Boolean(options.hasVoiceTranscript),
    }
    clearTimers()
    settleRevealWaiters()
    const preparation = buildEvidencePreparationLine(language)
    setProcessLines({
      activeIndex: 0,
      collapse: null,
      lines: [preparation],
      prompt: preparation.text,
      scenarioId: 'evidence_check',
      visibleCount: 1,
    })
  }, [clearTimers, language, settleRevealWaiters])

  const updateEvidenceProcessProgress = useCallback((progress: KaelChatProgress) => {
    const profile = evidenceProfileRef.current
    if (!profile) return
    const line = buildEvidenceProgressLine({ language, profile, progress })
    setProcessLines((current) => {
      if (!current || current.scenarioId !== 'evidence_check') return current
      const preparation = current.lines[0]
      const nextLines = preparation?.key === 'evidence-preparation'
        ? [{ ...preparation, status: 'completed' as const }, ...current.lines.slice(1)]
        : [...current.lines]
      const existingIndex = nextLines.findIndex((item) => item.key === line.key)
      if (existingIndex >= 0) {
        nextLines[existingIndex] = line
      } else {
        nextLines.push(line)
      }
      let activeIndex: number | null = null
      nextLines.forEach((item, index) => {
        if (item.status === 'queued' || item.status === 'running') activeIndex = index
      })
      return {
        ...current,
        activeIndex,
        lines: nextLines,
        visibleCount: nextLines.length,
      }
    })
  }, [language])

  // Unmount invalidates the latest generation; capturing an older ref value would leave newer timers live.
  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => () => {
    runRef.current += 1
    evidenceProfileRef.current = null
    clearTimers()
    settleRevealWaiters()
  }, [clearTimers, settleRevealWaiters])

  return {
    processLines,
    startEvidenceProcessLines,
    startProcessLines,
    stopProcessLines,
    updateEvidenceProcessProgress,
  }
}
