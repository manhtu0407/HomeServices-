export type KaelEstimateAnalysisReceipt = {
  schema_version: 'analysis_receipt.v1'
  evidence: {
    analysis_status?: 'analyzed' | 'not_provided' | 'unavailable'
    findings?: {
      confidence: 'low' | 'medium' | 'high'
      evidence_index: number
      evidence_kind: 'photo' | 'video_frame'
      observation: string
      possible_meaning: string | null
    }[]
    photo_count: number
    video_frame_count: number
    voice_transcript_count: number
    skipped: boolean
  }
  market: {
    accepted_source_count: number | null
    high_trust_source_count: number | null
    quorum_met: boolean | null
  }
  problem?: {
    remaining_uncertainty: string | null
    recommended_scope: string | null
    severity_indicators: string[]
    summary: string
  }
}

export type BaselinePriceEvidenceReceiptResponse = {
  schema_version: 'baseline_price_evidence_receipt.v1'
  accepted_source_count: number
  aggregate_price_min: number
  aggregate_price_max: number
  high_trust_source_count: number
  quorum_met: true
  required_quorum: number
  unit: BaselinePriceEvidenceUnitResponse
  sources: BaselinePriceEvidenceSourceResponse[]
}

export type BaselinePriceEvidenceSourceResponse = {
  domain: string
  url: string
  observed_at: string
  price_min: number
  price_max: number
  unit: BaselinePriceEvidenceUnitResponse
  effective_tier: 1 | 2
  weight: number
  normalization?: {
    original_price_min: number
    original_price_max: number
    original_unit: 'per_item'
    quantity: number
    calculation: string
  }
}

export type BaselinePriceEvidenceUnitResponse =
  | 'per_visit'
  | 'per_cabinet_door'
  | 'per_repair_point'
  | 'per_item'
