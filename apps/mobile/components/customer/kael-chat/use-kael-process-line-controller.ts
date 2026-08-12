import { useCallback, useRef, useState } from 'react'
import type { LocalDeal, ServiceType } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatProgress } from '@/lib/api-types'

import {
  buildKaelProgressLine,
  buildEvidenceProgressLine,
  type KaelEvidenceMediaProfile,
} from './kael-evidence-progress'
import type { KaelProcessScenarioId } from './kael-process-lines'
import type { CustomerKaelMode } from '../ui/types'
import type { KaelProcessLineRuntime } from './use-customer-kael-chat-ui-state'

type StartProcessLineOptions = {
  complexity?: string | null
  mediaCount?: number
  mode: CustomerKaelMode
  scenario?: KaelProcessScenarioId
  serviceType?: ServiceType | null
}

type StartEvidenceProcessLineOptions = Partial<KaelEvidenceMediaProfile> & {
  serviceType?: ServiceType | null
}

export function useKaelProcessLineController(_context: {
  caseServiceLabel: string | null
  deal: LocalDeal | null
  language: AppLanguage
  selectedService: ServiceType | null
}) {
  const { language } = _context
  const [processLines, setProcessLines] = useState<KaelProcessLineRuntime | null>(null)
  const runRef = useRef(0)
  const evidenceProfileRef = useRef<KaelEvidenceMediaProfile | null>(null)

  const stopProcessLines = useCallback(() => {
    runRef.current += 1
    evidenceProfileRef.current = null
    setProcessLines(null)
  }, [])

  const startProcessLines = useCallback((_prompt: string, _options: StartProcessLineOptions) => {
    // A non-streaming action has no backend process data to present. Keep its loading UI
    // separate rather than inventing a reasoning trail from local timers.
    runRef.current += 1
    evidenceProfileRef.current = null
    setProcessLines(null)
    return Promise.resolve()
  }, [])

  const startEvidenceProcessLines = useCallback((options: StartEvidenceProcessLineOptions) => {
    const runId = runRef.current + 1
    runRef.current = runId
    evidenceProfileRef.current = {
      hasImage: Boolean(options.hasImage),
      hasVideo: Boolean(options.hasVideo),
      hasVoiceTranscript: Boolean(options.hasVoiceTranscript),
    }
    setProcessLines({
      activeIndex: null,
      collapse: null,
      lines: [],
      origin: 'backend',
      prompt: '',
      scenarioId: 'evidence_check',
      streamId: `evidence:${runId}`,
      visibleCount: 0,
    })
  }, [])

  const startBackendProcessLines = useCallback(() => {
    const runId = runRef.current + 1
    runRef.current = runId
    evidenceProfileRef.current = null
    setProcessLines({
      activeIndex: null,
      collapse: null,
      lines: [],
      origin: 'backend',
      prompt: '',
      scenarioId: 'analysis_refinement',
      streamId: `backend:${runId}`,
      visibleCount: 0,
    })
  }, [])

  const updateEvidenceProcessProgress = useCallback((progress: KaelChatProgress) => {
    const profile = evidenceProfileRef.current
    if (!profile) return
    const line = buildEvidenceProgressLine({ language, profile, progress })
    setProcessLines((current) => {
      if (!current || current.scenarioId !== 'evidence_check') return current
      const nextLines = [...current.lines]
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

  const updateBackendProcessProgress = useCallback((progress: KaelChatProgress) => {
    const line = buildKaelProgressLine({ language, progress })
    setProcessLines((current) => {
      if (!current || current.origin !== 'backend' || current.scenarioId === 'evidence_check') return current
      const nextLines = [...current.lines]
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

  return {
    processLines,
    startBackendProcessLines,
    startEvidenceProcessLines,
    startProcessLines,
    stopProcessLines,
    updateBackendProcessProgress,
    updateEvidenceProcessProgress,
  }
}
