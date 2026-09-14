import type { StageFiveJobStatus, JourneyModel, WorkModel } from './stage-five.types'
export function formatDistance(meters: number | null): string {
  return meters === null || !Number.isFinite(meters) || meters < 0 ? '—' : `${(meters / 1000).toFixed(1)} km`
}
export function formatDuration(seconds: number | null): string {
  return seconds === null || !Number.isFinite(seconds) || seconds < 0 ? '—' : `${Math.ceil(seconds / 60)} phút`
}
export function elapsedSeconds(now: number, started: number | null, pausedAt: number | null, pausedMs: number): number | null {
  if (started === null || !Number.isFinite(started) || !Number.isFinite(now)) return null
  const end = pausedAt !== null && Number.isFinite(pausedAt) ? Math.min(now, pausedAt) : now
  return Math.floor(Math.max(0, end - started - Math.max(0, Number.isFinite(pausedMs) ? pausedMs : 0)) / 1000)
}
export function formatClock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--:--'
  const n = Math.max(0, Math.floor(seconds)), pad = (v: number) => String(v).padStart(2, '0')
  return `${pad(Math.floor(n / 3600))}:${pad(Math.floor(n / 60) % 60)}:${pad(n % 60)}`
}
const ROUTABLE = new Set<StageFiveJobStatus>(['worker_matched','worker_on_way','arrived','inspecting','repairing','scope_change_pending','completed_by_worker','completed','closed'])
export function canReleaseAddress(status: StageFiveJobStatus | null, release: string | null | undefined): boolean {
  return !!status && ROUTABLE.has(status) && (release === 'building_released' || release === 'unit_released')
}
export function canStartTravel(m: JourneyModel): boolean {
  return !!m.jobId && m.addressReleased && m.jobStatus === 'worker_matched'
}
export function canPrepareCompletion(m: WorkModel): boolean {
  return !!m.jobId && m.jobStatus === 'repairing' && m.canPrepareCompletion
}
export function emptyJourney(): JourneyModel {
  return { stage:4, jobId:null, jobStatus:null, addressReleased:false, destinationTitle:null, development:null,
    addressLine:null, unit:null, instructions:null, customerPhone:null, distanceMeters:null, durationSeconds:null,
    trafficLabel:null, routeState:'locked', primary:'startTravel' }
}
export function emptyWork(): WorkModel {
  return {stage:5,jobId:null,jobStatus:null,serviceTitle:null,serviceCategory:null,addressLine:null,
    arrivedLabel:null,startedLabel:null,startedAtMs:null,pausedAtMs:null,pausedMs:0,phase:null,note:null,
    evidenceCount:0,canPrepareCompletion:false}
}
