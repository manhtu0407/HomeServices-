// Customer UI dimension metrics. Extracted from customer-surfaces.tsx as a dependency-free leaf so
// styles.ts and the surfaces consume them without a circular import (C4 customer split).
export const customerDockHeight = 56
export const customerDockBottomMargin = 18
export const customerDockBottomClearance = customerDockHeight + customerDockBottomMargin + 76
export const customerFrameHorizontalPadding = 16

export const customerWorkerTypography = {
  body: { fontWeight: '600' as const, letterSpacing: 0 },
  label: { fontWeight: '700' as const, letterSpacing: 0 },
  screenTitle: { fontWeight: '700' as const, letterSpacing: 0 },
  sectionTitle: { fontWeight: '600' as const, letterSpacing: 0 },
}
