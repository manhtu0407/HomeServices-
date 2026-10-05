/** Local Timeline Card tokens taken from the approved artboards and their HTML render. They do not replace the app-wide theme. */
export const stageSixTokens = {
  compactBreakpoint: 520,
  // Geometry is drawn on these artboard widths and scales with the device inside the clamp below.
  referenceWidth: { compact: 370, wide: 594 },
  scaleClamp: { max: 1.2, min: 0.8 },
  // The Worker V5 scroll content pads 16pt, while the artboard measures its own 10/12/14pt gutters from the screen edge.
  hostGutter: 16,
  // Bare glyphs replace the tinted icon tiles, so they are drawn 1.25× the artboard glyph inside the same slot.
  glyphScale: 1.25,
  // Rows 0-137 of the 189px workart hold the paper illustration; the handwritten Vietnamese caption starts below.
  workartIllustrationRatio: 137 / 189,
  colors: {
    attachmentGlyph: '#008C83',
    cardBorder: '#EDF6F6',
    checkDisc: '#F5FFFD',
    checkGlyph: '#07AE9F',
    clockFace: '#F8FFFD',
    connectorEnd: '#C9ECE7',
    connectorMiddle: '#96DBD2',
    connectorStart: '#C9EEEA',
    dashed: '#BDE6E2',
    eyebrow: '#476479',
    heroGlyph: '#008F87',
    ink: '#10252D',
    kael: '#00968B',
    line: '#E8F1F4',
    muted: '#8499AA',
    nodeGlyph: '#008E85',
    plusBorder: '#EDF4F5',
    plusGlyph: '#00988E',
    price: '#008A82',
    primaryBase: '#09B09E',
    secondaryBase: '#EDF3F5',
    secondaryEnd: '#E7EEF2',
    secondaryInk: '#698297',
    secondaryStart: '#F0F5F7',
    surface: '#FCFEFE',
    tagHole: '#E3F8F4',
    text: '#526E85',
    tile: '#FFFFFF',
    value: '#30485D',
    white: '#FFFFFF',
  },
  gradients: {
    secondaryAngle: 135,
  },
  shadows: {
    checkDisc: '0 2px 2px rgba(0,123,114,0.1)',
    plus: '0 1px 3px rgba(28,85,110,0.133)',
  },
} as const
