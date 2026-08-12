import { StyleSheet } from 'react-native'
import { createSurfaceShadow } from '@/components/ui/tokens'

import { color, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  timeline: {
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 25,
    borderWidth: 1,
    gap: 0,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 16,
    position: 'relative',
    ...shadow.soft,
  },
  timelineDot: {
    borderColor: '#FFFFFF',
    borderRadius: 7,
    borderWidth: 2,
    height: 13,
    left: 2,
    position: 'absolute',
    top: 5,
    width: 13,
    zIndex: 2,
  },
  timelineDotActive: {
    backgroundColor: color.brand.primary,
    boxShadow: createSurfaceShadow({ color: color.brand.primary, offsetY: 0, opacity: 0.16, radius: 9 }),
  },
  timelineDotDone: {
    backgroundColor: color.accent.success,
  },
  timelineFormulaAura: {
    bottom: -88,
    height: 282,
    left: -76,
    opacity: 0.96,
    right: -58,
    top: -78,
  },
  timelineFormulaZipAura: {
    height: 246,
    opacity: 0.78,
    right: -96,
    top: -82,
    width: 326,
  },
  timelineItem: {
    minHeight: 46,
    paddingBottom: 14,
    paddingLeft: 28,
    position: 'relative',
  },
  timelineMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: 1,
  },
  timelineRail: {
    backgroundColor: '#D6EBE6',
    bottom: 24,
    left: 24,
    position: 'absolute',
    top: 22,
    width: 2,
  },
  timelineTitle: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
})
