import { SERVICE_TYPES, type ServiceType } from '@nestscout/shared'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ListRenderItemInfo } from 'react-native'

import { getCustomerThemeTokens, getReducedTransparencyCustomerTokens, useCustomerThemeMode } from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import { radius, spacing } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type {
  AdminViewActor,
  AdminViewEvidenceMetadata,
  AdminViewSupportCaseDetailResponse,
  AdminViewSupportCaseListInput,
  AdminViewSupportCaseSource,
  AdminViewSupportCaseSummary,
  AdminViewSupportChecklist,
  AdminViewSupportPreparation,
  AdminViewSupportPreparationStatus,
} from '@/lib/api-types/admin'
import { ADMIN_VIEW_SUPPORT_QUEUE_TYPES } from '@/lib/api-types/admin'
import {
  clearStableClientRequestId,
  shouldRetainClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from '@/lib/client-request-id'
import { adminControlService } from '@/lib/services'

import { formatAdminDateTime, formatAdminNumber, formatAdminVnd } from './admin-intl'
import { AdminText } from './admin-text'
import {
  DetailField,
  DetailHeading,
  DetailSection,
  EvidenceRows,
  TimelineRows,
  WorkspaceEmpty,
  WorkspaceFeedback,
  WorkspaceFilterRow,
  WorkspaceMetrics,
  WorkspaceSearch,
} from './admin-operations-workspace-ui'

type SupportFilters = Required<Pick<AdminViewSupportCaseListInput, 'assignee' | 'preparation_status' | 'priority' | 'query' | 'service_type' | 'source_status' | 'type'>>

type SupportPreparationInput = {
  assignment?: 'claim' | 'unclaim' | 'keep'
  checklist?: Partial<AdminViewSupportChecklist>
  note?: string
  status?: AdminViewSupportPreparationStatus
}

type FailedSupportAction =
  | { input: SupportPreparationInput; kind: 'preparation' }
  | { item: AdminViewEvidenceMetadata; kind: 'evidence' }

type SupportState = {
  actionError: string | null
  counts: { key: string; count: number }[]
  detail: AdminViewSupportCaseDetailResponse | null
  detailError: string | null
  detailLoading: boolean
  error: string | null
  generatedAt: string | null
  hasMore: boolean
  listLoading: boolean
  nextCursor: string | null
  noteDraft: string
  records: AdminViewSupportCaseSummary[]
  refreshing: boolean
  saving: boolean
  selected: { id: string; source: AdminViewSupportCaseSource } | null
}

const initialState: SupportState = {
  actionError: null, counts: [], detail: null, detailError: null, detailLoading: false, error: null, generatedAt: null, hasMore: false,
  listLoading: true, nextCursor: null, noteDraft: '', records: [], refreshing: false, saving: false, selected: null,
}

function reducer(state: SupportState, patch: Partial<SupportState>) {
  return { ...state, ...patch }
}

export function AdminSupportCaseCenter({ actor, language, onSessionMissing }: {
  actor: AdminViewActor
  language: AppLanguage
  onSessionMissing: () => void
}) {
  const { width } = useWindowDimensions()
  const themeMode = useCustomerThemeMode()
  const { reduceTransparency } = useGlassAccessibility()
  const baseTokens = getCustomerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  const copy = supportCopy[language]
  const [state, patch] = useReducer(reducer, initialState)
  const [filters, setFilters] = useReducer((current: SupportFilters, next: Partial<SupportFilters>) => ({ ...current, ...next }), {
    assignee: 'all', preparation_status: 'all', priority: 'all', query: '', service_type: 'all', source_status: 'all', type: 'all',
  })
  const [debouncedQuery, setDebouncedQuery] = useReducer((_current: string, next: string) => next, '')
  const listRequestId = useRef(0)
  const detailRequestId = useRef(0)
  const failedAction = useRef<FailedSupportAction | null>(null)
  const pendingPreparationRequest = useRef<PendingClientRequestId | null>(null)
  const stateRef = useRef(state)
  const listCache = useMemo(() => new Map<string, Pick<SupportState, 'counts' | 'generatedAt' | 'hasMore' | 'nextCursor' | 'records'>>(), [])
  const detailCache = useMemo(() => new Map<string, AdminViewSupportCaseDetailResponse>(), [])
  const wide = width >= 768

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const nextQuery = filters.query.trim()
    if (nextQuery === debouncedQuery) return
    const timer = setTimeout(() => setDebouncedQuery(nextQuery), 300)
    return () => clearTimeout(timer)
  }, [debouncedQuery, filters.query])

  const queryInput = useMemo<AdminViewSupportCaseListInput>(() => ({
    assignee: filters.assignee,
    limit: 20,
    preparation_status: filters.preparation_status,
    priority: filters.priority,
    query: debouncedQuery || undefined,
    service_type: filters.service_type,
    source_status: filters.source_status,
    type: filters.type,
  }), [debouncedQuery, filters.assignee, filters.preparation_status, filters.priority, filters.service_type, filters.source_status, filters.type])
  const queryKey = useMemo(() => JSON.stringify(queryInput), [queryInput])

  const loadList = useCallback(async ({ append = false, force = false }: { append?: boolean; force?: boolean } = {}) => {
    const cached = listCache.get(queryKey)
    if (!append && !force && cached) {
      patch({ ...cached, error: null, listLoading: false, refreshing: false })
      return
    }
    const requestId = ++listRequestId.current
    const current = stateRef.current
    patch({ error: null, ...(current.records.length === 0 ? { listLoading: true } : { refreshing: true }) })
    const result = await adminControlService.listSupportCases({ ...queryInput, cursor: append ? current.nextCursor ?? undefined : undefined })
    if (requestId === listRequestId.current) {
      if (!result.success) {
        if (result.status === 401 || result.status === 403) onSessionMissing()
        patch({ error: result.error, listLoading: false, refreshing: false })
      } else {
        const snapshot = {
          counts: result.data.counts,
          generatedAt: result.data.generated_at,
          hasMore: result.data.has_more,
          nextCursor: result.data.next_cursor,
          records: append ? [...stateRef.current.records, ...result.data.records] : result.data.records,
        }
        if (!append) listCache.set(queryKey, snapshot)
        patch({ ...snapshot, listLoading: false, refreshing: false })
      }
    }
  }, [listCache, onSessionMissing, queryInput, queryKey])

  const cancelListRequest = useCallback(() => {
    listRequestId.current += 1
  }, [])

  useEffect(() => {
    void loadList()
    return cancelListRequest
  }, [cancelListRequest, loadList])

  const loadDetail = useCallback(async (selection: { id: string; source: AdminViewSupportCaseSource }, force = false) => {
    const key = `${selection.source}:${selection.id}`
    failedAction.current = null
    patch({ actionError: null, detail: null, detailError: null, detailLoading: true, noteDraft: '', selected: selection })
    const cached = detailCache.get(key)
    if (cached && !force) {
      patch({ detail: cached, detailLoading: false })
      return
    }
    const requestId = ++detailRequestId.current
    const result = await adminControlService.getSupportCase(selection.source, selection.id)
    if (requestId === detailRequestId.current) {
      if (!result.success) {
        if (result.status === 401 || result.status === 403) onSessionMissing()
        patch({ detailError: result.error, detailLoading: false })
      } else {
        detailCache.set(key, result.data)
        patch({ detail: result.data, detailLoading: false })
      }
    }
  }, [detailCache, onSessionMissing])

  const closeDetail = () => {
    detailRequestId.current += 1
    failedAction.current = null
    patch({ actionError: null, detail: null, detailError: null, detailLoading: false, noteDraft: '', selected: null })
  }

  const savePreparation = useCallback(async (input: SupportPreparationInput) => {
    if (!state.detail || !state.selected || state.saving) return
    const fingerprint = JSON.stringify({
      expectedVersion: state.detail.preparation.version,
      input,
      selected: state.selected,
    })
    const idempotencyKey = stableClientRequestId(pendingPreparationRequest, fingerprint)
    patch({ actionError: null, saving: true })
    const result = await adminControlService.updateSupportCasePreparation(state.selected.source, state.selected.id, {
      ...input,
      expected_version: state.detail.preparation.version,
      idempotency_key: idempotencyKey,
    })
    if (!result.success) {
      if (!shouldRetainClientRequestId(result)) {
        clearStableClientRequestId(pendingPreparationRequest, fingerprint)
      }
      failedAction.current = { input, kind: 'preparation' }
      patch({ actionError: result.error, saving: false })
      return
    }
    clearStableClientRequestId(pendingPreparationRequest, fingerprint)
    failedAction.current = null
    const nextDetail = { ...state.detail, preparation: result.data }
    detailCache.set(`${state.selected.source}:${state.selected.id}`, nextDetail)
    listCache.delete(queryKey)
    patch({
      detail: nextDetail,
      noteDraft: input.note ? '' : state.noteDraft,
      records: state.records.map((record) => record.source === state.selected?.source && record.case_id === state.selected?.id
        ? { ...record, assigned_to: result.data.assigned_to, preparation_status: result.data.status }
        : record),
      saving: false,
    })
    if (input.note) void loadDetail(state.selected, true)
  }, [detailCache, listCache, loadDetail, queryKey, state.detail, state.noteDraft, state.records, state.saving, state.selected])

  const openEvidence = useCallback(async (item: AdminViewEvidenceMetadata) => {
    if (!state.selected) return
    const result = await adminControlService.createSupportCaseEvidenceAccess(state.selected.source, state.selected.id, { evidence_id: item.evidence_id })
    if (!result.success) {
      failedAction.current = { item, kind: 'evidence' }
      patch({ actionError: result.error })
      return
    }
    await Linking.openURL(result.data.signed_url).then(() => {
      failedAction.current = null
      patch({ actionError: null })
    }).catch(() => {
      failedAction.current = { item, kind: 'evidence' }
      patch({ actionError: copy.evidenceError })
    })
  }, [copy.evidenceError, state.selected])

  const selectSupportCase = useCallback((item: AdminViewSupportCaseSummary) => {
    void loadDetail({ id: item.case_id, source: item.source })
  }, [loadDetail])

  const renderSupportItem = useCallback(({ item }: ListRenderItemInfo<AdminViewSupportCaseSummary>) => <SupportRow
    item={item}
    language={language}
    onPress={selectSupportCase}
    selected={state.selected?.id === item.case_id && state.selected.source === item.source}
    tokens={tokens}
  />, [language, selectSupportCase, state.selected, tokens])

  const count = (key: string) => state.counts.find((item) => item.key === key)?.count ?? 0
  const cancellationCount = count('worker_cancellation_review') + count('customer_cancellation_review')
  const list = <FlatList
    contentContainerStyle={styles.listContent}
    data={state.records}
    keyExtractor={(item) => `${item.source}:${item.case_id}`}
    keyboardShouldPersistTaps="handled"
    ListEmptyComponent={state.listLoading ? null : <WorkspaceEmpty label={copy.empty} tokens={tokens} />}
    ListFooterComponent={state.hasMore ? <KaelButton label={copy.loadMore} onPress={() => { void loadList({ append: true }) }} variant="secondary" /> : null}
    ListHeaderComponent={<View style={styles.listHeader}>
      <WorkspaceMetrics items={[
        { label: copy.metrics.total, value: state.records.length },
        { label: copy.types.dispute, value: count('dispute') },
        { label: copy.metrics.noShow, value: count('worker_no_show') },
        { label: copy.metrics.cancellation, value: cancellationCount },
      ]} tokens={tokens} />
      <WorkspaceSearch label={copy.search} onChange={(query) => setFilters({ query })} onRefresh={() => { listCache.delete(queryKey); void loadList({ force: true }) }} refreshLabel={copy.refresh} refreshing={state.refreshing} tokens={tokens} value={filters.query} />
      <WorkspaceFilterRow label={copy.filters.type} onSelect={(type) => setFilters({ type })} options={supportTypeOptions(language)} selected={filters.type} tokens={tokens} />
      <WorkspaceFilterRow label={copy.filters.priority} onSelect={(priority) => setFilters({ priority })} options={priorityOptions(language)} selected={filters.priority} tokens={tokens} />
      <WorkspaceFilterRow label={copy.filters.preparation} onSelect={(preparation_status) => setFilters({ preparation_status })} options={preparationOptions(language)} selected={filters.preparation_status} tokens={tokens} />
      <WorkspaceFilterRow label={copy.filters.assignee} onSelect={(assignee) => setFilters({ assignee })} options={assigneeOptions(language)} selected={filters.assignee} tokens={tokens} />
      <WorkspaceFilterRow label={copy.filters.service} onSelect={(service_type) => setFilters({ service_type })} options={serviceOptions(language)} selected={filters.service_type} tokens={tokens} />
      <WorkspaceFilterRow label={copy.filters.sourceStatus} onSelect={(source_status) => setFilters({ source_status })} options={sourceStatusOptions(language)} selected={filters.source_status} tokens={tokens} />
      <WorkspaceFeedback compact error={state.error} loading={state.listLoading && state.records.length === 0} loadingLabel={copy.loading} onRetry={() => { void loadList({ force: true }) }} retryLabel={copy.retry} tokens={tokens} />
      {state.generatedAt ? <AdminText textRole="caption1" style={{ color: tokens.subtleText }}>{copy.generated}: {formatDate(state.generatedAt, language)}</AdminText> : null}
    </View>}
    renderItem={renderSupportItem}
    showsVerticalScrollIndicator={false}
    style={styles.list}
    testID="admin-support-case-list"
  />

  const detail = <SupportDetail
    actionError={state.actionError}
    actor={actor}
    detail={state.detail}
    error={state.detailError}
    language={language}
    loading={state.detailLoading}
    noteDraft={state.noteDraft}
    onBack={wide ? undefined : closeDetail}
    onChangeNote={(noteDraft) => patch({ noteDraft })}
    onOpenEvidence={openEvidence}
    onRetry={() => state.selected && void loadDetail(state.selected, true)}
    onRetryAction={() => {
      const action = failedAction.current
      if (action?.kind === 'preparation') void savePreparation(action.input)
      if (action?.kind === 'evidence') void openEvidence(action.item)
    }}
    onSave={savePreparation}
    saving={state.saving}
    tokens={tokens}
  />

  if (!wide && state.selected) return <View style={styles.workspace}>{detail}</View>
  return <View style={[styles.workspace, wide && styles.masterDetail]}>
    <View style={[styles.listPane, wide && { borderRightColor: tokens.border }]}>{list}</View>
    {wide ? <View style={styles.detailPane}>{state.selected ? detail : <WorkspaceEmpty label={copy.select} tokens={tokens} />}</View> : null}
  </View>
}

function SupportRow({ item, language, onPress, selected, tokens }: {
  item: AdminViewSupportCaseSummary
  language: AppLanguage
  onPress: (item: AdminViewSupportCaseSummary) => void
  selected: boolean
  tokens: ReturnType<typeof getCustomerThemeTokens>
}) {
  const copy = supportCopy[language]
  return <Pressable
    accessibilityLabel={`${caseTypeLabel(item.type, language)}. ${item.display_code ?? item.case_id}. ${sourceStatusLabel(item.source_status, language)}`}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    onPress={() => onPress(item)}
    style={({ pressed }) => [styles.row, { backgroundColor: selected ? tokens.ghost : 'transparent', borderBottomColor: tokens.border, opacity: pressed ? 0.7 : 1 }]}
  >
    <View style={styles.rowMain}>
      <AdminText textRole="headline" style={{ color: tokens.text }}>{caseTypeLabel(item.type, language)}</AdminText>
      <AdminText textRole="footnote" style={{ color: tokens.muted }}>{item.display_code ?? item.case_id} · {formatDate(item.updated_at, language)}</AdminText>
    </View>
    <View style={styles.rowMeta}>
      <AdminText textRole="caption1" style={{ color: priorityColor(item.priority, tokens), textAlign: 'right' }}>{copy.priorities[item.priority]}</AdminText>
      <AdminText textRole="footnote" style={{ color: tokens.text, textAlign: 'right' }}>{sourceStatusLabel(item.source_status, language)}</AdminText>
      <AdminText textRole="caption1" style={{ color: tokens.subtleText, textAlign: 'right' }}>{preparationLabel(item.preparation_status ?? 'new', language)}</AdminText>
    </View>
  </Pressable>
}

function SupportDetail({ actionError, actor, detail, error, language, loading, noteDraft, onBack, onChangeNote, onOpenEvidence, onRetry, onRetryAction, onSave, saving, tokens }: {
  actionError: string | null
  actor: AdminViewActor
  detail: AdminViewSupportCaseDetailResponse | null
  error: string | null
  language: AppLanguage
  loading: boolean
  noteDraft: string
  onBack?: () => void
  onChangeNote: (value: string) => void
  onOpenEvidence: (item: AdminViewEvidenceMetadata) => void
  onRetry: () => void
  onRetryAction: () => void
  onSave: (input: SupportPreparationInput) => void
  saving: boolean
  tokens: ReturnType<typeof getCustomerThemeTokens>
}) {
  const copy = supportCopy[language]
  if (loading || error || !detail) return <WorkspaceFeedback error={error} loading={loading} loadingLabel={copy.detailLoading} onRetry={onRetry} retryLabel={copy.retry} tokens={tokens} />
  const canEdit = actor.capabilities.includes('operations.triage') && detail.preparation.can_edit
  const assignedToMe = detail.preparation.assigned_to_me
  return <ScrollView contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.detailScroll}>
    <DetailHeading backLabel={copy.back} generatedAt={formatDate(detail.generated_at, language)} generatedLabel={copy.generated} onBack={onBack} title={detail.summary.display_code ?? detail.summary.case_id} tokens={tokens} />
    <WorkspaceFeedback compact error={actionError} loading={false} loadingLabel={copy.saving} onRetry={onRetryAction} retryLabel={copy.retry} tokens={tokens} />
    <DetailSection title={copy.sections.summary} tokens={tokens}>
      <AdminText textRole="body" style={{ color: tokens.text }}>{detail.neutral_summary}</AdminText>
      <DetailField label={copy.fields.type} tokens={tokens} value={caseTypeLabel(detail.summary.type, language)} />
      <DetailField label={copy.fields.priority} tokens={tokens} value={copy.priorities[detail.summary.priority]} />
      <DetailField label={copy.fields.sourceStatus} tokens={tokens} value={sourceStatusLabel(detail.summary.source_status, language)} />
      <DetailField label={copy.fields.reason} tokens={tokens} value={reasonCodeLabel(detail.summary.reason_code, language)} />
    </DetailSection>
    <DetailSection title={copy.sections.parties} tokens={tokens}>
      {detail.parties.map((party, index) => <DetailField key={`${party.role}-${index}`} label={partyRoleLabel(party.role, language)} tokens={tokens} value={[party.name, party.contact_masked].filter(Boolean).join(' · ') || copy.notRecorded} />)}
    </DetailSection>
    <DetailSection title={copy.sections.statements} tokens={tokens}>
      <DetailField label={copy.fields.openingStatement} tokens={tokens} value={detail.opening_statement ?? copy.notRecorded} />
      <DetailField label={copy.fields.counterpartyStatement} tokens={tokens} value={detail.counterparty_statement ?? copy.notRecorded} />
    </DetailSection>
    <DetailSection title={copy.sections.evidence} tokens={tokens}>
      {detail.evidence.length > 0 ? <GroupedEvidenceRows items={detail.evidence} language={language} onOpen={onOpenEvidence} tokens={tokens} /> : <AdminText textRole="subheadline" style={{ color: tokens.muted }}>{copy.noEvidence}</AdminText>}
    </DetailSection>
    <DetailSection title={copy.sections.timeline} tokens={tokens}>
      <TimelineRows items={detail.timeline.map((item) => ({ ...item, label: supportTimelineLabel(item.key, language), occurred_at: formatDate(item.occurred_at, language) }))} tokens={tokens} />
    </DetailSection>
    <DetailSection title={copy.sections.signals} tokens={tokens}>
      {detail.abuse_signals.length > 0 ? detail.abuse_signals.map((signal) => <View key={signal} style={styles.signalRow}><View style={[styles.signalDot, { backgroundColor: tokens.copper }]} /><AdminText textRole="subheadline" style={{ color: tokens.text }}>{abuseSignalLabel(signal, language)}</AdminText></View>) : <AdminText textRole="subheadline" style={{ color: tokens.muted }}>{copy.noSignals}</AdminText>}
      <AdminText textRole="footnote" style={{ color: tokens.subtleText }}>{copy.signalDisclaimer}</AdminText>
    </DetailSection>
    {detail.recorded_decision ? <DetailSection title={copy.sections.recordedDecision} tokens={tokens}>
      {Object.entries(detail.recorded_decision).map(([key, value]) => <DetailField key={key} label={decisionFieldLabel(key, language)} numeric={typeof value === 'number'} tokens={tokens} value={formatDecisionValue(key, value, language)} />)}
      <AdminText textRole="footnote" style={{ color: tokens.copper }}>{copy.decisionDisclaimer}</AdminText>
    </DetailSection> : null}
    <PreparationSection
      assignedToMe={assignedToMe}
      canEdit={canEdit}
      copy={copy}
      language={language}
      noteDraft={noteDraft}
      onChangeNote={onChangeNote}
      onSave={onSave}
      preparation={detail.preparation}
      saving={saving}
      tokens={tokens}
    />
    <DetailSection title={copy.sections.notes} tokens={tokens}>
      {detail.notes.length === 0 ? <AdminText textRole="subheadline" style={{ color: tokens.muted }}>{copy.noNotes}</AdminText> : detail.notes.map((note) => <View key={note.note_id} style={[styles.noteRow, { borderBottomColor: tokens.border }]}>
        <AdminText textRole="subheadline" style={{ color: tokens.text }}>{note.body}</AdminText>
        <AdminText textRole="caption1" style={{ color: tokens.subtleText }}>{note.author_name ?? copy.notRecorded} · {formatDate(note.created_at, language)}</AdminText>
      </View>)}
    </DetailSection>
  </ScrollView>
}

function GroupedEvidenceRows({ items, language, onOpen, tokens }: {
  items: AdminViewEvidenceMetadata[]
  language: AppLanguage
  onOpen: (item: AdminViewEvidenceMetadata) => void
  tokens: ReturnType<typeof getCustomerThemeTokens>
}) {
  const copy = supportCopy[language]
  const groups = (['snapshot', 'photo', 'document', 'chat'] as const).reduce<{
    items: AdminViewEvidenceMetadata[]
    kind: 'chat' | 'document' | 'photo' | 'snapshot'
  }[]>((result, kind) => {
    const groupedItems = items.flatMap((item) => item.kind === kind ? [{
      ...item,
      captured_at: item.captured_at ? formatDate(item.captured_at, language) : null,
      label: evidenceLabel(item.label, language),
    }] : [])
    if (groupedItems.length > 0) result.push({ items: groupedItems, kind })
    return result
  }, [])
  return <View style={styles.evidenceGroups}>{groups.map((group) => <View key={group.kind} style={styles.evidenceGroup}>
    <AdminText textRole="caption1" style={{ color: tokens.subtleText, fontWeight: '600', textTransform: 'uppercase' }}>{copy.evidenceKinds[group.kind]}</AdminText>
    <EvidenceRows items={group.items} lockedLabel={copy.locked} onOpen={onOpen} openLabel={copy.open} tokens={tokens} />
  </View>)}</View>
}

function PreparationSection({ assignedToMe, canEdit, copy, language, noteDraft, onChangeNote, onSave, preparation, saving, tokens }: {
  assignedToMe: boolean
  canEdit: boolean
  copy: typeof supportCopy.vi | typeof supportCopy.en
  language: AppLanguage
  noteDraft: string
  onChangeNote: (value: string) => void
  onSave: (input: SupportPreparationInput) => void
  preparation: AdminViewSupportPreparation
  saving: boolean
  tokens: ReturnType<typeof getCustomerThemeTokens>
}) {
  const assignedElsewhere = Boolean(preparation.assigned_to && !assignedToMe)
  return <DetailSection title={copy.sections.preparation} tokens={tokens}>
    <DetailField label={copy.fields.preparationStatus} tokens={tokens} value={preparationLabel(preparation.status, language)} />
    <DetailField label={copy.fields.assignee} tokens={tokens} value={preparation.assigned_to_name ?? (preparation.assigned_to ? copy.assigned : copy.unassigned)} />
    {!canEdit ? <AdminText textRole="footnote" style={{ color: tokens.subtleText }}>{copy.readOnly}</AdminText> : <>
      <View style={styles.actionRow}>
        {!assignedElsewhere ? <KaelButton disabled={saving} label={assignedToMe ? copy.unclaim : copy.claim} onPress={() => onSave({ assignment: assignedToMe ? 'unclaim' : 'claim' })} variant="secondary" /> : <AdminText textRole="footnote" style={{ color: tokens.subtleText }}>{copy.assignmentLocked}</AdminText>}
        <WorkspaceFilterRow label={copy.fields.preparationStatus} onSelect={(status) => onSave({ status })} options={preparationActionOptions(language)} selected={preparation.status} tokens={tokens} />
      </View>
      <View style={styles.checklist}>
        {checklistKeys.map((key) => <KaelChip
          accessibilityState={{ checked: preparation.checklist[key] }}
          key={key}
          label={copy.checklist[key]}
          onPress={() => onSave({ checklist: { [key]: !preparation.checklist[key] } })}
          variant={preparation.checklist[key] ? 'selected' : 'unselected'}
        />)}
      </View>
      <KaelTextField
        accessibilityLabel={copy.notePlaceholder}
        maxLength={1000}
        multiline
        onChangeText={onChangeNote}
        placeholder={copy.notePlaceholder}
        placeholderTextColor={tokens.subtleText}
        value={noteDraft}
      />
      <KaelButton disabled={saving || noteDraft.trim().length === 0} label={saving ? copy.saving : copy.appendNote} loading={saving} onPress={() => onSave({ note: noteDraft.trim() })} variant="primary" />
      <AdminText textRole="caption1" style={{ color: tokens.subtleText }}>{copy.appendOnly}</AdminText>
    </>}
  </DetailSection>
}

const checklistKeys: readonly (keyof AdminViewSupportChecklist)[] = [
  'opening_request_reviewed',
  'counterparty_response_reviewed_or_missing',
  'locked_evidence_reviewed',
  'job_timeline_reviewed',
  'scope_and_payment_reviewed',
  'ready_for_next_step',
]

function caseTypeLabel(value: AdminViewSupportCaseSummary['type'], language: AppLanguage) {
  return supportCopy[language].types[value]
}

function preparationLabel(value: AdminViewSupportPreparationStatus, language: AppLanguage) {
  return supportCopy[language].preparation[value]
}

function sourceStatusLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    acknowledged: ['Đã ghi nhận', 'Acknowledged'],
    admin_decided: ['Đã ghi quyết định', 'Decision recorded'],
    admin_review: ['Admin đang rà soát', 'Admin review'],
    appealed: ['Đã đề nghị xem lại', 'Appealed'],
    awaiting_counter_party: ['Chờ phản hồi bên còn lại', 'Awaiting counterparty'],
    cancelled: ['Đã hủy', 'Cancelled'],
    open: ['Đang mở', 'Open'],
    resolved: ['Đã xử lý', 'Resolved'],
    under_review: ['Đang rà soát', 'Under review'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Trạng thái đã ghi nhận' : 'Recorded status')
}

function reasonCodeLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    cancellation: ['Hủy việc', 'Cancellation'],
    changed_mind: ['Thay đổi nhu cầu', 'Changed plans'],
    high_stakes: ['Ca có mức ảnh hưởng cao', 'High-stakes case'],
    higher_pay_elsewhere: ['Thợ chọn công việc khác', 'Worker chose another job'],
    not_completed: ['Công việc chưa hoàn tất', 'Work not completed'],
    payment: ['Thanh toán', 'Payment'],
    scope: ['Phạm vi công việc', 'Work scope'],
    vehicle_breakdown_with_photo: ['Sự cố di chuyển có bằng chứng', 'Travel incident with evidence'],
    work_quality: ['Chất lượng công việc', 'Work quality'],
    worker_no_show_after_acceptance: ['Thợ không đến sau khi nhận việc', 'Worker no-show after acceptance'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Lý do nghiệp vụ đã ghi nhận' : 'Recorded operational reason')
}

function partyRoleLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    actor: ['Bên liên quan', 'Related party'],
    admin: ['Quản trị viên', 'Administrator'],
    counterparty: ['Bên còn lại', 'Counterparty'],
    customer: ['Khách hàng', 'Customer'],
    worker: ['Thợ', 'Worker'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Bên liên quan' : 'Related party')
}

function abuseSignalLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    customer_dispute_rate_threshold: ['Tần suất tranh chấp phía khách đã chạm ngưỡng rà soát', 'Customer dispute frequency reached the review threshold'],
    same_party_repeat_threshold: ['Hai bên đã phát sinh tranh chấp lặp lại', 'Repeated disputes between the same parties'],
    worker_dispute_rate_threshold: ['Tần suất tranh chấp phía thợ đã chạm ngưỡng rà soát', 'Worker dispute frequency reached the review threshold'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Tín hiệu hệ thống cần rà soát' : 'System signal requiring review')
}

function priorityColor(priority: AdminViewSupportCaseSummary['priority'], tokens: ReturnType<typeof getCustomerThemeTokens>) {
  if (priority === 'critical') return tokens.danger
  if (priority === 'high') return tokens.copper
  return tokens.muted
}

function formatDate(value: string, language: AppLanguage) {
  return formatAdminDateTime(value, language, 'short')
}

function formatUnknown(value: unknown, language: AppLanguage) {
  if (typeof value === 'number') return formatAdminNumber(value, language)
  if (typeof value === 'boolean') return value ? (language === 'vi' ? 'Có' : 'Yes') : (language === 'vi' ? 'Không' : 'No')
  if (typeof value === 'string') return value
  return language === 'vi' ? 'Được ghi nhận trong quyết định' : 'Recorded in the decision'
}

function formatDecisionValue(key: string, value: unknown, language: AppLanguage) {
  if (typeof value === 'number' && key.includes('amount_vnd')) {
    return formatAdminVnd(value, language)
  }
  return formatUnknown(value, language)
}

function decisionFieldLabel(key: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    financial_execution_confirmed: ['Đã xác nhận thực thi tài chính', 'Financial execution confirmed'],
    outcome: ['Kết quả ghi nhận', 'Recorded outcome'],
    reasoning: ['Lý do ghi nhận', 'Recorded reasoning'],
    recorded_refund_amount_vnd: ['Số tiền hoàn được ghi nhận', 'Recorded refund amount'],
    recorded_worker_credit_amount_vnd: ['Khoản ghi có cho thợ được ghi nhận', 'Recorded worker credit'],
  }
  return labels[key]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Thông tin quyết định' : 'Decision information')
}

function evidenceLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    locked_chat: ['Tin nhắn đã khóa', 'Locked chat reference'],
    locked_kael_artifact: ['Phân tích Kael đã khóa', 'Locked Kael analysis'],
    locked_photo: ['Ảnh đã khóa', 'Locked photo'],
    locked_scope_change: ['Đổi phạm vi đã khóa', 'Locked scope change'],
    locked_snapshot: ['Evidence snapshot bất biến', 'Immutable evidence snapshot'],
    scope_change: ['Bằng chứng đổi phạm vi', 'Scope-change evidence'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Bằng chứng công việc' : 'Job evidence')
}

function supportTimelineLabel(key: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    case_opened: ['Ca hỗ trợ được mở', 'Support case opened'],
    case_updated: ['Ca hỗ trợ được cập nhật', 'Support case updated'],
    chat: ['Tin nhắn liên quan', 'Related chat message'],
    job_created: ['Công việc được tạo', 'Job created'],
    scope_change: ['Yêu cầu đổi phạm vi', 'Scope change request'],
    worker_arrived: ['Thợ đã đến', 'Worker arrived'],
    worker_matched: ['Đã ghép thợ', 'Worker matched'],
    job_paid: ['Thanh toán được ghi nhận', 'Payment recorded'],
    payment_status: ['Trạng thái thanh toán được cập nhật', 'Payment status updated'],
  }
  return labels[key]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Sự kiện công việc đã ghi nhận' : 'Recorded job event')
}

function supportTypeOptions(language: AppLanguage) {
  const copy = supportCopy[language]
  return [
    { label: copy.all, value: 'all' as const },
    { label: copy.types.dispute, value: 'dispute' as const },
    ...ADMIN_VIEW_SUPPORT_QUEUE_TYPES.map((value) => ({ label: copy.types[value], value })),
  ]
}

function priorityOptions(language: AppLanguage) {
  const copy = supportCopy[language]
  return [{ label: copy.all, value: 'all' as const }, ...(['low', 'medium', 'high', 'critical'] as const).map((value) => ({ label: copy.priorities[value], value }))]
}

function preparationOptions(language: AppLanguage) {
  const copy = supportCopy[language]
  return [{ label: copy.all, value: 'all' as const }, ...(['new', 'acknowledged', 'in_review', 'ready'] as const).map((value) => ({ label: copy.preparation[value], value }))]
}

function preparationActionOptions(language: AppLanguage): readonly { label: string; value: AdminViewSupportPreparationStatus }[] {
  const copy = supportCopy[language]
  return (['new', 'acknowledged', 'in_review', 'ready'] as const).map((value) => ({ label: copy.preparation[value], value }))
}

function assigneeOptions(language: AppLanguage) {
  const copy = supportCopy[language]
  return [
    { label: copy.all, value: 'all' as const },
    { label: copy.unassigned, value: 'unassigned' as const },
    { label: copy.mine, value: 'mine' as const },
  ]
}

function sourceStatusOptions(language: AppLanguage) {
  return [
    { label: supportCopy[language].all, value: 'all' as const },
    { label: language === 'vi' ? 'Đang mở' : 'Open', value: 'open' as const },
    { label: language === 'vi' ? 'Đã ghi nhận' : 'Acknowledged', value: 'acknowledged' as const },
    { label: language === 'vi' ? 'Đã xử lý' : 'Resolved', value: 'resolved' as const },
    { label: language === 'vi' ? 'Đã hủy' : 'Cancelled', value: 'cancelled' as const },
  ]
}

function serviceOptions(language: AppLanguage) {
  return [{ label: supportCopy[language].all, value: 'all' as const }, ...SERVICE_TYPES.map((value) => ({ label: serviceNames[language][value], value }))]
}

const serviceNames: Record<AppLanguage, Record<ServiceType, string>> = {
  vi: { cleaning: 'Vệ sinh nhà', electrical: 'Điện', handyman: 'Sửa chữa nhỏ', hvac: 'Điều hòa', plumbing: 'Nước', upholstery: 'Nội thất mềm' },
  en: { cleaning: 'Home cleaning', electrical: 'Electrical', handyman: 'Handyman', hvac: 'Air conditioning', plumbing: 'Plumbing', upholstery: 'Upholstery care' },
}

const supportCopy = {
  vi: {
    all: 'Tất cả', appendNote: 'Thêm ghi chú', appendOnly: 'Ghi chú đã lưu không thể sửa hoặc xóa.', assigned: 'Đã có người nhận', assignmentLocked: 'Ca đang do quản trị viên khác nhận xử lý.', back: 'Quay lại danh sách', claim: 'Nhận xử lý', decisionDisclaimer: 'Khoản hoàn tiền được phê duyệt là nghĩa vụ cần xử lý, không phải bằng chứng đã chuyển tiền. Xem tình trạng đối soát trong mục Tài chính.', detailLoading: 'Đang tải hồ sơ hỗ trợ…', empty: 'Không có ca hỗ trợ phù hợp.', evidenceError: 'Không thể mở bằng chứng.', generated: 'Dữ liệu tạo lúc', loadMore: 'Tải thêm', loading: 'Đang tải ca hỗ trợ…', locked: 'Đã khóa', mine: 'Tôi đang nhận', noEvidence: 'Chưa có bản chụp bằng chứng được ghi nhận.', noNotes: 'Chưa có ghi chú nội bộ.', noSignals: 'Không có tín hiệu tham khảo được ghi nhận.', notRecorded: 'Chưa ghi nhận', notePlaceholder: 'Ghi chú nội bộ mới (tối đa 1.000 ký tự)', open: 'Mở', readOnly: 'Bạn có quyền xem nhưng chưa được cấp quyền chuẩn bị hồ sơ.', refresh: 'Tải lại', retry: 'Thử lại', saving: 'Đang lưu…', select: 'Chọn một ca để xem hồ sơ chi tiết.', signalDisclaimer: 'Các tín hiệu này chỉ hỗ trợ rà soát, không phải kết luận tự động.', unassigned: 'Chưa có người nhận', unclaim: 'Bỏ nhận',
    filters: { assignee: 'Người nhận', preparation: 'Chuẩn bị hồ sơ', priority: 'Ưu tiên', service: 'Dịch vụ', sourceStatus: 'Trạng thái nguồn', type: 'Loại ca' },
    metrics: { cancellation: 'Ca hủy việc', noShow: 'Thợ không đến', total: 'Đang hiển thị' },
    priorities: { critical: 'Khẩn cấp', high: 'Cao', low: 'Thấp', medium: 'Trung bình' },
    preparation: { acknowledged: 'Đã ghi nhận', in_review: 'Đang rà soát', new: 'Mới', ready: 'Sẵn sàng chuyển bước' },
    types: { autonomy_escalation: 'Kael cần hỗ trợ', customer_cancellation_review: 'Khách hủy việc', demanding_customer: 'Hành vi khách hàng', disintermediation_risk: 'Rủi ro giao dịch ngoài', dispute: 'Tranh chấp', worker_cancellation_review: 'Thợ hủy việc', worker_no_show: 'Thợ không đến' },
    sections: { evidence: 'Bản chụp bằng chứng', notes: 'Ghi chú nội bộ', parties: 'Các bên liên quan', preparation: 'Chuẩn bị hồ sơ nội bộ', recordedDecision: 'Quyết định đã ghi nhận', signals: 'Tín hiệu tham khảo', statements: 'Yêu cầu và phản hồi', summary: 'Tóm tắt ca', timeline: 'Dòng thời gian liên quan' },
    fields: { assignee: 'Người đang nhận', counterpartyStatement: 'Phản hồi bên còn lại', openingStatement: 'Yêu cầu bên mở', preparationStatus: 'Trạng thái chuẩn bị', priority: 'Ưu tiên', reason: 'Lý do mở ca', sourceStatus: 'Trạng thái nguồn', type: 'Loại ca' },
    checklist: { counterparty_response_reviewed_or_missing: 'Đã kiểm tra phản hồi hoặc xác nhận chưa có', job_timeline_reviewed: 'Đã đối chiếu dòng thời gian công việc', locked_evidence_reviewed: 'Đã kiểm tra bằng chứng đã khóa', opening_request_reviewed: 'Đã đọc yêu cầu bên mở', ready_for_next_step: 'Hồ sơ sẵn sàng cho bước tiếp theo', scope_and_payment_reviewed: 'Đã đối chiếu phạm vi và thanh toán' },
    evidenceKinds: { chat: 'Trao đổi', document: 'Tài liệu', photo: 'Hình ảnh', snapshot: 'Bản chụp bất biến' },
    search: 'Tìm theo mã việc hoặc mã ca',
  },
  en: {
    all: 'All', appendNote: 'Append note', appendOnly: 'Saved notes cannot be edited or deleted.', assigned: 'Assigned', assignmentLocked: 'This case is assigned to another administrator.', back: 'Back to list', claim: 'Claim case', decisionDisclaimer: 'An approved refund is an obligation to process, not proof of a transfer. Check reconciliation status in Finance.', detailLoading: 'Loading support-case detail…', empty: 'No support case matches these filters.', evidenceError: 'Unable to open evidence.', generated: 'Generated', loadMore: 'Load more', loading: 'Loading support cases…', locked: 'Locked', mine: 'Assigned to me', noEvidence: 'No immutable evidence snapshot is recorded.', noNotes: 'No internal note yet.', noSignals: 'No reference signal is recorded.', notRecorded: 'Not recorded', notePlaceholder: 'New internal note (1,000 characters maximum)', open: 'Open', readOnly: 'You can view this case but operations.triage is required to prepare it.', refresh: 'Refresh', retry: 'Retry', saving: 'Saving…', select: 'Select a case to review its details.', signalDisclaimer: 'These signals support human review and are not automatic conclusions.', unassigned: 'Unassigned', unclaim: 'Unclaim',
    filters: { assignee: 'Assignee', preparation: 'Preparation', priority: 'Priority', service: 'Service', sourceStatus: 'Source status', type: 'Case type' },
    metrics: { cancellation: 'Cancellation cases', noShow: 'Worker no-show', total: 'Shown' },
    priorities: { critical: 'Critical', high: 'High', low: 'Low', medium: 'Medium' },
    preparation: { acknowledged: 'Acknowledged', in_review: 'In review', new: 'New', ready: 'Ready for next step' },
    types: { autonomy_escalation: 'Kael escalation', customer_cancellation_review: 'Customer cancellation', demanding_customer: 'Customer conduct', disintermediation_risk: 'Disintermediation risk', dispute: 'Dispute', worker_cancellation_review: 'Worker cancellation', worker_no_show: 'Worker no-show' },
    sections: { evidence: 'Evidence snapshot', notes: 'Internal notes', parties: 'Parties', preparation: 'Internal preparation', recordedDecision: 'Recorded decision', signals: 'Reference signals', statements: 'Claim and response', summary: 'Case summary', timeline: 'Related timeline' },
    fields: { assignee: 'Assignee', counterpartyStatement: 'Counterparty response', openingStatement: 'Opening claim', preparationStatus: 'Preparation status', priority: 'Priority', reason: 'Opening reason', sourceStatus: 'Source status', type: 'Case type' },
    checklist: { counterparty_response_reviewed_or_missing: 'Checked response or confirmed it is missing', job_timeline_reviewed: 'Reviewed the job timeline', locked_evidence_reviewed: 'Reviewed locked evidence', opening_request_reviewed: 'Read the opening request', ready_for_next_step: 'Case is ready for the next step', scope_and_payment_reviewed: 'Reviewed related scope and payment' },
    evidenceKinds: { chat: 'Chat', document: 'Documents', photo: 'Photos', snapshot: 'Immutable snapshot' },
    search: 'Search by job or case ID',
  },
} as const

const styles = StyleSheet.create({
  actionRow: { gap: spacing.md },
  checklist: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailContent: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.xxxl },
  detailPane: { flex: 1, minWidth: 0 },
  detailScroll: { flex: 1 },
  evidenceGroup: { gap: spacing.xs },
  evidenceGroups: { gap: spacing.lg },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingBottom: spacing.xl },
  listHeader: { gap: spacing.lg, padding: spacing.lg },
  listPane: { flex: 1, minWidth: 0 },
  masterDetail: { flexDirection: 'row' },
  noteRow: { borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingVertical: spacing.sm },
  row: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 84, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowMain: { flex: 1, gap: spacing.xs },
  rowMeta: { alignItems: 'flex-end', gap: spacing.xs, maxWidth: '44%' },
  signalDot: { borderRadius: radius.pill, height: 8, marginTop: 5, width: 8 },
  signalRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  workspace: { flex: 1, minHeight: 0, overflow: 'hidden' },
})
