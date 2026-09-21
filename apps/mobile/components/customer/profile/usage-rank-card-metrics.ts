// Geometry of the usage-rank card, authored on the approved 1505 x 694 artboard. Lengths scale
// with the measured card width so the composition holds on any phone; type scales on a capped
// width so a tablet does not inflate it.

export const USAGE_RANK_ARTBOARD = { height: 694, width: 1505 } as const

const TYPE_WIDTH_CAP = 520
// A 10pt tagline on one line needs about this much column; a narrower column stacks it on two lines.
const TAGLINE_ONE_LINE_COLUMN = 210
// The leaf asset is cropped tight, so its height follows the file's own aspect ratio.
const LEAF_ASPECT = 185 / 179

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const round = (value: number) => Math.round(value * 100) / 100

// The card is an illustrated paper surface with an opaque watercolor plate, so it keeps these
// colors in dark mode too: every text color below is chosen for contrast on white.
export const usageRankCardColors = {
  accent: '#A4D2BF',
  border: 'rgba(218,231,226,0.9)',
  shadow: 'rgba(84,120,107,0.10)',
  shadowSoft: 'rgba(84,120,107,0.05)',
  status: '#2E866D',
  statusRing: 'rgba(224,237,230,0.94)',
  statusSurface: '#EDF5F0',
  surface: '#FFFFFF',
  tagline: '#97A7A1',
  taglineRule: '#D2E1DB',
  title: '#11322D',
} as const

export function getUsageRankCardMetrics(cardWidth: number) {
  const width = Math.max(cardWidth, 1)
  const unit = width / USAGE_RANK_ARTBOARD.width
  const type = Math.min(width, TYPE_WIDTH_CAP) / USAGE_RANK_ARTBOARD.width
  const taglineSize = clamp(24 * type, 10, 14)
  const titleSize = clamp(79 * type, 16, 40)
  const statusSize = clamp(71 * type, 14, 36)
  const leafWidth = 176 * unit

  return {
    accent: { gap: round(41 * unit), height: round(Math.max(2, 11 * unit)), width: round(92 * unit) },
    art: { width: round(770 * unit) },
    card: {
      minHeight: round(USAGE_RANK_ARTBOARD.height * unit),
      radius: round(75 * unit),
      ring: round(Math.max(1, 4 * unit)),
      shadow: [
        `0px ${round(20 * unit)}px ${round(48 * unit)}px ${usageRankCardColors.shadow}`,
        `0px ${round(58 * unit)}px ${round(88 * unit)}px ${usageRankCardColors.shadowSoft}`,
      ].join(', '),
    },
    content: { bottom: round(58 * unit), left: round(817 * unit), right: round(56 * unit), top: round(159 * unit) },
    leaf: { height: round(leafWidth * LEAF_ASPECT), right: round(10 * unit), top: round(46 * unit), width: round(leafWidth) },
    pill: {
      marginTop: round(47 * unit),
      minHeight: round(130 * unit),
      minWidth: round(424 * unit),
      paddingHorizontal: round(43 * unit),
      radius: round(48 * unit),
      ring: round(Math.max(0.5, unit)),
      status: {
        fontSize: round(statusSize),
        letterSpacing: round(-2.1 * type),
        lineHeight: Math.round(statusSize * 1.2),
      },
    },
    tagline: {
      fontSize: round(taglineSize),
      gap: round(Math.max(10, 95 * unit * 0.4)),
      letterSpacing: round(Math.min(4.65 * type, 1.4)),
      lineHeight: Math.round(taglineSize * 1.3),
      ruleGap: round(24 * unit),
      ruleHeight: round(Math.max(1, 3 * unit)),
      ruleWidth: round(48 * unit),
      // Shrinking the line below 10pt would make it unreadable, so a narrow column stacks it instead.
      stacked: (USAGE_RANK_ARTBOARD.width - 817 - 56) * unit < TAGLINE_ONE_LINE_COLUMN,
    },
    title: {
      fontSize: round(titleSize),
      letterSpacing: round(-2.05 * type),
      lineHeight: Math.round(titleSize * 1.16),
    },
    unit,
  }
}

export type UsageRankCardMetrics = ReturnType<typeof getUsageRankCardMetrics>
