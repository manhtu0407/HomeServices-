import { StyleSheet } from 'react-native'

import { color, radius, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    ...shadow.soft,
  },
  cardDark: {
    backgroundColor: 'rgba(13,36,42,0.94)',
    borderColor: 'rgba(143,226,212,0.22)',
  },
  cardOpaque: {
    backgroundColor: color.surface.base,
  },
  cardOpaqueDark: {
    backgroundColor: '#0D242A',
  },
  copy: {
    color: color.text.secondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  darkCopy: {
    color: '#B8D0CF',
  },
  darkTitle: {
    color: '#F1F6F4',
  },
  fieldShell: {
    backgroundColor: 'rgba(247,255,251,0.94)',
    borderColor: color.surface.stroke,
    borderRadius: 18,
    borderWidth: 1,
  },
  fileList: {
    gap: 9,
  },
  fileRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(241,250,248,0.84)',
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
    backgroundColor: 'rgba(31,61,65,0.8)',
    borderColor: 'rgba(143,226,212,0.22)',
  },
  fileRowPressed: {
    opacity: 0.78,
  },
  fileStatus: {
    color: color.brand.primaryDark,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    maxWidth: 116,
    textAlign: 'right',
  },
  fileStatusDark: {
    color: '#8FE2D4',
  },
  fileTitle: {
    color: color.text.strong,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  formGap: {
    gap: 11,
  },
  formLabel: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginBottom: 5,
  },
  sectionTitle: {
    color: color.text.strong,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  serviceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  status: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  submit: {
    marginTop: 2,
  },
  title: {
    color: color.text.strong,
    fontFamily: typography.fontFamily,
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 27,
  },
  error: {
    color: color.accent.destructive,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  note: {
    color: color.text.muted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
})
