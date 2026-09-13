import { typography } from '@/design/theme'
import { useCallback, useMemo, useReducer, useRef, useSyncExternalStore } from 'react'
import { Image } from 'expo-image'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import type {
  FavoriteWorkerForMatching,
  JobMatchingPreferenceInput,
  MatchingState,
} from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import type { MatchingSelectionView } from '@/lib/frontend-workflow/use-customer-matching-selection'
import type { CustomerThemeTokens } from '../customer-theme'
import { KaelLiquidStatusTransition } from './kael-liquid-status-transition'

type SavedWorkersStatus = 'idle' | 'loading' | 'ready' | 'error'

type MatchingPreference = Omit<JobMatchingPreferenceInput, 'client_request_id'>

type FindingWorkersUiState = {
  allowFallback: boolean
  preferenceBusy: boolean
  retryBusy: boolean
  savedWorkers: FavoriteWorkerForMatching[]
  savedWorkersOpen: boolean
  savedWorkersStatus: SavedWorkersStatus
  stopBusy: boolean
}

type FindingWorkersUiAction =
  | { type: 'allowFallback'; value: boolean }
  | { type: 'savedWorkersOpened' }
  | { type: 'savedWorkersLoaded'; workers: FavoriteWorkerForMatching[] }
  | { type: 'savedWorkersLoadFailed' }
  | { type: 'savedWorkersClosed' }
  | { type: 'preferenceBusy'; value: boolean }
  | { type: 'retryBusy'; value: boolean }
  | { type: 'stopBusy'; value: boolean }

const initialFindingWorkersUiState: FindingWorkersUiState = {
  allowFallback: false,
  preferenceBusy: false,
  retryBusy: false,
  savedWorkers: [],
  savedWorkersOpen: false,
  savedWorkersStatus: 'idle',
  stopBusy: false,
}

function findingWorkersUiReducer(
  state: FindingWorkersUiState,
  action: FindingWorkersUiAction,
): FindingWorkersUiState {
  if (action.type === 'allowFallback') return { ...state, allowFallback: action.value }
  if (action.type === 'savedWorkersOpened') {
    return { ...state, allowFallback: false, savedWorkers: [], savedWorkersOpen: true, savedWorkersStatus: 'loading' }
  }
  if (action.type === 'savedWorkersLoaded') {
    return { ...state, savedWorkers: action.workers, savedWorkersStatus: 'ready' }
  }
  if (action.type === 'savedWorkersLoadFailed') {
    return { ...state, savedWorkers: [], savedWorkersStatus: 'error' }
  }
  if (action.type === 'savedWorkersClosed') return { ...state, savedWorkersOpen: false }
  if (action.type === 'preferenceBusy') return { ...state, preferenceBusy: action.value }
  if (action.type === 'retryBusy') return { ...state, retryBusy: action.value }
  return { ...state, stopBusy: action.value }
}

type FindingWorkersReceiptProps = {
  language: AppLanguage
  matchingState: MatchingState
  selectionState: MatchingSelectionView
  onChoosePreference: (input: MatchingPreference) => Promise<boolean>
  onLoadSavedWorkers: () => Promise<FavoriteWorkerForMatching[] | null>
  onRetry: () => Promise<void> | void
  onStop: () => Promise<boolean | void> | boolean | void
  reduceMotion: boolean
  tokens: CustomerThemeTokens
}

export function FindingWorkersReceipt(props: FindingWorkersReceiptProps) {
  // Neither an open sheet nor a pending list response belongs to another actor/job.
  return <ScopedFindingWorkersReceipt key={props.selectionState.scopeKey} {...props} />
}

function ScopedFindingWorkersReceipt({
  language,
  matchingState,
  selectionState,
  onChoosePreference,
  onLoadSavedWorkers,
  onRetry,
  onStop,
  reduceMotion,
  tokens,
}: FindingWorkersReceiptProps) {
  const [state, dispatch] = useReducer(findingWorkersUiReducer, initialFindingWorkersUiState)
  const selectionFlight = useRef(false)
  const savedWorkersGeneration = useRef(0)
  const {
    allowFallback,
    preferenceBusy,
    retryBusy,
    savedWorkers,
    savedWorkersOpen,
    savedWorkersStatus,
    stopBusy,
  } = state
  const secondsRemaining = useReceiptCountdown(matchingState.batch?.deadline_at ?? null)
  const copy = receiptCopy(language)
  const choiceLocked = preferenceBusy || !selectionState.ready || selectionState.choice !== null || matchingState.stage !== 'awaiting_choice'
  const consent = selectionState.choice?.auto_general ?? allowFallback
  const stageCopy = copy.stages[matchingState.stage]
  const hasActiveBatch = Boolean(
    matchingState.batch &&
    matchingState.stage !== 'exhausted' &&
    matchingState.stage !== 'recovery_required',
  )
  const visibleSeconds = matchingState.batch?.deadline_at ? secondsRemaining : matchingState.batch?.seconds_remaining
  const transitionKey = [
    matchingState.stage,
    matchingState.strategy,
    matchingState.batch?.attempt ?? 'none',
    matchingState.batch?.deadline_at ?? 'none',
  ].join(':')

  const openSavedWorkers = async () => {
    if (choiceLocked || selectionFlight.current) return
    const generation = ++savedWorkersGeneration.current
    dispatch({ type: 'savedWorkersOpened' })
    try {
      const workers = await onLoadSavedWorkers()
      // This fence is checked after the response because closing/reopening can happen during the read.
      if (savedWorkersGeneration.current === generation) {
        dispatch(workers ? { type: 'savedWorkersLoaded', workers } : { type: 'savedWorkersLoadFailed' })
      }
    } catch {
      if (savedWorkersGeneration.current === generation) dispatch({ type: 'savedWorkersLoadFailed' })
    }
  }

  const closeSavedWorkers = () => {
    savedWorkersGeneration.current += 1
    dispatch({ type: 'savedWorkersClosed' })
  }

  const choosePreference = async (input: MatchingPreference) => {
    if (choiceLocked || selectionFlight.current) return
    selectionFlight.current = true
    dispatch({ type: 'preferenceBusy', value: true })
    try {
      const selected = await onChoosePreference(input)
      if (selected) closeSavedWorkers()
    } finally {
      selectionFlight.current = false
      dispatch({ type: 'preferenceBusy', value: false })
    }
  }

  const retry = async () => {
    if (retryBusy) return
    dispatch({ type: 'retryBusy', value: true })
    try {
      await onRetry()
    } finally {
      dispatch({ type: 'retryBusy', value: false })
    }
  }

  const stop = async () => {
    if (stopBusy) return
    dispatch({ type: 'stopBusy', value: true })
    try {
      await onStop()
    } finally {
      dispatch({ type: 'stopBusy', value: false })
    }
  }

  return (
    <View style={styles.root} testID="customer-v21-finding-workers-receipt">
      <KaelLiquidStatusTransition
        reduceMotion={reduceMotion}
        style={[styles.signal, { backgroundColor: tokens.service, borderColor: tokens.border }]}
        transitionKey={transitionKey}
      >
        <Text accessibilityLiveRegion="polite" style={[styles.signalTitle, { color: tokens.primary }]}>
          {stageCopy.title}
        </Text>
        <Text style={[styles.signalCopy, { color: tokens.muted }]}>{stageCopy.body}</Text>
      </KaelLiquidStatusTransition>

      <View style={[styles.receipt, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
        <Text accessibilityRole="header" style={[styles.receiptTitle, { color: tokens.text }]}>
          {copy.receiptTitle}
        </Text>
        <View style={styles.checks} testID="customer-v21-finding-workers-checks">
          {matchingState.checks.map((check) => (
            <View key={check.kind} style={styles.checkRow}>
              <View style={[styles.checkMark, { backgroundColor: check.state === 'verified' ? tokens.service : tokens.ghost }]} />
              <View style={styles.checkText}>
                <Text style={[styles.checkLabel, { color: tokens.text }]}>{copy.checks[check.kind]}</Text>
                <Text style={[styles.checkState, { color: tokens.muted }]}>
                  {check.state === 'verified' ? copy.verified : copy.checking}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {matchingState.batch ? (
          <View style={[styles.batch, { borderTopColor: tokens.border }]} testID="customer-v21-finding-workers-batch">
            <Text style={[styles.batchLabel, { color: tokens.text }]}>
              {matchingState.batch.strategy === 'saved_worker' ? copy.savedWorkerBatch : copy.generalBatch}
            </Text>
            <Text style={[styles.batchCopy, { color: tokens.muted }]}>
              {copy.batchCount(matchingState.batch.recipient_count, matchingState.batch.attempt)}
            </Text>
            {hasActiveBatch && visibleSeconds !== null && visibleSeconds !== undefined ? (
              <Text
                accessibilityElementsHidden
                accessible={false}
                style={[styles.countdown, { color: tokens.primary }]}
                testID="customer-v21-finding-workers-countdown"
              >
                {copy.remaining(formatCountdown(visibleSeconds))}
              </Text>
            ) : null}
          </View>
        ) : null}

        {matchingState.event_history.length > 0 ? (
          <View style={[styles.timeline, { borderTopColor: tokens.border }]} testID="customer-v21-finding-workers-timeline">
            <Text style={[styles.timelineTitle, { color: tokens.text }]}>{copy.timelineTitle}</Text>
            {matchingState.event_history.map((event, index) => (
              <View key={`${event.kind}:${event.occurred_at}:${index}`} style={styles.timelineRow}>
                <View style={[styles.timelineDot, { backgroundColor: tokens.primary }]} />
                <Text style={[styles.timelineCopy, { color: tokens.muted }]}>
                  {eventCopy(event.kind, event.recipient_count, copy)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {matchingState.stage === 'awaiting_choice' ? (
        <View style={styles.actions} testID="customer-v21-finding-workers-choice-actions">
          {!selectionState.ready || selectionState.choice ? (
            <Text accessibilityLiveRegion="polite" style={[styles.sheetBody, { color: tokens.text }]} testID="customer-v21-finding-workers-selection-reconcile">
              {selectionState.choice ? `${copy.reconcilingChoice} ${selectionState.choice.mode === 'general'
                ? copy.generalChoice : selectionState.choice.auto_general ? copy.fallbackChoice : copy.savedOnlyChoice}` : copy.checkingChoice}
            </Text>
          ) : null}
          <KaelButton
            accessibilityState={{ busy: preferenceBusy, disabled: choiceLocked }}
            disabled={choiceLocked}
            label={preferenceBusy ? copy.choosing : copy.chooseSaved}
            onPress={() => void openSavedWorkers()}
            size="small"
            testID="customer-v21-finding-workers-saved-open"
          />
          <KaelButton
            accessibilityState={{ busy: preferenceBusy, disabled: choiceLocked }}
            disabled={choiceLocked}
            label={copy.chooseGeneral}
            onPress={() => void choosePreference({ auto_general: true, mode: 'general' })}
            size="small"
            testID="customer-v21-finding-workers-general"
            variant="secondary"
          />
        </View>
      ) : null}

      {matchingState.stage === 'exhausted' || matchingState.stage === 'recovery_required' ? (
        <View style={styles.actions} testID="customer-v21-finding-workers-exhausted-actions">
          <KaelButton
            accessibilityState={{ busy: retryBusy, disabled: retryBusy || stopBusy }}
            disabled={retryBusy || stopBusy}
            label={retryBusy ? copy.retrying : copy.retry}
            onPress={() => void retry()}
            size="small"
            testID="customer-v21-finding-workers-exhausted-retry"
          />
          <KaelButton
            accessibilityState={{ busy: stopBusy, disabled: retryBusy || stopBusy }}
            disabled={retryBusy || stopBusy}
            label={stopBusy ? copy.stopping : copy.stop}
            onPress={() => void stop()}
            size="small"
            testID="customer-v21-finding-workers-stop"
            variant="secondary"
          />
        </View>
      ) : null}

      <SavedWorkersSheet
        busy={choiceLocked}
        allowFallback={consent}
        copy={copy}
        language={language}
        onClose={closeSavedWorkers}
        onToggleFallback={() => { if (!choiceLocked && !selectionFlight.current) dispatch({ type: 'allowFallback', value: !allowFallback }) }}
        onRetry={() => void openSavedWorkers()}
        onSelect={(workerId) => void choosePreference({
          auto_general: allowFallback,
          mode: 'saved_worker_first',
          worker_id: workerId,
        })}
        status={savedWorkersStatus}
        tokens={tokens}
        visible={savedWorkersOpen}
        workers={savedWorkers}
      />
    </View>
  )
}

function SavedWorkersSheet({
  allowFallback,
  busy,
  copy,
  language,
  onClose,
  onRetry,
  onSelect,
  onToggleFallback,
  status,
  tokens,
  visible,
  workers,
}: {
  allowFallback: boolean
  busy: boolean
  copy: ReturnType<typeof receiptCopy>
  language: AppLanguage
  onClose: () => void
  onRetry: () => void
  onSelect: (workerId: string) => void
  onToggleFallback: () => void
  status: SavedWorkersStatus
  tokens: CustomerThemeTokens
  visible: boolean
  workers: FavoriteWorkerForMatching[]
}) {
  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={styles.sheetScreen}>
        <Pressable
          accessibilityLabel={copy.closeSheet}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.sheetBackdrop}
          testID="customer-v21-finding-workers-sheet-backdrop"
        />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}
          testID="customer-v21-finding-workers-sheet"
        >
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeading}>
              <Text accessibilityRole="header" style={[styles.sheetTitle, { color: tokens.text }]}>{copy.sheetTitle}</Text>
            </View>
            <KaelButton
              label={copy.close}
              onPress={onClose}
              size="small"
              testID="customer-v21-finding-workers-sheet-close"
              variant="ghost"
            />
          </View>
          <ScrollView contentContainerStyle={styles.sheetList} keyboardShouldPersistTaps="handled">
            <Text style={[styles.sheetBody, { color: tokens.muted }]}>{copy.sheetBody}</Text>
            <Pressable
              accessibilityLabel={copy.allowFallback}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allowFallback, disabled: busy }}
              disabled={busy}
              onPress={onToggleFallback}
              style={[styles.consent, { backgroundColor: tokens.base, borderColor: tokens.borderStrong }]}
              testID="customer-v21-finding-workers-fallback-consent"
            >
              <Text accessibilityElementsHidden importantForAccessibility="no" style={[styles.consentMark, { color: tokens.primary }]}>{allowFallback ? '☑' : '☐'}</Text>
              <Text style={[styles.consentLabel, { color: tokens.text }]}>{copy.allowFallback}</Text>
            </Pressable>
            <Text style={[styles.sheetBody, { color: tokens.muted }]}>{allowFallback ? copy.fallbackDisclosure : copy.savedOnlyDisclosure}</Text>
            {status === 'loading' ? (
              <Text style={[styles.sheetState, { color: tokens.muted }]} testID="customer-v21-finding-workers-saved-loading">
                {copy.loadingSaved}
              </Text>
            ) : null}
            {status === 'error' ? (
              <View style={styles.sheetError} testID="customer-v21-finding-workers-saved-error">
                <Text style={[styles.sheetState, { color: tokens.muted }]}>{copy.savedError}</Text>
                <KaelButton
                  label={copy.tryAgain}
                  onPress={onRetry}
                  size="small"
                  testID="customer-v21-finding-workers-saved-retry"
                  variant="secondary"
                />
              </View>
            ) : null}
            {status === 'ready' && workers.length === 0 ? (
              <Text style={[styles.sheetState, { color: tokens.muted }]} testID="customer-v21-finding-workers-saved-empty">
                {copy.savedEmpty}
              </Text>
            ) : null}
            {status === 'ready' ? workers.map((worker) => {
              const available = worker.availability === 'available'
              const name = worker.display_name?.trim() || copy.unnamedSavedWorker
              const facts = workerFacts(worker, language)
              return (
                <View
                  key={worker.id}
                  style={[styles.workerRow, { backgroundColor: tokens.base, borderColor: tokens.border }]}
                  testID={`customer-v21-finding-workers-saved-${worker.id}`}
                >
                  {worker.avatar_url ? (
                    <Image contentFit="cover" source={worker.avatar_url} style={styles.workerAvatar} />
                  ) : (
                    <View style={[styles.workerAvatar, styles.workerAvatarFallback, { backgroundColor: tokens.service }]} />
                  )}
                  <View style={styles.workerDetails}>
                    <Text style={[styles.workerName, { color: tokens.text }]}>{name}</Text>
                    {facts ? <Text style={[styles.workerFacts, { color: tokens.muted }]}>{facts}</Text> : null}
                    <Text style={[styles.workerAvailability, { color: available ? tokens.primary : tokens.muted }]}>
                      {available ? copy.available : copy.unavailable}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`${available ? copy.choose : allowFallback ? copy.chooseWithFallback : copy.unavailable}: ${name}`}
                    accessibilityRole="button"
                    accessibilityState={{ busy: busy, disabled: busy || (!available && !allowFallback) }}
                    disabled={busy || (!available && !allowFallback)}
                    style={({ pressed }) => [styles.workerAction, {
                      backgroundColor: pressed && !busy ? tokens.ghost : tokens.service, borderColor: tokens.borderStrong,
                    }]}
                    onPress={() => onSelect(worker.id)}
                    testID={`customer-v21-finding-workers-saved-select-${worker.id}`}
                  >
                    <Text style={[styles.workerActionLabel, { color: busy || (!available && !allowFallback) ? tokens.muted : tokens.text }]}>
                      {available ? copy.choose : allowFallback ? copy.chooseWithFallback : copy.unavailable}
                    </Text>
                  </Pressable>
                </View>
              )
            }) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

let receiptClockNow = Date.now()
let receiptClockTimer: ReturnType<typeof setInterval> | null = null
let receiptClockSubscribers: (() => void)[] = []

function getReceiptClockSnapshot() {
  return receiptClockNow
}

function subscribeReceiptClock(listener: () => void) {
  receiptClockSubscribers = [...receiptClockSubscribers, listener]
  if (!receiptClockTimer) {
    receiptClockNow = Date.now()
    receiptClockTimer = setInterval(() => {
      receiptClockNow = Date.now()
      for (const subscriber of receiptClockSubscribers) subscriber()
    }, 1_000)
  }
  return () => {
    receiptClockSubscribers = receiptClockSubscribers.filter((subscriber) => subscriber !== listener)
    if (receiptClockSubscribers.length > 0 || !receiptClockTimer) return
    clearInterval(receiptClockTimer)
    receiptClockTimer = null
  }
}

function useReceiptCountdown(deadlineAt: string | null) {
  const deadlineMs = useMemo(() => deadlineAt ? Date.parse(deadlineAt) : Number.NaN, [deadlineAt])
  const subscribe = useCallback(
    (listener: () => void) => Number.isFinite(deadlineMs) ? subscribeReceiptClock(listener) : () => undefined,
    [deadlineMs],
  )
  const now = useSyncExternalStore(subscribe, getReceiptClockSnapshot, getReceiptClockSnapshot)

  if (!Number.isFinite(deadlineMs)) return null
  return Math.max(0, Math.ceil((deadlineMs - now) / 1_000))
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function workerFacts(worker: FavoriteWorkerForMatching, language: AppLanguage) {
  const facts: string[] = []
  if (worker.rating !== null) facts.push(language === 'vi' ? `Đánh giá ${worker.rating.toFixed(1)}` : `Rating ${worker.rating.toFixed(1)}`)
  if (worker.total_jobs > 0) facts.push(language === 'vi' ? `${worker.total_jobs} công việc` : `${worker.total_jobs} jobs`)
  return facts.join(' · ')
}

function eventCopy(
  kind: MatchingState['event_history'][number]['kind'],
  recipientCount: number | undefined,
  copy: ReturnType<typeof receiptCopy>,
) {
  if (kind === 'general_batch_sent') return typeof recipientCount === 'number' && Number.isInteger(recipientCount) && recipientCount > 0
    ? copy.generalBatchEvent(recipientCount) : copy.deliveryReconciling
  if (kind === 'search_expanded') return copy.expandedEvent()
  return copy.events[kind]
}

function receiptCopy(language: AppLanguage) {
  if (language === 'en') {
    return {
      available: 'Available for this request',
      batchCount: (count: number, attempt: number) => `Request sent to ${count} worker${count === 1 ? '' : 's'} · attempt ${attempt}`,
      checking: 'Checking',
      choose: 'Choose',
      chooseGeneral: 'Let Kael find a suitable worker',
      chooseSaved: 'Choose a saved worker',
      choosing: 'Saving choice',
      checks: {
        availability: 'Current ability to accept work',
        service_area: 'Service area',
        service_capability: 'Service and required skills',
      },
      close: 'Close',
      closeSheet: 'Close saved workers',
      events: {
        awaiting_customer_choice: 'Waiting for your choice before sending any request.',
        candidate_ready: 'A worker accepted. Your confirmation is still required before matching.',
        matching_recovery_required: 'Kael could not confirm a worker request. You can retry without sending a duplicate batch.',
        no_worker_found: 'No suitable worker is available in the current search.',
        saved_worker_declined: 'The saved worker could not take this request, so Kael expanded the search.',
        saved_worker_no_response: 'The saved worker did not respond in time, so Kael expanded the search.',
        saved_worker_requested: 'Kael sent the first request to your selected saved worker.',
        saved_worker_unavailable: 'The saved worker is not available for this request, so Kael expanded the search.',
        search_stopped: 'Worker search was stopped.',
      },
      expandedEvent: () => 'Kael expanded the search to another suitable group.',
      generalBatch: 'Current general search',
      generalBatchEvent: (count: number) => `Kael sent this batch to ${count} suitable worker${count === 1 ? '' : 's'}.`,
      deliveryReconciling: 'Checking how many workers received this request.',
      loadingSaved: 'Loading your saved workers…',
      receiptTitle: 'Matching receipt',
      remaining: (value: string) => `${value} remaining for this batch`,
      retry: 'Find workers again',
      retrying: 'Finding workers again',
      savedEmpty: 'There are no saved workers eligible for this request.',
      savedError: 'Saved workers are temporarily unavailable.',
      savedWorkerBatch: 'Selected saved worker',
      allowFallback: 'Allow other workers if the selected worker cannot accept',
      checkingChoice: 'Checking your stored choice before allowing another request.',
      chooseWithFallback: 'Choose with fallback',
      fallbackChoice: 'Prefer the selected worker; allow other workers.',
      fallbackDisclosure: 'If this worker declines, does not respond in time or is unavailable, Kael may contact other eligible workers. You still confirm the official match.',
      generalChoice: 'Find a suitable worker.',
      reconcilingChoice: 'Reconciling the saved choice; no new choice will be sent.',
      savedOnlyChoice: 'Only the selected worker.',
      savedOnlyDisclosure: 'Only this worker will be contacted. Kael will not expand the search without your permission.',
      sheetBody: 'Availability is checked again when you choose. Decide whether Kael may contact other workers.',
      sheetTitle: 'Choose a saved worker',
      stages: {
        awaiting_choice: { body: 'Choose whether to start with a saved worker or let Kael search the suitable group.', title: 'Kael is ready to begin matching' },
        candidate_ready: { body: 'A worker responded. Review and confirm them before the official match.', title: 'A worker is ready for your review' },
        exhausted: { body: 'The current search has no available response. You can try again or stop the search.', title: 'No worker has responded yet' },
        recovery_required: { body: 'Kael could not confirm a worker request. You can retry safely or stop the search.', title: 'A worker request needs your decision' },
        general_search: { body: 'Kael is checking real availability and sending the current batch only to eligible workers.', title: 'Kael is finding suitable workers' },
        saved_worker_search: { body: 'Kael is giving your selected saved worker the first response window.', title: 'Kael is contacting your saved worker' },
        stopped: { body: 'No more requests will be sent unless you restart this case later.', title: 'Worker search stopped' },
      },
      stop: 'Stop searching',
      stopping: 'Stopping search',
      timelineTitle: 'Search updates',
      tryAgain: 'Try again',
      unavailable: 'Unavailable for this request',
      unnamedSavedWorker: 'Saved worker profile',
      verified: 'Checked',
    }
  }
  return {
    available: 'Có thể nhận yêu cầu này',
    batchCount: (count: number, attempt: number) => `Đã gửi yêu cầu đến ${count} thợ · lần tìm ${attempt}`,
    checking: 'Đang đối chiếu',
    choose: 'Chọn',
    chooseGeneral: 'Để Kael tìm thợ phù hợp',
    chooseSaved: 'Chọn thợ đã lưu',
    choosing: 'Đang lưu lựa chọn',
    checks: {
      availability: 'Khả năng nhận việc hiện tại',
      service_area: 'Khu vực phục vụ',
      service_capability: 'Dịch vụ và kỹ năng cần thiết',
    },
    close: 'Đóng',
    closeSheet: 'Đóng danh sách thợ đã lưu',
      events: {
        awaiting_customer_choice: 'Kael đang chờ lựa chọn của bạn trước khi gửi yêu cầu cho thợ.',
        candidate_ready: 'Đã có thợ nhận lời. Bạn vẫn cần xác nhận trước khi ghép chính thức.',
        matching_recovery_required: 'Kael chưa xác nhận được lượt gửi đến thợ. Bạn có thể tìm lại mà không gửi trùng lượt.',
        no_worker_found: 'Chưa có thợ phù hợp có thể nhận yêu cầu trong lượt tìm hiện tại.',
      saved_worker_declined: 'Thợ đã lưu chưa thể nhận yêu cầu này nên Kael đã mở rộng tìm kiếm.',
      saved_worker_no_response: 'Thợ đã lưu chưa phản hồi đúng hạn nên Kael mở rộng tìm kiếm.',
      saved_worker_requested: 'Kael đã gửi yêu cầu đầu tiên đến thợ bạn chọn.',
      saved_worker_unavailable: 'Thợ đã lưu chưa sẵn sàng cho yêu cầu này nên Kael đã mở rộng tìm kiếm.',
      search_stopped: 'Đã dừng tìm thợ.',
    },
    expandedEvent: () => 'Kael đã mở rộng sang nhóm thợ phù hợp khác.',
    generalBatch: 'Lượt tìm chung hiện tại',
    generalBatchEvent: (count: number) => `Kael đã gửi lượt này đến ${count} thợ phù hợp.`,
    deliveryReconciling: 'Đang đối chiếu số thợ đã nhận yêu cầu này.',
    loadingSaved: 'Đang tải thợ đã lưu…',
    receiptTitle: 'Biên nhận tìm thợ',
    remaining: (value: string) => `Còn ${value} cho lượt này`,
    retry: 'Tìm lại thợ',
    retrying: 'Đang tìm lại thợ',
    savedEmpty: 'Không có thợ đã lưu phù hợp với yêu cầu này.',
    savedError: 'Chưa tải được thợ đã lưu.',
    savedWorkerBatch: 'Thợ đã lưu được chọn',
    allowFallback: 'Cho phép tìm thợ khác nếu thợ đã chọn không nhận',
    checkingChoice: 'Đang kiểm tra lựa chọn đã lưu trước khi cho phép gửi yêu cầu mới.',
    chooseWithFallback: 'Chọn và cho phép tìm thợ khác',
    fallbackChoice: 'Ưu tiên thợ đã chọn; cho phép tìm thợ khác.',
    fallbackDisclosure: 'Nếu thợ từ chối, hết thời gian phản hồi hoặc không sẵn sàng, Kael được tìm thợ khác đủ điều kiện. Bạn vẫn xác nhận thợ chính thức.',
    generalChoice: 'Tìm thợ phù hợp.',
    reconcilingChoice: 'Đang đối soát lựa chọn đã lưu; chưa gửi lựa chọn mới.',
    savedOnlyChoice: 'Chỉ tìm thợ đã chọn.',
    savedOnlyDisclosure: 'Chỉ liên hệ thợ này. Kael không tự tìm thợ khác khi chưa được bạn cho phép.',
    sheetBody: 'Khả năng nhận việc được kiểm tra lại khi bạn chọn. Bạn quyết định có cho phép Kael tìm thợ khác hay không.',
    sheetTitle: 'Chọn thợ đã lưu',
    stages: {
        awaiting_choice: { body: 'Chọn bắt đầu với thợ đã lưu hoặc để Kael tìm nhóm thợ phù hợp.', title: 'Kael sẵn sàng bắt đầu ghép thợ' },
        candidate_ready: { body: 'Một thợ đã phản hồi. Hãy xem và xác nhận trước khi ghép chính thức.', title: 'Đã có thợ chờ bạn xem xét' },
        exhausted: { body: 'Lượt tìm hiện tại chưa có phản hồi khả dụng. Bạn có thể tìm lại hoặc dừng tìm.', title: 'Chưa có thợ phản hồi' },
        recovery_required: { body: 'Kael chưa xác nhận được lượt gửi đến thợ. Bạn có thể tìm lại an toàn hoặc dừng tìm.', title: 'Lượt gửi cần quyết định của bạn' },
        general_search: { body: 'Kael đang kiểm tra khả năng nhận việc thật và chỉ gửi lượt hiện tại cho thợ đủ điều kiện.', title: 'Kael đang tìm thợ phù hợp' },
      saved_worker_search: { body: 'Kael đang dành cửa sổ phản hồi đầu tiên cho thợ đã lưu bạn chọn.', title: 'Kael đang liên hệ thợ đã lưu' },
      stopped: { body: 'Kael không gửi thêm yêu cầu cho thợ khi bạn đã dừng tìm.', title: 'Đã dừng tìm thợ' },
    },
    stop: 'Dừng tìm',
    stopping: 'Đang dừng tìm',
    timelineTitle: 'Các mốc tìm thợ',
    tryAgain: 'Thử lại',
    unavailable: 'Chưa thể nhận yêu cầu này',
    unnamedSavedWorker: 'Hồ sơ thợ đã lưu',
    verified: 'Đã kiểm tra',
  }
}

const styles = StyleSheet.create({
  actions: { gap: 10, marginTop: 14 },
  batch: { borderTopWidth: StyleSheet.hairlineWidth, gap: 4, marginTop: 14, paddingTop: 14 },
  batchCopy: { ...typography.footnote },
  batchLabel: { ...typography.subheadline, fontWeight: '600' },
  checkLabel: { ...typography.footnote, fontWeight: '600' },
  checkMark: { borderRadius: 5, height: 10, marginTop: 5, width: 10 },
  checkRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  checkState: { ...typography.caption1 },
  checkText: { flex: 1, gap: 1 },
  checks: { gap: 10, marginTop: 12 },
  consent: { alignItems: 'flex-start', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 48, padding: 12 },
  consentLabel: { flex: 1, ...typography.subheadline },
  consentMark: { ...typography.title3 },
  countdown: { ...typography.footnote, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 2 },
  receipt: { borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 14 },
  receiptTitle: { ...typography.subheadline, fontWeight: '600' },
  root: { gap: 0 },
  sheet: { alignSelf: 'center', borderRadius: 22, borderWidth: 1, maxHeight: '78%', maxWidth: 620, padding: 18, width: '100%' },
  sheetBackdrop: { ...StyleSheet.absoluteFill },
  sheetBody: { ...typography.footnote },
  sheetError: { gap: 10 },
  sheetHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  sheetHeading: { flex: 1, gap: 4 },
  sheetList: { gap: 10, paddingTop: 16 },
  sheetScreen: { backgroundColor: 'rgba(7, 27, 31, 0.46)', flex: 1, justifyContent: 'flex-end', padding: 16 },
  sheetState: { ...typography.subheadline, paddingVertical: 6 },
  sheetTitle: { ...typography.title3, fontWeight: '600' },
  signal: { borderRadius: 14, borderWidth: 1, gap: 3, padding: 13 },
  signalCopy: { ...typography.subheadline },
  signalTitle: { ...typography.subheadline, fontWeight: '600' },
  timeline: { borderTopWidth: StyleSheet.hairlineWidth, gap: 9, marginTop: 14, paddingTop: 14 },
  timelineCopy: { flex: 1, ...typography.caption1 },
  timelineDot: { borderRadius: 3, height: 6, marginTop: 6, width: 6 },
  timelineRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 9 },
  timelineTitle: { ...typography.subheadline, fontWeight: '600' },
  workerAvailability: { ...typography.caption1, fontWeight: '600' },
  workerAction: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexBasis: '100%', justifyContent: 'center', minHeight: 48, padding: 12 },
  workerActionLabel: { ...typography.subheadline, fontWeight: '600', textAlign: 'center' },
  workerAvatar: { borderRadius: 20, height: 40, width: 40 },
  workerAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  workerDetails: { flex: 1, gap: 1 },
  workerFacts: { ...typography.caption1 },
  workerName: { ...typography.subheadline, fontWeight: '600' },
  workerRow: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 11 },
})
