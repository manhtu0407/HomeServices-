import { initialAgenticEvidencePayload } from '../kael-chat/customer-kael-evidence-payload'

describe('Kael evidence privacy', () => {
  it('does not submit a reviewed voice transcript when evidence is skipped', () => {
    expect(initialAgenticEvidencePayload(
      'skipped',
      '  Private voice transcript  ',
      'Customer service context',
    )).toEqual({
      evidenceItems: [],
      message: 'Customer service context',
      transcriptCount: 0,
    })
  })

  it('includes the reviewed transcript only after explicit confirmation', () => {
    expect(initialAgenticEvidencePayload(
      'confirmed',
      '  Reviewed transcript  ',
      'Customer service context',
    )).toEqual({
      evidenceItems: [{
        kind: 'voice_transcript',
        model_eligible: true,
        transcript: 'Reviewed transcript',
      }],
      message: 'Reviewed transcript',
      transcriptCount: 1,
    })
  })
})
