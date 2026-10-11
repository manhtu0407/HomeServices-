import type { SystemHealthSnapshot, SystemIncidentPacket } from '@nestscout/shared'

export type AdminSystemObserverStatus = {
  observer_heartbeat_at: string | null
  dispatcher_status: 'green' | 'yellow' | 'red' | 'gray'
  d1_status: 'green' | 'yellow' | 'red' | 'gray'
  last_snapshot_at: string | null
  last_error_code: string | null
}

export type AdminSystemHealthResponse = {
  generated_at: string
  snapshot: SystemHealthSnapshot | null
  observer: AdminSystemObserverStatus | null
}

export type AdminSystemIncidentFilters = {
  component?: string
  status?: 'all' | 'open' | 'resolved'
  severity?: 'all' | 'yellow' | 'red'
  from?: string
  to?: string
  release_id?: string
  build_id?: string
  limit?: number
  cursor?: string
}

export type AdminSystemIncidentListResponse = {
  generated_at: string
  data_quality: 'available' | 'partial' | 'unavailable'
  records: SystemIncidentPacket[]
  has_more: boolean
  next_cursor: string | null
}

export type AdminSystemIncidentDetailResponse = {
  generated_at: string
  record: SystemIncidentPacket
  history: Array<{
    event: 'opened' | 'updated' | 'resolved'
    at: string
    status: 'open' | 'resolved'
    severity: 'yellow' | 'red'
    reason_code: string
  }>
}

export type AdminSystemRefreshResponse = { accepted: boolean; scheduled_at: string | null }
