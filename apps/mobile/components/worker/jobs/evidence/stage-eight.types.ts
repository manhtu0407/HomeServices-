import type { AppLanguage } from '@/lib/app-language'

export type StageEightEvidenceProps = {
  language?: AppLanguage
  previousStepLabel?: string
  currentStepLabel?: string
  nextStepLabel?: string
  photoCount: number
  note: string
  notice?: string | null
  onNoteChange?: (value: string) => void
  onAddPhoto?: () => void
  onBack?: () => void
  onSubmit?: () => void
  submitting?: boolean
  embedded?: boolean
  showWorkflowHeader?: boolean
}
