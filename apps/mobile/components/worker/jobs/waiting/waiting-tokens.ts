/** Geometry measured from references/approved-waiting-stages.png.
 * Base width 560, content height 890, excluding the OS status bar.
 * No global theme or font files are installed or replaced.
 */
export const waitingTokens = {
  width: 560, contentHeight: 890,
  colors: { background: '#FAFFFE', text: '#09293E', secondary: '#59668B', mint: '#00C8A0', ringTrack: '#E6FBF7', buttonStart: '#40D5B1', buttonEnd: '#00AD97' },
  ring: { diameter: 348, radius: 168, stroke: 12, x: 106, y: 20 },
  layout: { bodyOffset: 72 },
  type: { timer: 53, heading: 28, body: 20, timerLabel: 17, button: 26 },
} as const
