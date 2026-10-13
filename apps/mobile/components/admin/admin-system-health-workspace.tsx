import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { AppState, FlatList, Share, StyleSheet, View, type ListRenderItemInfo } from 'react-native'
import { useFocusEffect } from 'expo-router'

import { KaelTextField } from '@/components/ui/kael-primitives'
import { color, spacing } from '@/design/theme'
import type { AdminSystemHealthResponse, AdminSystemIncidentDetailResponse, AdminSystemIncidentFilters } from '@/lib/api-types/system-health'
import type { SystemHealthCheck, SystemIncidentPacket, SystemHealthStatus } from '@nestscout/shared'
import type { AdminViewActor } from '@/lib/api-types/admin'
import type { AppLanguage } from '@/lib/app-language'
import { adminControlService } from '@/lib/services'

import { FinanceChoiceChip, FinanceSecondaryButton } from './admin-finance-controls'
import {
  AdminSystemDetailHeader,
  AdminSystemDetailScroll,
  AdminSystemDivider,
  AdminSystemField,
  AdminSystemRow,
  AdminSystemState,
  AdminSystemWorkspaceLayout,
} from './admin-system-controls'
import { adminSystemStyles } from './admin-system-styles'
import { adminSystemFormatDate } from './admin-system-values'
import { AdminText } from './admin-text'

type IncidentStatusFilter = 'all' | 'open' | 'resolved'
type SeverityFilter = 'all' | 'yellow' | 'red'
type TimeFilter = '24h' | '7d' | '30d'

type HealthDataQuality = 'available' | 'partial' | 'unavailable'
const HEALTH_EVIDENCE_MAX_AGE_MS = 180_000

type HealthWorkspaceState = {
  health: AdminSystemHealthResponse | null
  incidents: SystemIncidentPacket[]
  loaded: boolean
  dataQuality: HealthDataQuality
  loading: boolean
  healthError: string | null
  incidentsError: string | null
  selectedId: string | null
  detail: AdminSystemIncidentDetailResponse | null
  detailLoading: boolean
  detailError: string | null
  status: IncidentStatusFilter
  severity: SeverityFilter
  component: string
  period: TimeFilter
  releaseId: string
  buildId: string
  filterAnchor: number
  now: number
}

type HealthWorkspaceAction =
  | { type: 'loadStarted' }
  | { type: 'healthSucceeded'; health: AdminSystemHealthResponse; now: number }
  | { type: 'healthFailed'; message: string }
  | { type: 'incidentsSucceeded'; incidents: SystemIncidentPacket[]; dataQuality: HealthDataQuality }
  | { type: 'incidentsFailed'; message: string }
  | { type: 'loadFinished' }
  | { type: 'clockAdvanced'; now: number }
  | { type: 'detailReset' }
  | { type: 'detailStarted' }
  | { type: 'detailSucceeded'; detail: AdminSystemIncidentDetailResponse }
  | { type: 'detailFailed'; message: string }
  | { type: 'detailExportFailed'; message: string }
  | { type: 'incidentSelected'; id: string | null }
  | { type: 'statusFilterChanged'; value: IncidentStatusFilter }
  | { type: 'severityFilterChanged'; value: SeverityFilter }
  | { type: 'componentFilterChanged'; value: string }
  | { type: 'periodChanged'; value: TimeFilter; filterAnchor: number }
  | { type: 'releaseFilterChanged'; value: string }
  | { type: 'buildFilterChanged'; value: string }

function createHealthWorkspaceState(): HealthWorkspaceState {
  return {
    health: null, incidents: [], loaded: false, dataQuality: 'unavailable', loading: true,
    healthError: null, incidentsError: null, selectedId: null, detail: null, detailLoading: false, detailError: null,
    status: 'open', severity: 'all', component: 'all', period: '7d', releaseId: '', buildId: '',
    filterAnchor: Date.now(), now: 0,
  }
}

function healthWorkspaceReducer(state: HealthWorkspaceState, action: HealthWorkspaceAction): HealthWorkspaceState {
  switch (action.type) {
    case 'loadStarted': {
      const hasData = state.health !== null || state.loaded
      return { ...state, loading: !hasData }
    }
    case 'healthSucceeded':
      return { ...state, health: action.health, loaded: true, healthError: null, now: action.now }
    case 'healthFailed':
      return { ...state, healthError: action.message }
    case 'incidentsSucceeded':
      return { ...state, incidents: action.incidents, dataQuality: action.dataQuality, loaded: true, incidentsError: null }
    case 'incidentsFailed':
      return { ...state, incidentsError: action.message, dataQuality: state.loaded ? 'partial' : 'unavailable' }
    case 'loadFinished':
      return { ...state, loading: false }
    case 'clockAdvanced':
      return { ...state, now: action.now }
    case 'detailReset':
      return { ...state, detail: null, detailLoading: false, detailError: null }
    case 'detailStarted':
      return { ...state, detailLoading: true, detailError: null }
    case 'detailSucceeded':
      return { ...state, detail: action.detail, detailLoading: false }
    case 'detailFailed':
      return { ...state, detailError: action.message, detailLoading: false }
    case 'detailExportFailed':
      return { ...state, detailError: action.message }
    case 'incidentSelected':
      return { ...state, selectedId: action.id }
    case 'statusFilterChanged':
      return { ...state, selectedId: null, status: action.value }
    case 'severityFilterChanged':
      return { ...state, severity: action.value }
    case 'componentFilterChanged':
      return { ...state, component: action.value }
    case 'periodChanged':
      return { ...state, period: action.value, filterAnchor: action.filterAnchor }
    case 'releaseFilterChanged':
      return { ...state, releaseId: action.value }
    case 'buildFilterChanged':
      return { ...state, buildId: action.value }
  }
}

export function AdminSystemHealthWorkspace({ actor, language }: { actor: AdminViewActor; language: AppLanguage }) {
  const labels = copy[language]
  const [state, dispatch] = useReducer(healthWorkspaceReducer, undefined, createHealthWorkspaceState)
  const {
    health, incidents, loaded, dataQuality, loading, healthError, incidentsError, selectedId, detail,
    detailLoading, detailError, status, severity, component, period, releaseId, buildId, filterAnchor, now,
  } = state
  const detailSequence = useRef(0)
  const loadSequence = useRef(0)
  const loadLock = useRef(false)
  const pendingLoad = useRef<(() => void) | null>(null)
  const reloadRef = useRef<(() => void) | null>(null)
  const hasData = health !== null || loaded

  useEffect(() => {
    const snapshot = health?.snapshot
    if (!snapshot || !now) return

    const deadlines = [Date.parse(snapshot.expires_at)]
    for (const check of snapshot.checks) {
      if (!check.observed_at) continue
      const observedAt = Date.parse(check.observed_at)
      if (Number.isFinite(observedAt) && observedAt <= now) deadlines.push(observedAt + HEALTH_EVIDENCE_MAX_AGE_MS + 1)
    }
    const futureDeadlines = deadlines.filter((deadline) => Number.isFinite(deadline) && deadline > now)
    if (futureDeadlines.length === 0) return
    const nextDeadline = Math.min(...futureDeadlines)

    // Refresh the displayed clock at evidence expiry even when the next API poll fails.
    const timer = setTimeout(() => dispatch({ type: 'clockAdvanced', now: Date.now() }), Math.max(0, nextDeadline - Date.now()))
    return () => clearTimeout(timer)
  }, [health, now])

  const filters = useMemo<AdminSystemIncidentFilters>(() => ({
    component,
    status,
    severity,
    from: new Date(filterAnchor - ({ '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }[period]) * 60 * 60 * 1000).toISOString(),
    release_id: releaseId.trim() || undefined,
    build_id: buildId.trim() || undefined,
    limit: 50,
  }), [buildId, component, filterAnchor, period, releaseId, severity, status])
  useFocusEffect(useCallback(() => {
    let focused = true
    // A focused route can mount before React Native publishes its first AppState.
    // Treat only explicit inactive/background states as paused so the initial read is not lost.
    let foreground = AppState.currentState !== 'background' && AppState.currentState !== 'inactive'
    let timer: ReturnType<typeof setInterval> | null = null
    loadSequence.current += 1
    const clearTimer = () => { if (timer) clearInterval(timer); timer = null }
    const load = () => {
      if (!focused || !foreground) return
      if (loadLock.current) { pendingLoad.current = load; return }
      loadLock.current = true
      const requestSequence = loadSequence.current
      dispatch({ type: 'loadStarted' })
      void Promise.allSettled([
        adminControlService.getSystemHealth(),
        adminControlService.listSystemIncidents(filters),
      ]).then(([healthSettled, incidentSettled]) => {
        if (!focused || requestSequence !== loadSequence.current) return
        if (healthSettled.status === 'fulfilled' && healthSettled.value.success) {
          dispatch({ type: 'healthSucceeded', health: healthSettled.value.data, now: Date.now() })
        } else {
          dispatch({ type: 'healthFailed', message: labels.loadError })
        }
        if (incidentSettled.status === 'fulfilled' && incidentSettled.value.success) {
          dispatch({ type: 'incidentsSucceeded', incidents: incidentSettled.value.data.records, dataQuality: incidentSettled.value.data.data_quality })
        } else {
          dispatch({ type: 'incidentsFailed', message: labels.loadError })
        }
      }).finally(() => {
        loadLock.current = false
        if (focused && requestSequence === loadSequence.current) {
          dispatch({ type: 'loadFinished' })
        }
        const next = pendingLoad.current
        pendingLoad.current = null
        if (next) setTimeout(next, 0)
      })
    }
    reloadRef.current = load
    const startPolling = () => {
      clearTimer()
      timer = setInterval(load, 60_000)
    }
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      foreground = state === 'active'
      if (foreground) { startPolling(); load() } else clearTimer()
    })
    if (foreground) startPolling()
    load()
    return () => {
      focused = false
      loadSequence.current += 1
      clearTimer()
      appStateSubscription.remove()
      if (reloadRef.current === load) reloadRef.current = null
    }
  }, [filters, labels.loadError]))

  useFocusEffect(useCallback(() => {
    if (actor.access_level !== 'owner') return
    let focused = true
    void adminControlService.refreshSystemHealth()
      .catch(() => undefined)
      .finally(() => { if (focused) reloadRef.current?.() })
    return () => { focused = false }
  }, [actor.access_level]))

  useFocusEffect(useCallback(() => {
    if (!selectedId) { dispatch({ type: 'detailReset' }); return }
    let focused = true
    const sequence = ++detailSequence.current
    dispatch({ type: 'detailStarted' })
    void adminControlService.getSystemIncident(selectedId).then((result) => {
      if (!result.success) throw new Error('SYSTEM_INCIDENT_LOAD_FAILED')
      if (focused && sequence === detailSequence.current) dispatch({ type: 'detailSucceeded', detail: result.data })
    }).catch(() => {
      if (focused && sequence === detailSequence.current) dispatch({ type: 'detailFailed', message: labels.detailError })
    })
    return () => { focused = false; detailSequence.current += 1 }
  }, [labels.detailError, selectedId]))

  const selectIncident = useCallback((id: string) => dispatch({ type: 'incidentSelected', id }), [])
  const selectPeriod = useCallback((value: string) => dispatch({ type: 'periodChanged', value: value as TimeFilter, filterAnchor: Date.now() }), [])
  const row = useCallback(({ item }: ListRenderItemInfo<SystemIncidentPacket>) => <AdminSystemRow
    accessibilityLabel={`${item.component}. ${incidentStatusLabel(item, language)}. ${severityLabel(item.severity, language)}. ${reasonLabel(item.reason_code, language)}`}
    aside={`${severityLabel(item.severity, language)} · ${incidentStatusLabel(item, language)}`}
    id={item.incident_id}
    meta={`${checkLabel(item.detector, language)} · ${adminSystemFormatDate(item.updated_at, language)} · ${item.release_id ?? labels.releaseMissing}`}
    onPress={selectIncident}
    selected={selectedId === item.incident_id}
    title={`${componentLabel(item.component, language)} · ${reasonLabel(item.reason_code, language)}`}
  />, [labels.releaseMissing, language, selectIncident, selectedId])

  const snapshot = health?.snapshot ?? null
  const expired = snapshot ? !Number.isFinite(Date.parse(snapshot.expires_at)) || Date.parse(snapshot.expires_at) <= now : true
  const overall = effectiveOverallStatus(snapshot, now)
  const listHeader = <View style={styles.header}>
    <View accessibilityLabel={`${labels.overall}: ${statusLabel(overall, language)}`} style={styles.statusPanel}>
      <StatusMark status={overall} language={language} />
      <View style={styles.statusText}>
        <AdminText textRole="headline" style={styles.strong}>{labels.overall}: {statusLabel(overall, language)}</AdminText>
        <AdminText textRole="footnote" style={styles.secondary}>{snapshot ? `${labels.checkedAt} ${adminSystemFormatDate(snapshot.completed_at, language)} · ${expired ? labels.expired : labels.expiresAt + ' ' + adminSystemFormatDate(snapshot.expires_at, language)}` : labels.noSnapshot}</AdminText>
      </View>
    </View>
    {healthError ? <AdminSystemState compact label={healthError} /> : null}
    {snapshot ? <View style={styles.checks}>
      {snapshot.checks.map((check) => <HealthCheckRow check={check} key={check.check_id} language={language} now={now} />)}
    </View> : null}
    {snapshot?.schema_version === 2 ? snapshot.coverage_gaps.map((gap) => <View accessibilityLabel={coverageGapLabel(gap, language)} key={gap} style={styles.coverageGap}>
      <StatusMark status="gray" language={language} />
      <AdminText textRole="caption1" style={styles.secondary}>{coverageGapLabel(gap, language)}</AdminText>
    </View>) : snapshot ? <View accessibilityLabel={coverageGapLabel('profile-coverage-unsupported', language)} style={styles.coverageGap}>
      <StatusMark status="gray" language={language} />
      <AdminText textRole="caption1" style={styles.secondary}>{coverageGapLabel('profile-coverage-unsupported', language)}</AdminText>
    </View> : null}
    {health?.observer ? <View style={styles.observer}>
      <AdminText textRole="headline" style={styles.strong}>{labels.observer}</AdminText>
      <AdminSystemField label={labels.observerHeartbeat} value={adminSystemFormatDate(health.observer.observer_heartbeat_at, language)} />
      <AdminSystemField label={labels.dispatcher} value={statusLabel(health.observer.dispatcher_status, language)} />
      <AdminSystemField label={labels.d1} value={statusLabel(health.observer.d1_status, language)} />
      {health.observer.last_error_code ? <AdminSystemField label={labels.lastSafeError} value={health.observer.last_error_code} /> : null}
    </View> : null}
    {loading && !hasData ? <AdminSystemState label={labels.loading} loading /> : null}
    <View style={styles.sectionHeading}>
      <AdminText accessibilityRole="header" textRole="headline" style={styles.strong}>{labels.incidents}</AdminText>
      <AdminText textRole="caption1" style={styles.secondary}>{qualityLabel(dataQuality, language)} · {incidents.length} {labels.records}</AdminText>
    </View>
    {incidentsError ? <AdminSystemState compact label={incidentsError} /> : null}
    <View style={styles.filterGroup}>
      <FilterRow label={labels.status} values={['all', 'open', 'resolved']} selected={status} language={language} onSelect={(value) => dispatch({ type: 'statusFilterChanged', value: value as IncidentStatusFilter })} />
      <FilterRow label={labels.severity} values={['all', 'yellow', 'red']} selected={severity} language={language} onSelect={(value) => dispatch({ type: 'severityFilterChanged', value: value as SeverityFilter })} />
      <FilterRow label={labels.component} values={['all', 'backend', 'kael', 'app', 'observer']} selected={component} language={language} onSelect={(value) => dispatch({ type: 'componentFilterChanged', value })} />
      <FilterRow label={labels.timeRange} values={['24h', '7d', '30d']} selected={period} language={language} onSelect={selectPeriod} />
    </View>
    <View style={styles.filterGroup}>
      <AdminText textRole="caption1" style={styles.secondary}>{labels.releaseFilter}</AdminText>
      <AdminTextInput accessibilityLabel={labels.releaseFilter} onChangeText={(value) => dispatch({ type: 'releaseFilterChanged', value })} value={releaseId} />
      <AdminText textRole="caption1" style={styles.secondary}>{labels.buildFilter}</AdminText>
      <AdminTextInput accessibilityLabel={labels.buildFilter} onChangeText={(value) => dispatch({ type: 'buildFilterChanged', value })} value={buildId} />
    </View>
  </View>
  const list = <FlatList
    contentContainerStyle={adminSystemStyles.listContent}
    data={incidents}
    keyExtractor={(item) => item.incident_id}
    ListEmptyComponent={loading && !hasData ? null : <AdminSystemState compact label={incidentsError && incidents.length === 0 ? labels.noDataAfterError : labels.noIncidents} />}
    ListHeaderComponent={listHeader}
    renderItem={row}
    showsVerticalScrollIndicator={false}
    style={adminSystemStyles.list}
    testID="admin-system-health-incidents"
  />
  const onBack = useCallback(() => dispatch({ type: 'incidentSelected', id: null }), [])
  const onExport = useCallback(async () => {
    if (!selectedId) return
    try {
      const result = await adminControlService.exportSystemIncident(selectedId)
      if (!result.success) throw new Error('SYSTEM_INCIDENT_EXPORT_FAILED')
      await Share.share({ message: JSON.stringify(result.data, null, 2), title: labels.exportTitle })
    } catch { dispatch({ type: 'detailExportFailed', message: labels.exportError }) }
  }, [labels.exportError, labels.exportTitle, selectedId])
  const detailNode = useMemo(() => <IncidentDetail detail={detail} error={detailError} language={language} loading={detailLoading} onBack={onBack} onExport={onExport} />, [detail, detailError, detailLoading, language, onBack, onExport])
  return <AdminSystemWorkspaceLayout detail={detailNode} emptyDetailLabel={labels.chooseIncident} list={list} selected={Boolean(selectedId)} />
}

function HealthCheckRow({ check, language, now }: { check: SystemHealthCheck; language: AppLanguage; now: number }) {
  const stale = isSystemHealthCheckStale(check, now)
  const status: SystemHealthStatus = stale ? 'gray' : check.status
  const labels = copy[language]
  return <View accessibilityLabel={`${componentLabel(check.component, language)}: ${statusLabel(status, language)}. ${reasonLabel(check.reason_code, language)}`} style={styles.checkRow} testID={`admin-system-health-check-${check.check_id}`}>
    <StatusMark status={status} language={language} />
    <View style={styles.checkText}>
      <AdminText textRole="subheadline" style={styles.strong}>{checkLabel(check.check_id, language)}</AdminText>
      <AdminText textRole="caption1" style={styles.secondary}>{stale && check.observed_at ? `${labels.evidenceStale}: ${reasonLabel(check.reason_code, language)}` : reasonLabel(check.reason_code, language)} · {check.sample_count === null ? labels.sampleMissing : `${check.sample_count} ${labels.samples}`}</AdminText>
    </View>
    <AdminText textRole="caption1" style={styles.meta}>{statusLabel(status, language)}</AdminText>
  </View>
}

function isSystemHealthCheckStale(check: SystemHealthCheck, now: number) {
  const observedAt = check.observed_at ? Date.parse(check.observed_at) : Number.NaN
  return !Number.isFinite(observedAt) || observedAt > now || now - observedAt > HEALTH_EVIDENCE_MAX_AGE_MS
}

function effectiveOverallStatus(snapshot: NonNullable<AdminSystemHealthResponse['snapshot']> | null, now: number): SystemHealthStatus {
  if (!snapshot) return 'gray'
  if (snapshot.schema_version !== 2) return 'gray'

  const expiresAt = Date.parse(snapshot.expires_at)
  const snapshotStale = !Number.isFinite(expiresAt) || expiresAt <= now
  const checkEvidenceStale = snapshot.checks.some((check) => isSystemHealthCheckStale(check, now))
  const observedIds = new Set(snapshot.checks.map((check) => check.check_id))
  const missingRequired = snapshot.required_check_ids.some((checkId) => !observedIds.has(checkId))
  if (snapshotStale || checkEvidenceStale || missingRequired) return 'gray'
  return snapshot.overall_status
}

function coverageGapLabel(source: string, language: AppLanguage) {
  const vi = source === 'app-crash' ? 'Chưa bật theo dõi crash' : source === 'push-notifications' ? 'Chưa bật thông báo đẩy' : 'Chưa xác định đầy đủ độ phủ hệ thống'
  const en = source === 'app-crash' ? 'Crash monitoring is not enabled' : source === 'push-notifications' ? 'Push notifications are not enabled' : 'System coverage is not fully identified'
  return language === 'vi' ? vi : en
}

function IncidentDetail({ detail, error, language, loading, onBack, onExport }: {
  detail: AdminSystemIncidentDetailResponse | null
  error: string | null
  language: AppLanguage
  loading: boolean
  onBack: () => void
  onExport: () => void
}) {
  const labels = copy[language]
  const packet = detail?.record
  if (loading && !packet) return <AdminSystemState label={labels.detailLoading} loading />
  if (error && !packet) return <AdminSystemState actionLabel={labels.back} label={error} onAction={onBack} />
  if (!packet || !detail) return <AdminSystemState label={labels.chooseIncident} />
  return <AdminSystemDetailScroll>
    <AdminSystemDetailHeader language={language} onBack={onBack} subtitle={`${packet.incident_id} · ${componentLabel(packet.component, language)}`} title={labels.incidentDetail} />
    <StatusMark status={packet.severity} language={language} />
    <AdminSystemField label={labels.status} value={incidentStatusLabel(packet, language)} />
    <AdminSystemField label={labels.severity} value={severityLabel(packet.severity, language)} />
    <AdminSystemField label={labels.reason} value={reasonLabel(packet.reason_code, language)} />
    <AdminSystemField label={labels.detector} value={checkLabel(packet.detector, language)} />
    <AdminSystemField label={labels.fingerprint} value={packet.fingerprint} />
    <AdminSystemDivider />
    <AdminSystemField label={labels.openedAt} value={adminSystemFormatDate(packet.opened_at, language)} />
    <AdminSystemField label={labels.updatedAt} value={adminSystemFormatDate(packet.updated_at, language)} />
    {packet.resolved_at ? <AdminSystemField label={packet.reason_code === 'SOURCE_DEFERRED_BY_PROFILE' ? labels.closedAt : labels.resolvedAt} value={adminSystemFormatDate(packet.resolved_at, language)} /> : null}
    <AdminSystemDivider />
    <AdminSystemField label={labels.release} value={packet.release_id ?? labels.notRecorded} />
    <AdminSystemField label={labels.build} value={packet.build_id ?? labels.notRecorded} />
    <AdminSystemField label={labels.platform} value={packet.platform ?? labels.notRecorded} />
    <AdminSystemField label={labels.route} value={packet.route_kind ?? labels.notRecorded} />
    <AdminSystemField label={labels.stage} value={packet.stage ?? labels.notRecorded} />
    <AdminSystemField label={labels.trace} value={packet.trace_id ?? labels.notRecorded} />
    <AdminSystemField label={labels.run} value={packet.run_id ?? labels.notRecorded} />
    <AdminSystemField label={labels.request} value={packet.request_id ?? labels.notRecorded} />
    <AdminSystemField label={labels.supportCode} value={packet.support_code ?? labels.notRecorded} />
    <View style={styles.detailSection}>
      <AdminText accessibilityRole="header" textRole="headline" style={styles.strong}>{labels.timeline}</AdminText>
      <AdminSystemDivider />
      {detail.history.map((event) => <AdminSystemField key={`${event.event}:${event.at}`} label={historyEventLabel(event.event, event.reason_code, language)} value={`${adminSystemFormatDate(event.at, language)} · ${reasonLabel(event.reason_code, language)}`} />)}
    </View>
    <AdminText textRole="footnote" style={styles.secondary}>{packet.evidence_limit}</AdminText>
    <FinanceSecondaryButton label={labels.exportPacket} onPress={() => { void onExport() }} />
    {error ? <AdminSystemState compact label={error} /> : null}
  </AdminSystemDetailScroll>
}

function FilterRow({ label, language, onSelect, selected, values }: { label: string; language: AppLanguage; onSelect: (value: string) => void; selected: string; values: readonly string[] }) {
  return <View style={styles.filterRow}>
    <AdminText textRole="caption1" style={styles.secondary}>{label}</AdminText>
    <View style={adminSystemStyles.filterRow}>{values.map((value) => <FinanceChoiceChip key={value} label={filterLabel(value, language)} onPress={() => onSelect(value)} selected={selected === value} />)}</View>
  </View>
}

function AdminTextInput({ accessibilityLabel, onChangeText, value }: { accessibilityLabel: string; onChangeText: (value: string) => void; value: string }) {
  return <KaelTextField accessibilityLabel={accessibilityLabel} autoCapitalize="none" onChangeText={onChangeText} value={value} />
}

const STATUS_SYMBOLS: Record<SystemHealthStatus, string> = { green: '✓', yellow: '!', red: '×', gray: '—' }

function StatusMark({ language, status }: { language: AppLanguage; status: SystemHealthStatus }) {
  return <View accessibilityLabel={statusLabel(status, language)} style={[styles.statusMark, styles[`status_${status}`]]}>
    <AdminText textRole="headline" style={styles.statusSymbol}>{STATUS_SYMBOLS[status]}</AdminText>
    <AdminText textRole="caption1" style={styles.statusLabel}>{statusLabel(status, language)}</AdminText>
  </View>
}

function statusLabel(status: string, language: AppLanguage) { return copy[language].statusValue[status as SystemHealthStatus] ?? copy[language].statusValue.gray }
function incidentStatusLabel(packet: SystemIncidentPacket, language: AppLanguage) {
  if (packet.status === 'resolved' && packet.reason_code === 'SOURCE_DEFERRED_BY_PROFILE') return copy[language].closedByConfiguration
  return statusLabel(packet.status, language)
}
function historyEventLabel(event: 'opened' | 'updated' | 'resolved', reasonCode: string, language: AppLanguage) {
  if (event === 'resolved' && reasonCode === 'SOURCE_DEFERRED_BY_PROFILE') return copy[language].closedByConfiguration
  return copy[language].historyEvent[event]
}
function severityLabel(severity: 'yellow' | 'red', language: AppLanguage) { return copy[language].severityValue[severity] }
function componentLabel(component: string, language: AppLanguage) { return (copy[language].componentValue as Record<string, string>)[component] ?? (language === 'vi' ? 'Thành phần hệ thống' : 'System component') }
function checkLabel(checkId: string, language: AppLanguage) { return (copy[language].checkValue as Record<string, string>)[checkId] ?? copy[language].unknownCheck }
function reasonLabel(reason: string, language: AppLanguage) {
  const suffix = /_(FIRST_SAMPLE|RECOVERY_PENDING)$/u.exec(reason)?.[1]
  const baseReason = suffix ? reason.slice(0, -suffix.length - 1) : reason
  const translated = copy[language].reasonValue[baseReason]
  if (translated && suffix === 'FIRST_SAMPLE') return language === 'vi' ? `${translated} (lần kiểm tra đầu)` : `${translated} (first check)`
  if (translated && suffix === 'RECOVERY_PENDING') return language === 'vi' ? `${translated} (đang chờ xác nhận phục hồi)` : `${translated} (recovery pending)`
  return translated ?? `${copy[language].reasonCode} ${reason}`
}
function filterLabel(value: string, language: AppLanguage) { return (copy[language].filterValue as Record<string, string>)[value] ?? (copy[language].componentValue as Record<string, string>)[value] ?? value }
function qualityLabel(value: 'available' | 'partial' | 'unavailable', language: AppLanguage) { return copy[language].qualityValue[value] }

const reasonTranslations: Record<string, readonly [string, string]> = {
  API_HTTP_5XX: ['API trả lỗi máy chủ', 'The API returned a server error'],
  API_NETWORK_ERROR: ['Không kết nối được với API', 'The API could not be reached'],
  API_OFFLINE: ['Ứng dụng đang ngoại tuyến', 'The App is offline'],
  API_REACHABLE: ['Ứng dụng kết nối được với API', 'The App can reach the API'],
  API_TIMEOUT: ['Yêu cầu tới API hết thời gian chờ', 'The API request timed out'],
  APP_ERRORS_OBSERVED: ['Có lỗi ứng dụng được ghi nhận', 'App errors were recorded'],
  AUTH_EVIDENCE_MISSING: ['Chưa có bằng chứng xác thực', 'Authentication evidence is unavailable'],
  AUTH_HEALTH_REACHABLE: ['Dịch vụ xác thực phản hồi', 'Authentication service responded'],
  AUTH_UNAVAILABLE: ['Dịch vụ xác thực không phản hồi thành công', 'Authentication service did not return success'],
  BACKEND_EVIDENCE_INCOMPLETE: ['Bằng chứng phần máy chủ chưa đầy đủ', 'Backend evidence is incomplete'],
  COLLECTOR_BUDGET_EXCEEDED: ['Bộ thu thập vượt thời gian cho phép', 'The collector exceeded its time budget'],
  CORE_HEALTHY: ['Các phép kiểm tra phần máy chủ đã đạt', 'Backend checks passed'],
  D1_CLEANUP_FAILED: ['Không dọn được dữ liệu hết hạn trong D1', 'D1 could not clean up expired data'],
  D1_READ_FAILED: ['Không đọc được trạng thái từ D1', 'D1 state could not be read'],
  D1_STATE_INIT_FAILED: ['Không khởi tạo được trạng thái trong D1', 'D1 state could not be initialized'],
  D1_STATE_MISSING: ['Chưa có trạng thái bộ giám sát trong D1', 'Observer state is missing from D1'],
  D1_UNAVAILABLE: ['Kho D1 không hoạt động', 'D1 is unavailable'],
  DATABASE_UNAVAILABLE: ['Không đọc được cơ sở dữ liệu', 'Database read failed'],
  DATABASE_EVIDENCE_MISSING: ['Chưa có bằng chứng cơ sở dữ liệu', 'Database evidence is unavailable'],
  DATABASE_READ_SUCCEEDED: ['Phép đọc cơ sở dữ liệu đã đạt', 'Database read succeeded'],
  DISPATCHER_UNAVAILABLE: ['Bộ giám sát bên ngoài không phản hồi', 'The external observer did not respond'],
  EDGE_AVAILABLE: ['Edge API đã phản hồi', 'Edge API responded'],
  EDGE_EVIDENCE_MISSING: ['Chưa có bằng chứng từ Edge API', 'Edge API evidence is unavailable'],
  EDGE_UNAVAILABLE: ['Edge API không phản hồi thành công', 'Edge API did not return success'],
  FATAL_APP_ERRORS: ['Có lỗi nghiêm trọng của ứng dụng được ghi nhận', 'Fatal App errors were recorded'],
  IO_CHECKS_HEALTHY: ['Storage và Realtime đã phản hồi khỏe mạnh', 'Storage and Realtime health checks passed'],
  IO_CHECKS_UNVERIFIED: ['Kho tệp và kết nối thời gian thực chưa được kiểm tra hoạt động', 'Storage and Realtime I/O checks are not verified'],
  INSUFFICIENT_SAMPLE: ['Chưa đủ 20 mẫu để đánh giá tỷ lệ lỗi', 'Fewer than 20 samples are available for error-rate evaluation'],
  INVALID_JSON: ['Yêu cầu chứa dữ liệu JSON không hợp lệ', 'The request contains invalid JSON'],
  INVALID_REQUEST: ['Yêu cầu không đúng định dạng cho phép', 'The request does not match the accepted format'],
  INVALID_SCHEDULED_AT: ['Thời điểm lịch chạy không hợp lệ', 'The scheduled time is invalid'],
  ERROR_RATE_ELEVATED: ['Tỷ lệ lỗi từ 5% trở lên', 'The error rate is at least 5%'],
  ERROR_RATE_HIGH: ['Tỷ lệ lỗi cao qua nhiều lần đánh giá', 'The error rate stayed high across evaluations'],
  ERROR_RATE_WITHIN_RANGE: ['Tỷ lệ lỗi dưới ngưỡng cảnh báo', 'The error rate is below the warning threshold'],
  INVALID_EVIDENCE: ['Bằng chứng không hợp lệ để tính tỷ lệ lỗi', 'Evidence is invalid for error-rate evaluation'],
  KAEL_EVIDENCE_MISSING: ['Chưa có bằng chứng Kael', 'Kael evidence is unavailable'],
  KAEL_EVIDENCE_INCOMPLETE: ['Bằng chứng Kael thiếu hoặc sai định dạng', 'Kael evidence is incomplete or malformed'],
  LEARNING_QUEUE_EVIDENCE_MISSING: ['Chưa có đủ dữ liệu về hàng đợi học tập', 'Learning queue evidence is incomplete'],
  LEARNING_QUEUE_SCHEDULE_UNAVAILABLE: ['Chưa xác minh được lịch xử lý hàng đợi học tập', 'The learning queue processing schedule is unverified'],
  LEARNING_QUEUE_STALE: ['Hàng đợi học tập quá hạn xử lý theo lịch hiện có', 'Learning queue items exceeded the configured fallback window'],
  METHOD_NOT_ALLOWED: ['Phương thức yêu cầu không được hỗ trợ', 'The request method is not supported'],
  MONITOR_CLAIM_FAILED: ['Không nhận được quyền chạy lượt giám sát', 'The monitor could not claim this run'],
  MONITOR_ENVIRONMENT_NOT_CONFIGURED: ['Môi trường giám sát chưa được cấu hình', 'The monitor environment is not configured'],
  MONITOR_NOT_CONFIGURED: ['Thiếu cấu hình cần thiết cho bộ giám sát', 'The monitor is missing required configuration'],
  MONITOR_RUN_FAILED: ['Lượt giám sát không hoàn tất', 'The monitor run did not complete'],
  NATIVE_SESSION_EVIDENCE_MISSING: ['Chưa có bằng chứng gần đây từ ứng dụng trên thiết bị', 'No recent native App session evidence'],
  NATIVE_SESSION_EVIDENCE_INCOMPLETE: ['Bằng chứng phiên ứng dụng thiếu hoặc sai định dạng', 'Native App session evidence is incomplete or malformed'],
  NATIVE_API_DEGRADED: ['Một số yêu cầu API từ ứng dụng trên thiết bị bị suy giảm', 'Some native App API requests are degraded'],
  NATIVE_API_FAILURES: ['Một số yêu cầu API từ ứng dụng trên thiết bị thất bại', 'Some native App API requests failed'],
  NATIVE_SESSIONS_CONNECTED: ['Ứng dụng trên thiết bị kết nối được với Backend', 'Native App sessions can reach the backend'],
  NO_ACTIVE_NATIVE_SESSIONS: ['Không có phiên ứng dụng trên thiết bị nào đang hoạt động', 'No active native App sessions'],
  NO_RECENT_AI_ACTIVITY: ['Chưa có lượt sử dụng Kael gần đây để làm bằng chứng', 'There is no recent real Kael activity to use as evidence'],
  NOT_FOUND: ['Không tìm thấy tài nguyên được yêu cầu', 'The requested resource was not found'],
  OBSERVER_DEGRADED: ['Bộ giám sát bên ngoài đang suy giảm', 'The external observer is degraded'],
  OBSERVER_DELIVERY_COMPLETE_REJECTED: ['Ledger không xác nhận trạng thái gửi cảnh báo', 'The delivery ledger rejected the alert result'],
  OBSERVER_DELIVERY_STATE_FAILED: ['Không lưu được trạng thái gửi cảnh báo', 'Alert delivery state could not be saved'],
  OBSERVER_HEARTBEAT_FAILED: ['Không gửi được tín hiệu từ bộ giám sát', 'Observer heartbeat could not be sent'],
  OBSERVER_HEARTBEAT_MISSING: ['Chưa nhận tín hiệu từ bộ giám sát', 'Observer heartbeat is missing'],
  OBSERVER_HEARTBEAT_STALE: ['Tín hiệu từ bộ giám sát đã quá cũ', 'Observer heartbeat is stale'],
  OBSERVER_HEARTBEAT_WRITE_FAILED: ['Không ghi được tín hiệu từ bộ giám sát', 'Observer heartbeat could not be stored'],
  OBSERVER_INCOMPLETE: ['Bộ giám sát chưa có đủ bằng chứng', 'Observer evidence is incomplete'],
  OBSERVER_NOT_CONFIGURED: ['Bộ giám sát bên ngoài chưa được cấu hình', 'The external observer is not configured'],
  OBSERVER_OK: ['Bộ giám sát bên ngoài đã hoạt động', 'The external observer is healthy'],
  OBSERVER_OR_D1_FAILED: ['Bộ giám sát hoặc kho D1 gặp lỗi', 'The observer or D1 store failed'],
  OBSERVER_OUTAGE_WRITE_FAILED: ['Không đồng bộ được sự cố giám sát', 'Observer outage could not be synchronized'],
  OBSERVER_READ_FAILED: ['Không đọc được snapshot từ Backend', 'The backend snapshot could not be read'],
  OUTBOUND_URL_REJECTED: ['Nguồn kiểm tra nằm ngoài danh sách cho phép', 'The evidence source is not allowlisted'],
  PREVIOUS_BACKEND_EVIDENCE: ['Đang giữ lại bằng chứng phần máy chủ trước đó', 'The previous backend evidence is being retained'],
  PROVIDER_CIRCUIT_OPEN: ['Mạch bảo vệ nhà cung cấp AI đang mở', 'The AI provider circuit is open'],
  RELEASE_IDENTITY_MATCHED: ['Định danh bản phát hành khớp với môi trường', 'Release identity matches the environment'],
  RELEASE_IDENTITY_MISMATCH: ['Định danh bản phát hành không khớp với môi trường', 'Release identity does not match the environment'],
  RELEASE_IDENTITY_MISSING: ['Chưa đăng ký định danh bản phát hành', 'Release identity is not registered'],
  RESPONSE_BODY_MISSING: ['Nguồn kiểm tra không trả nội dung phản hồi', 'The evidence source returned no response body'],
  RESPONSE_INVALID_JSON: ['Nguồn kiểm tra trả dữ liệu không hợp lệ', 'The evidence source returned invalid data'],
  RESPONSE_TOO_LARGE: ['Phản hồi từ nguồn kiểm tra vượt giới hạn kích thước', 'The evidence response exceeded the size limit'],
  RUN_ALREADY_CLAIMED: ['Lượt kiểm tra trong phút này đã được nhận xử lý', 'This minute’s monitor run has already been claimed'],
  STORAGE_EVIDENCE_MISSING: ['Chưa nhận được bằng chứng từ Storage', 'Storage evidence is unavailable'],
  STORAGE_HEALTH_UNVERIFIED: ['Storage chưa xác nhận trạng thái hoạt động', 'Storage did not confirm a healthy state'],
  STORAGE_HEALTHY: ['Storage đã xác nhận hoạt động', 'Storage confirmed it is healthy'],
  STORAGE_UNAVAILABLE: ['Storage không hoạt động thành công', 'Storage did not return a healthy response'],
  SNAPSHOT_CONTRACT_INVALID: ['Snapshot không khớp với contract sức khỏe hệ thống', 'Snapshot does not match the system health contract'],
  SNAPSHOT_IDENTITY_MISMATCH: ['Snapshot thuộc môi trường hoặc bản phát hành khác', 'Snapshot belongs to a different environment or release'],
  SNAPSHOT_INVALID: ['Snapshot không hợp lệ', 'Snapshot is invalid'],
  SNAPSHOT_STALE: ['Snapshot đã quá hạn', 'Snapshot is stale'],
  SNAPSHOT_VALIDATION_FAILED: ['Không xác minh được snapshot', 'Snapshot validation failed'],
  SNAPSHOT_WRITE_FAILED: ['Không lưu được snapshot', 'Snapshot could not be saved'],
  SNAPSHOT_WRITE_REJECTED: ['Backend từ chối snapshot cũ hoặc không hợp lệ', 'The backend rejected a stale or invalid snapshot'],
  SYSTEM_MONITOR_URL_NOT_ALLOWED: ['Địa chỉ nguồn giám sát không nằm trong danh sách cho phép', 'The monitor source URL is not allowlisted'],
  REALTIME_EVIDENCE_MISSING: ['Chưa nhận được bằng chứng từ Realtime', 'Realtime evidence is unavailable'],
  REALTIME_HEALTHY: ['Dịch vụ Realtime đã phản hồi', 'Realtime health endpoint responded'],
  REALTIME_UNAVAILABLE: ['Dịch vụ Realtime không phản hồi thành công', 'Realtime health endpoint did not return success'],
  SUPABASE_READ_FAILED: ['Không đọc được dữ liệu Supabase', 'Supabase data could not be read'],
  SUPABASE_UNAVAILABLE: ['Supabase không phản hồi', 'Supabase is unavailable'],
  UNAUTHORIZED: ['Yêu cầu giám sát không được xác thực', 'The monitor request is not authenticated'],
  UNKNOWN: ['Nguyên nhân chưa được phân loại', 'The reason has not been classified'],
  WORKER_EVIDENCE_MISSING: ['Chưa có bằng chứng hoàn tất worker', 'Worker completion evidence is missing'],
  WORKER_EVIDENCE_INCOMPLETE: ['Bằng chứng cấu hình lịch worker thiếu hoặc sai định dạng', 'Worker schedule configuration evidence is incomplete or malformed'],
  WORKER_FAILED: ['Có worker được ghi nhận thất bại', 'A worker execution failed'],
  WORKER_LATE: ['Worker chạy trễ', 'A worker execution is late'],
  WORKER_NOT_OBSERVED: ['Chưa ghi nhận lần chạy worker theo lịch', 'The scheduled worker run has not been observed'],
  WORKERS_NOT_CONFIGURED: ['Chưa có worker nào được cấu hình theo dõi', 'No scheduled workers are configured for monitoring'],
  WORKERS_OK: ['Các worker theo lịch đã hoạt động', 'Scheduled workers are healthy'],
}

const common = {
  statusValue: { green: 'Xanh', yellow: 'Vàng', red: 'Đỏ', gray: 'Chưa xác minh' },
  severityValue: { yellow: 'Cảnh báo', red: 'Nghiêm trọng' },
  componentValue: { all: 'Tất cả', backend: 'Backend', kael: 'Kael', app: 'Ứng dụng', observer: 'Bộ giám sát' },
  filterValue: { all: 'Tất cả', open: 'Đang mở', resolved: 'Đã đóng', red: 'Đỏ', yellow: 'Vàng', '24h': '24 giờ', '7d': '7 ngày', '30d': '30 ngày' },
  qualityValue: { available: 'Có dữ liệu', partial: 'Dữ liệu một phần', unavailable: 'Chưa có dữ liệu' },
  checkValue: {
    'backend-edge-availability': 'Khả dụng của Edge API', 'backend-release-identity': 'Định danh bản phát hành',
    'backend-auth-availability': 'Khả dụng của xác thực', 'backend-database-availability': 'Khả dụng của cơ sở dữ liệu',
    'backend-storage-realtime-io': 'Hoạt động của kho tệp và kết nối thời gian thực', 'backend-core': 'Dịch vụ máy chủ',
    'backend-scheduled-workers': 'Tác vụ nền theo lịch', 'kael-agentic': 'Tác nhân Kael',
    'app-native-connectivity': 'Kết nối ứng dụng trên thiết bị', 'profile-coverage-unsupported': 'Độ phủ hệ thống chưa được xác định',
    'observer-dispatcher': 'Trạng thái bộ giám sát bên ngoài',
  },
  unknownCheck: 'Phép kiểm tra hệ thống',
  reasonValue: Object.fromEntries(Object.entries(reasonTranslations).map(([key, value]) => [key, value[0]])),
  historyEvent: { opened: 'Mở sự cố', updated: 'Cập nhật', resolved: 'Phục hồi' },
}

const english = {
  statusValue: { green: 'Green', yellow: 'Yellow', red: 'Red', gray: 'Unverified' },
  severityValue: { yellow: 'Warning', red: 'Critical' },
  componentValue: { all: 'All', backend: 'Backend', kael: 'Kael', app: 'App', observer: 'Observer' },
  filterValue: { all: 'All', open: 'Open', resolved: 'Closed', red: 'Red', yellow: 'Yellow', '24h': '24 hours', '7d': '7 days', '30d': '30 days' },
  qualityValue: { available: 'Evidence available', partial: 'Partial evidence', unavailable: 'No evidence' },
  checkValue: {
    'backend-edge-availability': 'Edge API availability', 'backend-release-identity': 'Release identity',
    'backend-auth-availability': 'Authentication availability', 'backend-database-availability': 'Database availability',
    'backend-storage-realtime-io': 'Storage and Realtime operation', 'backend-core': 'Backend services',
    'backend-scheduled-workers': 'Scheduled background jobs', 'kael-agentic': 'Kael agent',
    'app-native-connectivity': 'On-device app connectivity', 'profile-coverage-unsupported': 'System coverage is not identified',
    'observer-dispatcher': 'External observer status',
  },
  unknownCheck: 'System check',
  reasonValue: Object.fromEntries(Object.entries(reasonTranslations).map(([key, value]) => [key, value[1]])),
  historyEvent: { opened: 'Incident opened', updated: 'Updated', resolved: 'Closed' },
}

const copy = {
  vi: {
    ...common,
    overall: 'Tổng thể', checkedAt: 'Kiểm tra', expiresAt: 'Hết hạn', expired: 'Bằng chứng đã cũ', noSnapshot: 'Chưa có kết quả kiểm tra hợp lệ; chưa thể xác nhận hệ thống đang hoạt động tốt.', observer: 'Bộ giám sát Cloudflare', observerHeartbeat: 'Tín hiệu gần nhất', dispatcher: 'Trạng thái bộ giám sát', d1: 'Kho D1', lastSafeError: 'Mã lỗi gần nhất', loading: 'Đang tải bằng chứng hệ thống…', loadError: 'Không thể tải bằng chứng hệ thống.', detailError: 'Không thể tải chi tiết sự cố.', incidents: 'Sự cố', records: 'mục', status: 'Trạng thái', severity: 'Mức độ', component: 'Thành phần', timeRange: 'Khoảng thời gian', releaseFilter: 'Lọc theo bản phát hành', buildFilter: 'Lọc theo mã bản dựng', releaseMissing: 'Chưa gắn bản phát hành', noIncidents: 'Không có sự cố phù hợp với bộ lọc.', noDataAfterError: 'Không có dữ liệu hiển thị; lần tải gần nhất thất bại.', sampleMissing: 'Chưa ghi nhận số mẫu', samples: 'mẫu', evidenceStale: 'Bằng chứng thiếu hoặc đã cũ', chooseIncident: 'Chọn một sự cố để xem bằng chứng đã lọc.', detailLoading: 'Đang tải chi tiết sự cố…', incidentDetail: 'Chi tiết sự cố', reason: 'Bằng chứng hiện tại', detector: 'Bộ phát hiện', fingerprint: 'Mã nhận diện', openedAt: 'Bắt đầu', updatedAt: 'Cập nhật gần nhất', resolvedAt: 'Phục hồi lúc', closedAt: 'Kết thúc theo cấu hình lúc', closedByConfiguration: 'Kết thúc theo cấu hình', release: 'Bản phát hành', build: 'Bản dựng', platform: 'Nền tảng', route: 'Loại tuyến', stage: 'Giai đoạn', trace: 'Dấu vết', run: 'Lượt chạy', request: 'Yêu cầu', supportCode: 'Mã hỗ trợ', evidenceLimit: 'Chỉ gồm dữ liệu vận hành đã cho phép; không chứa nội dung khách hàng, bí mật hoặc kết luận về nguyên nhân.', timeline: 'Diễn tiến', exportPacket: 'Xuất hồ sơ đã lọc', exportTitle: 'Hồ sơ sự cố Kael', exportError: 'Không thể xuất hồ sơ sự cố.', back: 'Quay lại', notRecorded: 'Chưa ghi nhận', reasonCode: 'Mã', historyEvent: common.historyEvent,
  },
  en: {
    ...english,
    overall: 'Overall', checkedAt: 'Checked', expiresAt: 'Expires', expired: 'Evidence is stale', noSnapshot: 'No valid snapshot is available; the system cannot be confirmed green.', observer: 'Cloudflare observer', observerHeartbeat: 'Last heartbeat', dispatcher: 'Cloudflare Worker status', d1: 'D1 store', lastSafeError: 'Last error code', loading: 'Loading system evidence…', loadError: 'Unable to load system evidence.', detailError: 'Unable to load incident details.', incidents: 'Incidents', records: 'records', status: 'Status', severity: 'Severity', component: 'Component', timeRange: 'Time range', releaseFilter: 'Filter by release', buildFilter: 'Filter by build ID', releaseMissing: 'Release not attached', noIncidents: 'No incidents match these filters.', noDataAfterError: 'No data is available; the latest request failed.', sampleMissing: 'Sample count not recorded', samples: 'samples', evidenceStale: 'Evidence is missing or stale', chooseIncident: 'Select an incident to inspect its sanitized evidence.', detailLoading: 'Loading incident details…', incidentDetail: 'Incident detail', reason: 'Current evidence', detector: 'Detector', fingerprint: 'Fingerprint', openedAt: 'Opened', updatedAt: 'Last updated', resolvedAt: 'Recovered at', closedAt: 'Ended by configuration at', closedByConfiguration: 'Ended by configuration', release: 'Release', build: 'Build', platform: 'Platform', route: 'Route kind', stage: 'Stage', trace: 'Trace', run: 'Run', request: 'Request', supportCode: 'Support code', evidenceLimit: 'Only allowlisted operational aggregates; no customer content, secrets, or proven root cause.', timeline: 'Timeline', exportPacket: 'Export sanitized packet', exportTitle: 'Kael incident packet', exportError: 'Unable to export the incident packet.', back: 'Back', notRecorded: 'Not recorded', reasonCode: 'Code', historyEvent: english.historyEvent,
  },
} as const

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingBottom: spacing.lg },
  strong: { color: color.text.strong },
  secondary: { color: color.text.secondary },
  meta: { color: color.text.muted },
  statusPanel: { alignItems: 'center', backgroundColor: color.surface.soft, borderColor: color.surface.stroke, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  coverageGap: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  statusText: { flex: 1, gap: spacing.xs },
  statusMark: { alignItems: 'center', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, gap: 2, justifyContent: 'center', minHeight: 48, minWidth: 68, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  status_green: { backgroundColor: color.mint.mint50, borderColor: color.mint.mint300 },
  status_yellow: { backgroundColor: color.surface.soft, borderColor: color.surface.stroke },
  status_red: { backgroundColor: color.surface.raised, borderColor: color.surface.stroke },
  status_gray: { backgroundColor: color.surface.raised, borderColor: color.surface.stroke },
  statusSymbol: { color: color.text.strong },
  statusLabel: { color: color.text.strong },
  checks: { borderTopColor: color.surface.stroke, borderTopWidth: StyleSheet.hairlineWidth },
  checkRow: { alignItems: 'center', borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, minHeight: 66, paddingVertical: spacing.sm },
  checkText: { flex: 1, gap: spacing.xs, minWidth: 0 },
  observer: { borderTopColor: color.surface.stroke, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingTop: spacing.md },
  sectionHeading: { borderTopColor: color.surface.stroke, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingTop: spacing.md },
  filterGroup: { gap: spacing.sm },
  filterRow: { gap: spacing.xs },
  detailSection: { gap: spacing.xs },
})
