

import { JobEvidenceGallery } from '@/components/ui/job-evidence-gallery'
import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'

export function WorkerV5EvidenceTray({
  addPhotoDisabled = false,
  emptyLabel,
  language,
  onAddPhoto,
  reduceTransparency,
  stageLabel,
  styleVariant = 'default',
  testID = 'worker-v5-evidence-tray',
  uploadingSlot = null,
  urls,
}: {
  addPhotoDisabled?: boolean
  emptyLabel: string
  language: AppLanguage
  onAddPhoto?: (slot: number) => void
  reduceTransparency: boolean
  stageLabel?: string
  styleVariant?: 'default' | 'jobs-review'
  testID?: string
  uploadingSlot?: number | null
  urls: readonly (string | null | undefined)[]
}) {
  return (
    <JobEvidenceGallery
      addPhotoDisabled={addPhotoDisabled}
      emptyLabel={emptyLabel}
      language={language}
      minimumSlots={onAddPhoto ? 3 : 0}
      onAddPhoto={onAddPhoto}
      reduceTransparency={reduceTransparency}
      refs={urls}
      stageLabel={stageLabel ?? textByLanguage(language, 'Bằng chứng công việc', 'Job evidence')}
      styleVariant={styleVariant}
      testID={testID}
      uploadingSlot={uploadingSlot}
    />
  )
}
