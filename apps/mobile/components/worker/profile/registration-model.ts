import type { WorkerProfileResponse } from '@/lib/api-types'

export function workerNeedsRegistration(profile: WorkerProfileResponse | null | undefined) {
  return !profile || profile.verification_status === 'draft' || profile.verification_status === 'rejected'
}

export function workerNeedsAvailabilityVerification(profile: WorkerProfileResponse | null | undefined) {
  return !profile || (!profile.is_approved && !profile.is_suspended)
}

export function workerIsWaitingForReview(profile: WorkerProfileResponse | null | undefined) {
  return profile?.verification_status === 'submitted' || profile?.verification_status === 'under_review'
}
