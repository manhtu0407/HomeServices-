import type { ReactNode } from 'react'

import { V21Screen, V21TopBar } from './shared-surfaces'
import type { CustomerV21ScreenId } from './types'

export function CustomerAgenticCenterSurfaceView({
  actionLabel,
  bodyNode,
  onBack,
  screenId,
  subtitle,
  testID,
  title,
}: {
  actionLabel: string
  bodyNode: ReactNode
  onBack: () => void
  screenId: CustomerV21ScreenId
  subtitle: string
  testID: string
  title: string
}) {
  return (
    <V21Screen screenId={screenId} testID={testID}>
      <V21TopBar
        actionLabel={actionLabel}
        onBack={onBack}
        subtitle={subtitle}
        title={title}
      />
      {bodyNode}
    </V21Screen>
  )
}
