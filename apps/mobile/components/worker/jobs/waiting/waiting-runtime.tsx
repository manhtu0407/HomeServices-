import React, { useMemo, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { typography } from '@/design/theme'
import type { WorkerJobsLegacyPrototypeRuntime } from '../worker-jobs-zip-prototype-shared'
import { WaitingContent } from './waiting-content'
import { buildWaitingModel } from './waiting-model'
import type { WaitingSnapshot } from './waiting-model'
import type { WaitingKind, WaitingLanguage } from './waiting.types'
import { useWorkerColor } from '../../ui/worker-dark-styles'

/** Read-only adapter. No accept / approve / status mutation from timers or navigation. */
export function WorkerWaitingRuntime({ kind, language, runtime, onMessage, onContinue, reduceMotion, timing }: {
  kind: WaitingKind; language: WaitingLanguage; runtime: WorkerJobsLegacyPrototypeRuntime
  onMessage?: () => void; onContinue?: () => void; reduceMotion?: boolean
  timing?: WaitingSnapshot['timing']
}) {
  const tc = useWorkerColor()
  const [details, setDetails] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const deal = runtime.state.deal, scope = deal?.scopeChange
  const model = useMemo(() => buildWaitingModel(kind, {
    jobId: deal?.broadcast?.jobId ?? deal?.id ?? null, jobStatus: deal?.status,
    scope: scope ? { status: scope.status, createdAt: scope.createdAt } : null, timing,
  }), [kind, deal?.id, deal?.broadcast?.jobId, deal?.status, scope?.status, scope?.createdAt, timing])
  const vi = language === 'vi'
  const refresh = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try { if (!await runtime.actions.refreshCurrentJob()) setError(vi ? 'Chưa cập nhật được. Vui lòng thử lại.' : 'Unable to refresh. Please retry.') }
    catch { setError(vi ? 'Không thể kết nối. Vui lòng thử lại.' : 'Unable to connect. Please retry.') }
    finally { setBusy(false) }
  }
  return <>
    <WaitingContent model={model} language={language} reduceMotion={reduceMotion} onOpenDetails={() => setDetails(true)} />
    <Modal visible={details} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setDetails(false)}>
      <View style={{ flex: 1, padding: 24, backgroundColor: 'rgba(6,31,37,0.2)', justifyContent: 'center' }}>
        <View style={{ backgroundColor: tc('surface', '#FFFFFF'), borderRadius: 24, padding: 24, gap: 16 }} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={{ ...typography.title2, color: tc('ink', '#09293E'), fontWeight: '600' }}>{vi ? 'Chi tiết công việc' : 'Job details'}</Text>
          <Text selectable style={{ ...typography.callout, color: tc('ink', '#52687A') }}>{kind === 'scope-approval' ? (scope?.requestedDescription || (vi ? 'Chưa có đề xuất đang chờ.' : 'No pending proposal.')) : (vi ? 'Yêu cầu nhận việc đang chờ khách quyết định. Địa chỉ chính xác và thao tác di chuyển vẫn được bảo vệ.' : 'Your request is awaiting a customer decision. Exact address and travel remain protected.')}</Text>
          <Text selectable style={{ ...typography.footnote, color: tc('ink', '#52687A') }}>{vi ? 'Trạng thái hệ thống: ' : 'System status: '}{deal?.status ?? '—'}</Text>
          {error ? <Text accessibilityRole="alert" style={{ ...typography.footnote, color: tc('ink', '#A13232') }}>{error}</Text> : null}
          <Pressable onPress={() => void refresh()} disabled={busy} accessibilityRole="button" style={{ padding: 14, borderRadius: 16, backgroundColor: tc('surface', '#E8F9F4') }}><Text style={{ ...typography.footnote, fontWeight: '600', textAlign: 'center', color: '#00856F' }}>{busy ? (vi ? 'Đang cập nhật…' : 'Updating…') : (vi ? 'Kiểm tra lại trạng thái' : 'Refresh status')}</Text></Pressable>
          {kind === 'scope-approval' && onMessage ? <Pressable accessibilityRole="button" onPress={() => { setDetails(false); onMessage() }} style={{ padding: 14 }}><Text style={{ ...typography.footnote, fontWeight: '600', color: '#00856F', textAlign: 'center' }}>{vi ? 'Nhắn khách' : 'Message customer'}</Text></Pressable> : null}
          {kind === 'scope-approval' && model.state === 'approved' && onContinue ? <Pressable accessibilityRole="button" onPress={() => { setDetails(false); onContinue() }} style={{ padding: 14 }}><Text style={{ ...typography.footnote, fontWeight: '600', color: '#00856F', textAlign: 'center' }}>{vi ? 'Tiếp tục' : 'Continue'}</Text></Pressable> : null}
          <Pressable accessibilityRole="button" onPress={() => setDetails(false)} style={{ padding: 14, backgroundColor: '#00AD97', borderRadius: 16 }}><Text style={{ ...typography.footnote, color: '#FFFFFF', fontWeight: '600', textAlign: 'center' }}>{vi ? 'Đóng' : 'Close'}</Text></Pressable>
        </View>
      </View>
    </Modal>
  </>
}
