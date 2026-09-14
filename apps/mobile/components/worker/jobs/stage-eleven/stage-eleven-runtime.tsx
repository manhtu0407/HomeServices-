import React from 'react'
import { useJobMediaPreviewUrls } from '@/lib/job-media-preview'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerJobsLegacyPrototypeRuntime } from '../worker-jobs-zip-prototype-shared'
import { buildStageElevenModel } from './stage-eleven-model'
import { StageElevenContent } from './stage-eleven-content'

export type WorkerStageElevenRuntimeProps = {
  language: AppLanguage
  runtime: WorkerJobsLegacyPrototypeRuntime
  navigateToEarnings: () => void
  navigateToHome?: () => void
  navigateToHistory?: () => void
  reduceMotion?: boolean
  reduceTransparency: boolean
}

/** Thin adapter to the EXISTING provider. It does not fetch a second job, write
 * payment rows, open a new payment rail, or import preview fixtures.
 */
export function WorkerStageElevenRuntime({
  language, runtime, navigateToEarnings, navigateToHome, navigateToHistory,
  reduceMotion, reduceTransparency,
}: WorkerStageElevenRuntimeProps) {
  const deal = runtime.state.deal
  const jobId = deal?.broadcast?.jobId ?? deal?.id ?? null
  const job = runtime.workerJobs.find((item) => item.id === jobId)
  const payment = deal?.payment
  const receiverAccountLabel = payment?.accountMasked
    ? [payment.bankCode, payment.accountMasked].filter(Boolean).join(' · ')
    : null
  const model = buildStageElevenModel({
    jobId,
    status: job?.status ?? deal?.status,
    backendStatus: deal?.backendStatus,
    paymentStatus: job?.payment_status ?? payment?.status,
    provider: job?.payment_provider ?? payment?.provider ?? deal?.paymentRailProvider,
    amountReceived: job?.payment_amount_received ?? payment?.amountReceived,
    grossAmount: job?.gross_amount ?? payment?.grossAmount,
    serviceType: job?.service_type ?? deal?.draft.serviceType,
    district: job?.district ?? deal?.draft.districtLabel,
    completedAt: job?.completed_at ?? deal?.completedAt,
    paymentReceivedAt: job?.payment_received_at ?? payment?.receivedAt,
    paymentCode: job?.payment_code ?? payment?.paymentCode,
    photoRef: job?.completion_photo_urls[0] ?? deal?.completionPhotoUrls?.[0]
      ?? job?.customer_evidence_photo_urls[0] ?? null,
    ledger: runtime.workerEarnings?.recent_transactions ?? [],
  })
  // Resolves private supabase:// refs using the project's existing authorized helper.
  const [photoUri] = useJobMediaPreviewUrls([model.job.photoRef])
  return <StageElevenContent
    model={model}
    language={language}
    supplement={receiverAccountLabel ? { receiverAccountLabel } : undefined}
    photoSource={photoUri ? { uri: photoUri } : null}
    showHeader={false}
    reduceMotion={reduceMotion}
    reduceTransparency={reduceTransparency}
    actions={{
      onBack: navigateToEarnings,
      onEarnings: navigateToEarnings,
      onHome: navigateToHome,
      onHistory: navigateToHistory ?? navigateToEarnings,
      onRefresh: runtime.actions.workerRefresh,
    }}
  />
}
