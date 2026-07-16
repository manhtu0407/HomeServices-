import type { CaseWorkEvidence } from '@nestscout/shared'

export function initialAgenticEvidencePayload(
  decision: 'confirmed' | 'skipped',
  transcriptInput: string,
  sourceMessage: string,
) {
  const transcript = transcriptInput.trim()
  const includeTranscript = decision === 'confirmed' && transcript.length > 0
  const evidenceItems: CaseWorkEvidence[] = includeTranscript
    ? [{ kind: 'voice_transcript', transcript, model_eligible: true }]
    : []
  return {
    evidenceItems,
    message: includeTranscript ? transcript : sourceMessage,
    transcriptCount: includeTranscript ? 1 : 0,
  }
}
