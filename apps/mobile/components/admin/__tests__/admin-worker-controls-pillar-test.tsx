import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { View } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { color } from '@/design/theme'

import { FinanceChoiceChip } from '../admin-finance-controls'
import { adminSectionsCopy } from '../admin-sections-copy'
import { styles } from '../admin-sections-styles'
import { AdminDataSearchToolbar } from '../admin-sections-support'
import { workerReviewCopy } from '../admin-worker-review-copy'

export const PILLAR = {
  id: 'P53-admin-worker-controls',
  invariant:
    'Worker capability filters and refresh actions use the neutral Admin control grammar, expose selected state without relying on mint color, and reflow at compact widths',
  authority: [
    'user-approved Admin Worker control consistency request',
    'governance/design/tokens.md (semantic tokens and shared control states)',
    'governance/design/accessible-content.md (non-color state and 44pt touch targets)',
  ],
  target: 'apps/mobile/components/admin/admin-sections.tsx',
  layer: 'ui-visual',
  siblings: ['P44-admin-production-sections', 'P47-admin-semantic-typography', 'P52-admin-finance-focused-capabilities'],
  mutation:
    'restore the selected KaelChip mint variant or remove toolbar wrapping — the neutral style, accessibility-state, and compact-reflow assertions turn red',
} as const satisfies PillarManifest

const filters = ['pending_access', 'missing_profile', 'ready_verification', 'verified', 'all'] as const

function WorkerControlsHarness({ onRefresh }: { onRefresh: () => void }) {
  const [selectedFilter, setSelectedFilter] = useState<(typeof filters)[number]>('pending_access')

  return <View>
    <AdminDataSearchToolbar
      copy={adminSectionsCopy.vi}
      onChangeSearch={() => undefined}
      onRefresh={onRefresh}
      refreshTestID="admin-worker-refresh"
      searchQuery=""
    />
    <View style={styles.filterRow}>
      {filters.map((filter) => <FinanceChoiceChip
        accessibilityLabel={workerReviewCopy.vi.filter[filter]}
        key={filter}
        label={workerReviewCopy.vi.filter[filter]}
        onPress={() => setSelectedFilter(filter)}
        selected={selectedFilter === filter}
        testID={`admin-worker-filter-${filter}`}
      />)}
    </View>
  </View>
}

describe('Admin Worker control grammar', () => {
  it('renders selected filters with a neutral surface, a visible checkmark, and accessibility state', () => {
    const onRefresh = jest.fn()
    render(<WorkerControlsHarness onRefresh={onRefresh} />)

    withPillarContext(PILLAR, () => {
      const pendingFilter = screen.getByTestId('admin-worker-filter-pending_access')
      expect(pendingFilter.props.accessibilityState).toMatchObject({ selected: true })
      expect(pendingFilter).toHaveStyle({
        backgroundColor: color.surface.base,
        borderColor: color.text.strong,
        minHeight: 44,
      })
      expect(screen.getByText('✓ Chờ duyệt')).toBeTruthy()
    }, 'the default Worker filter must be perceivable without the legacy mint fill')

    fireEvent.press(screen.getByTestId('admin-worker-filter-missing_profile'))

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('admin-worker-filter-pending_access').props.accessibilityState).toMatchObject({ selected: false })
      expect(screen.getByTestId('admin-worker-filter-missing_profile').props.accessibilityState).toMatchObject({ selected: true })
      expect(screen.getByText('✓ Cần bổ sung')).toBeTruthy()
    }, 'changing a Worker filter must move both the semantic and visible selected state')
  })

  it('keeps refresh neutral and allows the search toolbar to reflow', () => {
    const onRefresh = jest.fn()
    render(<WorkerControlsHarness onRefresh={onRefresh} />)

    withPillarContext(PILLAR, () => {
      const refresh = screen.getByTestId('admin-worker-refresh')
      expect(refresh).toHaveStyle({
        backgroundColor: color.surface.base,
        borderColor: color.surface.strokeStrong,
        minHeight: 44,
      })
      expect(styles.toolbar).toMatchObject({ flexWrap: 'wrap' })
      expect(styles.searchField).toMatchObject({ flexGrow: 1, flexShrink: 1, minWidth: 220 })
      fireEvent.press(refresh)
      expect(onRefresh).toHaveBeenCalledTimes(1)
    }, 'refresh remains a secondary action while compact and large-text layouts can wrap')
  })
})
