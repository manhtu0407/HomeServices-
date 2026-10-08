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
    sources?: KaelEstimateMarketSource[]
  }
  problem?: {
    remaining_uncertainty: string | null
    recommended_scope: string | null
    severity_indicators: string[]
    summary: string
  }
}

export type KaelEstimateMarketSource = {
  domain: string
  url: string
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

export type KaelPriceReasoningReceipt = {
  schema_version: 'price_reasoning_receipt.v1'
  receipt_id: string
  problem: {
    confirmed_facts: string[]
    possible_causes: {
      statement: string
      basis: ('customer_report' | 'visual_evidence' | 'service_profile' | 'knowledge')[]
      confidence: 'low' | 'medium' | 'high'
    }[]
    unknowns: string[]
  }
  scope: {
    included: string[]
    conditional: string[]
    excluded: string[]
  }
  costs: {
    currency: 'VND'
    total_min: number
    total_max: number
    reconciliation: 'package_total' | 'exact'
    components: {
      kind:
        | 'service_package'
        | 'labor'
        | 'travel'
        | 'materials'
        | 'replacement_parts'
        | 'equipment'
        | 'other'
      status:
        | 'priced'
        | 'included_unitemized'
        | 'conditional_unpriced'
        | 'excluded'
        | 'undetermined'
      amount_min: number | null
      amount_max: number | null
      explanation: string
    }[]
  }
  scenarios: {
    low: { total: number; conditions: string[]; scope: string[] }
    high: { total: number; conditions: string[]; scope: string[] }
  }
  fairness: {
    price_source:
      | 'perplexity_validated'
      | 'baseline_with_market'
      | 'baseline_only'
      | 'inspection_required'
    confidence: 'low' | 'medium' | 'high'
    baseline_evidence?: BaselinePriceEvidenceReceiptResponse | null
    market_source_count: number | null
    high_trust_source_count: number | null
    quorum_met: boolean | null
    market_sources?: KaelEstimateMarketSource[]
    cap_statement: string
    remaining_uncertainty: string[]
  }
}
