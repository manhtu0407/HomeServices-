import { useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { color } from '@/design/theme'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import {
  firstRouteParam,
  routeForWorkerV5Screen,
  validatedWorkerV5JobId,
} from '../dock/routing'
import { getWorkerV5Screen, requireWorkerV5Screen } from '../dock/screens'
import type { WorkerV5RouteParams, WorkerV5ScreenDefinition, WorkerV5ScreenId } from '../dock/types'
import { useWorkerV5RoutePreview } from './use-worker-route-preview'
import { WorkerJobsLegacyPrototypeBody } from './worker-jobs-zip-prototype-surface'
import { useWorkerThemeMode, getWorkerThemeTokens } from '../worker-theme'

export const ZIP_STAGE_SCREEN_IDS: readonly WorkerV5ScreenId[] = [
  '2.1-opportunity-inbox',
  '2.2-offer-detail',
  '2.3-customer-confirmation-wait',
  '2.4-route-eta',
  '2.7-in-progress',
  '2.8-scope-change',
  '2.9-approval-wait',
  '2.10-completion-evidence',
  '2.11-completion-submitted',
  '2.12-case-closed',
  '2.12-case-closed',
]

type ZipPrototypeSelection = {
  prototypeStage?: 'payment-confirmed'
  screen: WorkerV5ScreenDefinition
}

type WorkerJobsPrototypeRouteParams = WorkerV5RouteParams & {
  ns_worker_jobs_variant?: string | string[]
}

export function WorkerJobsZipPrototype() {
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const router = useRouter()
  const runtime = useFrontendWorkflow()
  const glass = useGlassAccessibility()
  const workerThemeMode = useWorkerThemeMode()
  const language = firstRouteParam(params.ns_worker_lang) === 'en' ? 'en' : 'vi'
  const selection = useMemo(() => resolveZipPrototypeSelection(params), [params])
  const screen = selection.screen
  const isWaitingSurface = screen.id === '2.3-customer-confirmation-wait' || screen.id === '2.9-approval-wait'
  const actionBusyRef = useRef(false)
  const [actionBusy, setActionBusy] = useState(false)
  const routePreview = useWorkerV5RoutePreview(runtime.state.deal, screen.id === '2.4-route-eta')
  const routeJobId = validatedWorkerV5JobId(firstRouteParam(params.job_id))
  const currentJobId = runtime.state.deal?.broadcast?.jobId ?? runtime.state.deal?.id
  const themeTokens = getWorkerThemeTokens(workerThemeMode)
  const jobsVariant = firstRouteParam((params as WorkerJobsPrototypeRouteParams).ns_worker_jobs_variant)

  const openPrototypeStage = (stage: string) => {
    const query = [
      `ns_worker_stage=${stage}`,
      `ns_worker_lang=${language}`,
      'ns_worker_prototype=worker-jobs-rebuild-v1',
    ]
    if (jobsVariant) query.push(`ns_worker_jobs_variant=${encodeURIComponent(jobsVariant)}`)
    if (firstRouteParam(params.ns_audit_role) === 'worker') query.push('ns_audit_role=worker')
    if (routeJobId ?? currentJobId) query.push(`job_id=${encodeURIComponent(routeJobId ?? currentJobId ?? '')}`)
    router.replace(`/jobs-prototype?${query.join('&')}` as never)
  }

  const openScreen = (target: WorkerV5ScreenDefinition | null) => {
    if (!target) return
    if (target.section !== 'jobs') {
      router.replace(routeForWorkerV5Screen(target, params) as never)
      return
    }

    const targetStage = target.id === '2.12-case-closed' && selection.prototypeStage === 'payment-confirmed'
      ? '11'
      : String(ZIP_STAGE_SCREEN_IDS.indexOf(target.id) + 1)
    openPrototypeStage(targetStage)
  }

  const openScreenById = (id: WorkerV5ScreenId) => {
    openScreen(getWorkerV5Screen(id))
  }

  const runWorkerAction = async (
    action: () => Promise<boolean>,
    { navigateOnSuccess = true }: { navigateOnSuccess?: boolean } = {},
  ) => {
    if (actionBusyRef.current) return
    actionBusyRef.current = true
    setActionBusy(true)
    try {
      const ok = await action()
      if (ok && navigateOnSuccess) openScreen(getWorkerV5Screen(screen.primaryNext))
    } finally {
      actionBusyRef.current = false
      setActionBusy(false)
    }
  }

  const runRouteAction = async () => {
    if (actionBusyRef.current) return
    const status = runtime.state.deal?.status
    const nextStatus = status === 'worker_matched'
      ? 'worker_on_way'
      : status === 'worker_on_way'
        ? 'arrived'
        : null
    if (!nextStatus) {
      openScreenById('2.7-in-progress')
      return
    }

    actionBusyRef.current = true
    setActionBusy(true)
    try {
      const ok = await runtime.actions.workerUpdateStatus(nextStatus)
      if (ok) openScreenById('2.7-in-progress')
    } finally {
      actionBusyRef.current = false
      setActionBusy(false)
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isWaitingSurface ? '#FCFFFE' : themeTokens.canvas }]} testID="worker-jobs-zip-prototype">
      <ScrollView
        contentContainerStyle={[styles.content, isWaitingSurface && { padding: 0, paddingBottom: 0 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.surface, glass.reduceTransparency && { backgroundColor: color.mint.white }]}>
          <WorkerJobsLegacyPrototypeBody
            actionBusy={actionBusy}
            language={language}
            navigateActiveJobChat={() => router.replace('/(worker)/chat?ns_worker_screen=3.2-kael-job-intake' as never)}
            navigateJobChat={() => router.replace('/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal' as never)}
            navigateNext={() => openScreen(getWorkerV5Screen(screen.primaryNext))}
            navigateToScreen={openScreenById}
            prototypeMode
            prototypeStage={selection.prototypeStage}
            reduceMotion={glass.reduceMotion}
            reduceTransparency={glass.reduceTransparency}
            routePreview={routePreview}
            runRouteAction={runRouteAction}
            runWorkerAction={runWorkerAction}
            runtime={runtime}
            screen={screen}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

export function resolveZipPrototypeSelection(params: WorkerV5RouteParams): ZipPrototypeSelection {
  const stageParam = firstRouteParam(params.ns_worker_stage)
  const numericStage = stageParam && /^\d+$/.test(stageParam) ? Number(stageParam) : null
  const stageIndex = numericStage && numericStage >= 1 && numericStage <= ZIP_STAGE_SCREEN_IDS.length ? numericStage - 1 : null
  const screenId = stageIndex === null
    ? getWorkerV5Screen(firstRouteParam(params.ns_worker_screen))?.section === 'jobs'
      ? getWorkerV5Screen(firstRouteParam(params.ns_worker_screen))?.id
      : '2.1-opportunity-inbox'
    : ZIP_STAGE_SCREEN_IDS[stageIndex]
  const prototypeStage = stageParam === 'payment-confirmed' || numericStage === 11 ? 'payment-confirmed' : undefined

  return {
    prototypeStage,
    screen: requireWorkerV5Screen(screenId ?? '2.1-opportunity-inbox'),
  }
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 48,
  },
  safeArea: {
    flex: 1,
  },
  surface: {
    flex: 1,
  },
})
