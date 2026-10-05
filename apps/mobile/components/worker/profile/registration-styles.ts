import { StyleSheet } from 'react-native'

import { color, customerTheme, radius, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 14,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.soft,
  },
  cardContent: {
    gap: 14,
    position: 'relative',
    zIndex: 1,
  },
  cardDark: {
    backgroundColor: customerTheme.darkLayer.base,
    borderColor: customerTheme.darkLayer.border,
  },
  cardOpaque: {
    backgroundColor: color.surface.base,
  },
  cardOpaqueDark: {
    backgroundColor: customerTheme.darkLayer.base,
  },
  copy: {
    color: color.text.secondary,
    ...typography.footnote,
  },
  darkCopy: {
    color: customerTheme.darkLayer.muted,
  },
  darkTitle: {
    color: customerTheme.darkLayer.text,
  },
  fieldInputDark: {
    color: customerTheme.darkLayer.text,
  },
  fieldShellDark: {
    backgroundColor: customerTheme.darkLayer.raised,
    borderColor: customerTheme.darkLayer.border,
  },
  fieldShell: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: 18,
    borderWidth: 1,
  },
  fileList: {
    gap: 9,
  },
  fileRow: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  fileRowDark: {
    backgroundColor: customerTheme.darkLayer.raised,
    borderColor: customerTheme.darkLayer.border,
  },
  fileRowPressed: {
    opacity: 0.78,
  },
  fileStatus: {
    color: color.brand.primaryDark,
    flexShrink: 0,
    maxWidth: 116,
    textAlign: 'right',
    ...typography.caption1,
  },
  fileStatusDark: {
    color: customerTheme.darkLayer.primary,
  },
  fileTitle: {
    color: color.text.strong,
    flex: 1,
    ...typography.subheadline,
  },
  formGap: {
    gap: 11,
  },
  registrationHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  registrationHeadingIconTile: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: 17,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  registrationHeadingIconTileDark: {
    backgroundColor: customerTheme.darkLayer.raised,
    borderColor: customerTheme.darkLayer.border,
  },
  formLabel: {
    color: color.text.secondary,
    marginBottom: 5,
    ...typography.caption1,
  },
  sectionTitle: {
    color: color.text.strong,
    ...typography.callout,
  },
  serviceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  status: {
    color: color.brand.primaryDark,
    ...typography.caption1,
  },
  submit: {
    marginTop: 8,
  },
  title: {
    color: color.text.strong,
    ...typography.title2,
  },
  error: {
    color: color.accent.destructive,
    ...typography.footnote,
  },
  note: {
    color: color.text.muted,
    ...typography.caption1,
  },
})
