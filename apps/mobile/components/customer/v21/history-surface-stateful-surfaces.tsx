import type { ReactNode } from 'react'

import { V21Screen, V21TopBar } from './shared-surfaces'
import type { CustomerV21ScreenId } from './types'

export function CustomerHistorySurfaceView({
  activeScreen,
  actionLabel,
  bodyNode,
  modalNode,
  onBack,
  subtitle,
  title,
}: {
  activeScreen: CustomerV21ScreenId
  actionLabel: string
  bodyNode: ReactNode
  modalNode: ReactNode
  onBack: () => void
  subtitle: string
  title: string
}) {
  return (
    <V21Screen screenId={activeScreen} testID="customer-v21-activity">
      <V21TopBar
        actionLabel={actionLabel}
        onBack={onBack}
        subtitle={subtitle}
        title={title}
      />

      {bodyNode}
      {modalNode}
    </V21Screen>
  )
}
