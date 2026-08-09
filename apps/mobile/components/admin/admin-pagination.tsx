import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { color, radius, spacing, typography } from '@/design/theme'

type PaginationLabels = {
  more: string
  next: string
  page: (page: number) => string
  previous: string
}

type AdminPaginationProps = {
  hasMore: boolean
  labels: PaginationLabels
  loading: boolean
  onPageChange: (page: number) => void
  page: number
  pageTestIDPrefix: string
  pageSize: number
  testID: string
  totalCount: number | null
}

function visiblePages(page: number, totalPages: number | null, hasMore: boolean) {
  const lastPage = totalPages ?? (hasMore ? page + 1 : page)
  const aroundCurrent = [page - 1, page, page + 1]
  return Array.from(new Set([1, ...aroundCurrent, lastPage]))
    .filter((candidate) => candidate >= 1 && candidate <= lastPage)
    .sort((left, right) => left - right)
}

function PageChevron({ direction, testID }: { direction: 'next' | 'previous'; testID: string }) {
  const isPrevious = direction === 'previous'
  return <Svg
    height={16}
    pointerEvents="none"
    style={styles.chevron}
    testID={testID}
    viewBox="0 0 24 24"
    width={16}
  >
    <Path
      d={isPrevious ? 'M15 18L9 12L15 6' : 'M9 18L15 12L9 6'}
      fill="none"
      stroke={color.text.secondary}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    />
  </Svg>
}

export function AdminPagination({
  hasMore,
  labels,
  loading,
  onPageChange,
  page,
  pageTestIDPrefix,
  pageSize,
  testID,
  totalCount,
}: AdminPaginationProps) {
  const totalPages = totalCount === null ? null : Math.max(1, Math.ceil(totalCount / pageSize))
  const canGoNext = totalPages === null ? hasMore : page < totalPages
  if ((totalPages !== null && totalPages <= 1) || (totalPages === null && page === 1 && !hasMore)) return null

  const pages = visiblePages(page, totalPages, canGoNext)
  return <View accessibilityLabel={labels.page(page)} style={styles.root} testID={testID}>
    <Pressable
      accessibilityLabel={labels.previous}
      accessibilityRole="button"
      disabled={loading || page === 1}
      onPress={() => onPageChange(page - 1)}
      style={[styles.button, (loading || page === 1) && styles.buttonDisabled]}
      testID={`${pageTestIDPrefix}-previous`}
    >
      <PageChevron direction="previous" testID={`${pageTestIDPrefix}-previous-chevron`} />
    </Pressable>
    {pages.map((pageNumber, index) => {
      const previousPage = pages[index - 1]
      const selected = pageNumber === page
      return <View key={pageNumber} style={styles.pageSlot}>
        {previousPage !== undefined && pageNumber - previousPage > 1 && <Text accessibilityLabel={labels.more} style={styles.ellipsis}>…</Text>}
        <Pressable
          accessibilityLabel={labels.page(pageNumber)}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          disabled={loading || selected}
          onPress={() => onPageChange(pageNumber)}
          style={[styles.button, selected && styles.buttonSelected, loading && styles.buttonDisabled]}
          testID={`${pageTestIDPrefix}-${pageNumber}`}
        >
          <Text style={[styles.number, selected && styles.numberSelected]}>{pageNumber}</Text>
        </Pressable>
      </View>
    })}
    <Pressable
      accessibilityLabel={labels.next}
      accessibilityRole="button"
      disabled={loading || !canGoNext}
      onPress={() => onPageChange(page + 1)}
      style={[styles.button, (loading || !canGoNext) && styles.buttonDisabled]}
      testID={`${pageTestIDPrefix}-next`}
    >
      <PageChevron direction="next" testID={`${pageTestIDPrefix}-next-chevron`} />
    </Pressable>
  </View>
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', marginBottom: spacing.lg },
  pageSlot: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  button: { alignItems: 'center', backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: radius.pill, borderWidth: 1, height: 36, justifyContent: 'center', minWidth: 36, paddingHorizontal: spacing.sm },
  buttonDisabled: { opacity: 0.42 },
  buttonSelected: { backgroundColor: color.mint.mint50, borderColor: color.mint.mint300 },
  chevron: { alignSelf: 'center', margin: 0 },
  ellipsis: { ...typography.footnote, color: color.text.muted, fontWeight: '700', minWidth: 12, textAlign: 'center' },
  number: { ...typography.footnote, color: color.text.secondary, fontVariant: ['tabular-nums'], fontWeight: '600' },
  numberSelected: { color: color.brand.primaryDark, fontWeight: '700' },
})
