/** Stage 2 · Chi tiết yêu cầu — tokens transcribed from the approved package.
 *
 * The approved source is a dependency-free HTML build on a fixed 941 × 1672 artboard whose phone
 * screen is 773 wide; the four section cards sit inside that screen at a fixed 728. The card width
 * is the divisor here rather than the artboard, because the cards fill the host's content band, so
 * one canvas unit keeps the proportion it had between the card's own edges. Type resolves through
 * `stage-ratio.ts` against the window so the small end lands on the house ramp rather than
 * shrinking with the device.
 */

export const requestDetailsTokens = {
  /** Card width on the approved artboard; the divisor for every geometry value in this file. */
  canvasWidth: 728,

  color: {
    card: 'rgba(254, 255, 255, 0.985)',
    line: '#E2EAEE',
    mintIcon: '#11AA8F',
    sectionTitle: '#0B1D35',
    sectionSub: '#6A7F91',
    rowTitle: '#0B1A31',
    rowSub: '#6F8192',
    pillAmberText: '#C67A16',
    pillMintText: '#0F8F7E',
    pillNeutralText: '#243240',
  },

  geometry: {
    cardRadius: 29,
    cardPaddingX: 24,
    cardPaddingTop: 16,
    cardPaddingBottom: 20,
    /** The artboard pins every card at its own height, which leaves gaps of 20, 24 and 22 between
     *  them; in flow layout the content sets the height and one pitch has to serve all three. */
    cardSpacing: 22,
    /** One size and one gap for section and row alike: the glyphs carry no tile, so the only thing
     *  holding the icon column straight is that every mark occupies the same box at the same
     *  offset, which also puts the section title and its rows on one left edge. */
    iconGlyph: 54,
    iconGap: 22,
    sectionSubTop: 8,
    dividerTop: 16,
    dividerBottom: 14,
    rowDividerGap: 14,
    rowHeight: 72,
    rowSubTop: 6,
    pillHeight: 50,
    pillPaddingX: 16,
    pillMinWidthNeutral: 94,
    pillMinWidthMint: 126,
    pillMinWidthAmber: 118,
  },

  /** Stroke weights are user units inside the sprite's own 24 viewBox, so they scale with the size
   *  the glyph is drawn at. One weight across the set is what makes the marks read as one family. */
  stroke: {
    glyph: 1.7,
  },

  type: {
    sectionTitle: 31,
    sectionSub: 20,
    rowTitle: 24,
    rowSub: 19,
    pill: 17,
    /** The package's ratios run from 1.08 to 1.28, which the design canvas can afford because CSS
     *  never clips a short line box. React Native does, and Vietnamese stacks a tone mark above a
     *  vowel diacritic — `Kỹ`, `Đề`, `ệ` — so anything under this floor cuts the marks off. */
    lineHeightFloor: 1.36,
  },
} as const

/** Canvas value to device points for the measured container. */
export function requestDetailsScale(containerWidth: number): number {
  return containerWidth / requestDetailsTokens.canvasWidth
}
