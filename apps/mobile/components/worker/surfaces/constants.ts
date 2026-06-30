// Worker UI dimension metrics. Extracted from worker-surfaces.tsx as a dependency-free leaf so
// styles.ts and the surfaces consume them without a circular import (C4 staged split).
export const workerDockHeight = 58
export const workerDockBottomMargin = 18
export const workerDockClearance = workerDockHeight + workerDockBottomMargin + 74
export const workerFrameHorizontalPadding = 14.8
export const workerJobRoomRevealDelayMs = 360
