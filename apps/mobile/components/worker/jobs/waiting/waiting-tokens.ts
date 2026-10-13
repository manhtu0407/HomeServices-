/** Geometry measured from references/approved-waiting-stages.png.
 * Base width 560, content height 890, excluding the OS status bar.
 * No global theme or font files are installed or replaced. Card/ring/image positions stay
 * pinned to that measured canvas; only text (`type` below) resolves against the app's
 * canonical Apple type scale through `stageTypography`, so it reads as one system with the
 * rest of the app instead of inventing its own sizes.
 */
export const waitingTokens = {
  width: 560, contentHeight: 890,
  colors: { background: '#FAFFFE', text: '#09293E', secondary: '#59668B', mint: '#00C8A0', ringTrack: '#E6FBF7' },
  ring: { diameter: 348, radius: 168, stroke: 12, x: 106, y: 20 },
  layout: { bodyOffset: 72 },
  type: {
    heading: { role: 'title2', weight: '600' },
    body: { role: 'subheadline', weight: '400' },
    timerLabel: { role: 'subheadline', weight: '400' },
    button: { role: 'callout', weight: '600' },
  },
  /** The countdown numeral sits above every real Dynamic Type role, so it scales off
   *  `largeTitle` instead of inventing a bespoke size; the two factors reproduce the
   *  screen's existing long-text/short-text sizes (43pt / 53pt at largeTitle's 34pt). */
  timerScale: { long: 28 / 34, short: 34 / 34 },
} as const
