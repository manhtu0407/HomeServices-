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
    fontSize: 13,
    lineHeight: 19,
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
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
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
    fontSize: 13,
    lineHeight: 19,
  },
  optionCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  optionTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  optionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionVisual: {
    fontSize: 27,
    lineHeight: 32,
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
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  selectedPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
})
