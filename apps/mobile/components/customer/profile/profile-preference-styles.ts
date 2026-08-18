import { typography } from '@/design/theme'
import { StyleSheet } from 'react-native'

export const customerV21ProfilePreferenceStyles = StyleSheet.create({
  panel: {
    borderRadius: 24,
    borderWidth: 1,
    width: '100%',
  },
  panelBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingTop: 16,
  },
  panelContent: {
    gap: 16,
    padding: 16,
  },
  panelHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  panelHeaderCentered: {
    alignItems: 'center',
  },
  panelHeaderCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  panelHeaderBody: {
    ...typography.subheadline,
  },
  panelHeaderIcon: {
    height: 42,
    width: 42,
  },
  panelHeaderIconFrame: {
    alignItems: 'center',
    borderRadius: 17,
    flexShrink: 0,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  panelHeaderTitle: {
    ...typography.headline,
  },
  option: {
    alignItems: 'flex-start',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 84,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  optionBody: {
    ...typography.subheadline,
  },
  optionCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  optionTitle: {
    flexShrink: 1,
    ...typography.callout,
    fontWeight: '600',
  },
  optionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionVisual: {
    ...typography.title2,
  },
  optionVisualFrame: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 14,
    flexShrink: 0,
    height: 44,
    justifyContent: 'center',
    width: 48,
  },
  selectedLabel: {
    ...typography.caption2,
    fontWeight: '600',
  },
  selectedPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  simplePanel: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  simplePanelBody: {
    gap: 12,
  },
  simplePanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  simplePanelHeaderBody: {
    ...typography.footnote,
    marginTop: 2,
  },
  simplePanelHeaderCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  simplePanelHeaderIcon: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  simplePanelHeaderTitle: {
    ...typography.callout,
    fontWeight: '700',
  },
})
