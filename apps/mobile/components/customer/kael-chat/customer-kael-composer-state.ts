export function canSubmitCustomerKaelComposer(input: {
  busy: boolean
  draft: string
  mediaDraftCount: number
  voiceTranscript: string
}) {
  if (input.busy) return false
  return Boolean(input.draft.trim() || input.mediaDraftCount > 0 || input.voiceTranscript.trim())
}
