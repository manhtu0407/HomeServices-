/**
 * Stage 9 empty completion-record tokens, measured on the approved 390 × 1055 canvas.
 * Scoped to this surface; they do not replace the app-wide theme.
 */
export const stageNineTokens = {
  reference: { width: 390, height: 1055 },
  maxWidth: 480,
  // The approved canvas already spends its first 34 pt on the status bar.
  statusBarReserve: 34,
  illustration: { width: 284, height: 490 },
  colors: {
    ink: '#0d2935',
    quote: '#3b6572',
    muted: '#55717e',
    page: '#fcfefe',
    background: ['#cce1de', '#daf0ed', '#eef9f8', '#f6fcfc', '#fcfefe'],
    backgroundLocations: [0, 0.44, 0.64, 0.88, 1],
    buttonBorder: '#e5fff5',
    buttonHighlight: 'rgba(255, 255, 255, 0.48)',
    buttonLabel: '#ffffff',
    buttonShadow: '0px 13px 30px rgba(82, 203, 185, 0.14)',
    buttonSurfaceTop: ['#7ae3c7', '#4dd2b5', '#2ac0a4', '#11ae95', '#029a87', '#00857c'],
    buttonSurfaceBottom: ['#13b394', '#029f87', '#008c7a', '#007a6d', '#026861', '#135656'],
  },
  layout: {
    quoteTop: 141,
    titleTop: 672,
    descriptionGap: 13,
    buttonGap: 38,
    buttonInset: 25,
    buttonHeight: 76,
    buttonRadius: 40,
    buttonBorder: 1.25,
    bottomBreathingRoom: 63,
    // With the breathing room this matches the 126 pt every other worker screen keeps below its
    // content, so large text or an error note never ends the scroll under the floating dock.
    dockClearance: 63,
  },
  typography: {
    quote: { size: 21, lineHeight: 29, tracking: 0.1 },
    title: { size: 26, lineHeight: 34, tracking: -0.15 },
    body: { size: 20, lineHeight: 28, tracking: 0 },
    button: { size: 21, lineHeight: 28, tracking: -0.25 },
  },
} as const
