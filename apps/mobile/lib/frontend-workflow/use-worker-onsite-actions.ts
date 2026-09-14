import { useCallback, type Dispatch, type RefObject } from 'react'
import {
  toLocalDealStatus,
  type JobStatus,
  type LocalWorkflowAction,
  type LocalWorkflowState,
} from '@nestscout/shared'
import type { WorkerCancellationRequestInput } from '../api-types'
import { workerService } from '../services'
import type { WorkflowErrorHandler } from './errors'
import { getRemoteJobId } from './helpers'
import { dealToSnapshot } from './snapshots'

type WorkerStatusUpdate = Extract<JobStatus, 'worker_on_way' | 'arrived' | 'inspecting' | 'repairing' | 'completed_by_worker'>

type WorkerAccessCheckInInput = {
  mode: 'geofence' | 'manual_photo'
  lat?: number
  lng?: number
  accuracy_m?: number
  photo_urls?: string[]
  note?: string
  checked_in_at?: string
}

type WorkerWorkSessionInput = {
  action: 'pause' | 'resume' | 'save_note'
  note?: string
}

type WorkerOnsiteActionsInput = {
  dispatch: Dispatch<LocalWorkflowAction>
  refreshCurrentJob: () => Promise<boolean>
  setRemoteError: WorkflowErrorHandler
  stateRef: RefObject<LocalWorkflowState>
  workerRefresh: () => Promise<boolean>
}

export function useWorkerOnsiteActions({
  dispatch,
  refreshCurrentJob,
  setRemoteError,
  stateRef,
  workerRefresh,
}: WorkerOnsiteActionsInput) {
  const workerUpdateStatus = useCallback(async (
    status: WorkerStatusUpdate,
    extras?: {
      completion_notes?: string
      completion_photo_urls?: string[]
      access_check_in?: WorkerAccessCheckInInput
      work_session?: WorkerWorkSessionInput
    },
  ) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để cập nhật')
    const updated = await workerService.updateJobStatus(jobId, status, extras)
    if (!updated.success) return setRemoteError(updated)
    const existing = stateRef.current.deal
    if (existing?.id === jobId) {
      dispatch({
        type: 'hydrate_remote_job',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: updated.data.to_status,
          completionNotes: extras?.completion_notes ?? existing.completionNotes,
          completionPhotoUrls: extras?.completion_photo_urls ?? existing.completionPhotoUrls,
          arrivedAt: updated.data.to_status === 'arrived'
            ? existing.arrivedAt ?? updated.data.updated_at
            : existing.arrivedAt,
          workStartedAt: updated.data.work_session?.started_at ?? existing.workStartedAt,
          workPausedAt: updated.data.work_session?.paused_at ?? existing.workPausedAt,
          workPausedMs: updated.data.work_session?.paused_ms ?? existing.workPausedMs ?? 0,
          workerWorkNote: updated.data.work_session?.note ?? existing.workerWorkNote,
          status: toLocalDealStatus(updated.data.to_status),
        },
        workerGate: 'remote_backend',
      })
    }
    // The status mutation is authoritative; hydrate related worker details without delaying the next visible step.
    void workerRefresh().catch(() => undefined)
    return true
  }, [dispatch, setRemoteError, stateRef, workerRefresh])

  const requestWorkerCancellation = useCallback(async (input: WorkerCancellationRequestInput) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để hủy')
    const result = await workerService.requestWorkerCancellation(jobId, input)
    if (!result.success) return setRemoteError(result)
    if (result.data.status === 'approved') {
      const existing = stateRef.current.deal
      if (existing) {
        dispatch({
          type: 'hydrate_remote_job',
          job: {
            ...dealToSnapshot(existing),
            backendStatus: result.data.job_status,
            status: toLocalDealStatus(result.data.job_status),
            broadcast: existing.broadcast
              ? {
                ...existing.broadcast,
                status: 'cancelled',
                fullAddressVisible: false,
                fullAddressLabel: null,
                secondsRemaining: 0,
              }
              : null,
          },
        })
      }
      await workerRefresh()
      return true
    }
    await refreshCurrentJob()
    return true
  }, [dispatch, refreshCurrentJob, setRemoteError, stateRef, workerRefresh])

  return {
    requestWorkerCancellation,
    workerUpdateStatus,
  }
}
