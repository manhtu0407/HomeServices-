import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as ReactNative from 'react-native'
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { UsageRankCard } from '../profile/usage-rank-card'
import { USAGE_RANK_ARTBOARD, getUsageRankCardMetrics } from '../profile/usage-rank-card-metrics'

export const PILLAR = {
  id: 'P198-customer-usage-rank-card',
  invariant:
    'The Profile usage-rank entry is the approved watercolor card: the plate is the approved file byte for byte, the title and tagline use the system serif, the status sits centered in its pill and shows only the real points label or the honest pending label, and there is no chevron button. Its lengths scale with the measured width, it stretches the plate only while it keeps its designed height and crops with a fade once it grows, it wraps instead of shrinking at large text sizes, and every decorative layer is hidden from the screen reader',
  authority: [
    'governance/RULES.md #8 (the status line is the real points label or the honest pending label)',
    'governance/RULES.md #5 (one selected language per visible screen)',
    'governance/design/accessible-content.md (text scales, status is never truncated, decorative content is hidden)',
    'governance/design/runtime.md (a calm static surface: zero glass, zero motion)',
  ],
  target: 'apps/mobile/components/customer/profile/usage-rank-card.tsx',
  layer: 'ui-visual',
  siblings: ['P192-worker-stage-nine-empty-record', 'P100-worker-stage-eight-production-fidelity'],
  mutation:
    'give the plate contentFit cover at its designed height, draw the ring overlay before the content instead of last, or drop textAlign center from the status — the plate-fit, ring-order and centered-status cases turn red',
} as const satisfies PillarManifest

const APPROVED_ART_SHA256 = 'adc5623a9205b5ac5c6cbf48d791074c17459172110a29dafc940969df556b49'
const LEAF_SHA256 = '7a8be680777362c190d4e5b62ce06485dfacdacc38886ecf30849932be899ad2'
const ROOT = 'customer-v21-profile-ranking-entry'
const SHOW_DECORATIVE = { includeHiddenElements: true } as const

const bytes = (relativePath: string) => readFileSync(resolve(__dirname, relativePath))
const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')
const layoutEvent = (width: number, height: number) => ({ nativeEvent: { layout: { height, width, x: 0, y: 0 } } })
const styleOf = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as StyleProp<TextStyle & ViewStyle>) ?? {}
const byId = (suffix: string) => screen.getByTestId(`${ROOT}-${suffix}`, SHOW_DECORATIVE)
// Only the named props, so a failing assertion prints a few values instead of a whole element tree.
const propsOf = (node: { props: Record<string, unknown> }, keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, node.props[key]]))

function setWindow(width: number, height: number, fontScale = 1) {
  ReactNative.Dimensions.set({
    screen: { fontScale, height, scale: 3, width },
    window: { fontScale, height, scale: 3, width },
  })
}

function renderCard(overrides: Partial<Parameters<typeof UsageRankCard>[0]> = {}) {
  render(
    <UsageRankCard
      statusLabel="Chưa có"
      tagline="Nhà sạch hơn · Cuộc sống tốt hơn"
      title="Xếp hạng sử dụng"
      {...overrides}
    />,
  )
}

function measure(width: number, height: number) {
  act(() => {
    fireEvent(screen.getByTestId(ROOT), 'layout', layoutEvent(width, height))
  })
}

function renderedOrder(root: unknown) {
  const ids: string[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const rendered = node as { children?: unknown[]; props?: { testID?: unknown } }
    if (typeof rendered.props?.testID === 'string') ids.push(rendered.props.testID)
    rendered.children?.forEach(visit)
  }
  visit(root)
  return ids
}

describe('Customer usage-rank card', () => {
  beforeEach(() => {
    act(() => setWindow(390, 844))
  })

  afterEach(() => {
    act(() => setWindow(390, 844))
  })

  it('ships the approved plate byte for byte and a transparent leaf cut from the same reference', () => {
    const plate = bytes('../../../assets/customer-usage-rank/usage-rank-art.png')
    const leaf = bytes('../../../assets/customer-usage-rank/usage-rank-leaf.png')

    withPillarContext(PILLAR, () => {
      expect(sha256(plate)).toBe(APPROVED_ART_SHA256)
      expect(sha256(leaf)).toBe(LEAF_SHA256)
      // IHDR: width, height, then colour type 6 = truecolour with alpha.
      expect([leaf.readUInt32BE(16), leaf.readUInt32BE(20), leaf.readUInt8(25)]).toEqual([179, 185, 6])
      expect([plate.readUInt32BE(16), plate.readUInt32BE(20)]).toEqual([770, 694])
    }, 'the plate is the visual anchor of the approved design and must not be redrawn or recompressed')
  })

  it('keeps the artboard proportions and scales every length with the measured width', () => {
    const phone = getUsageRankCardMetrics(358)
    const doubled = getUsageRankCardMetrics(716)

    withPillarContext(PILLAR, () => {
      expect(phone.card.minHeight / 358).toBeCloseTo(USAGE_RANK_ARTBOARD.height / USAGE_RANK_ARTBOARD.width, 3)
      expect(phone.card.radius / 358).toBeCloseTo(75 / 1505, 3)
      expect(phone.art.width / 358).toBeCloseTo(770 / 1505, 3)
      expect(phone.content.left / 358).toBeCloseTo(817 / 1505, 3)
      expect(doubled.card.minHeight).toBeCloseTo(phone.card.minHeight * 2, 1)
      expect(doubled.pill.minWidth).toBeCloseTo(phone.pill.minWidth * 2, 1)
      // Type follows a capped width, so a tablet does not inflate it.
      expect(doubled.title.fontSize).toBeLessThan(phone.title.fontSize * 2)
      expect(getUsageRankCardMetrics(900).title.fontSize).toBe(getUsageRankCardMetrics(520).title.fontSize)
    })
  })

  it('keeps the tagline readable and stacks it only when the column is too narrow for one line', () => {
    withPillarContext(PILLAR, () => {
      expect(getUsageRankCardMetrics(288).tagline.fontSize).toBeGreaterThanOrEqual(10)
      expect(getUsageRankCardMetrics(358).tagline.stacked).toBe(true)
      expect(getUsageRankCardMetrics(640).tagline.stacked).toBe(false)
    })
  })

  it('renders the approved anatomy with the real labels and no chevron button', () => {
    renderCard()
    measure(358, 171)

    withPillarContext(PILLAR, () => {
      expect(byId('art')).toBeOnTheScreen()
      expect(byId('leaf')).toBeOnTheScreen()
      expect(byId('accent')).toBeOnTheScreen()
      expect(byId('title')).toHaveTextContent('Xếp hạng sử dụng')
      expect(byId('points')).toHaveTextContent('Chưa có')
      expect(byId('tagline')).toHaveTextContent(/Nhà sạch hơn/)
      expect(byId('tagline')).toHaveTextContent(/Cuộc sống tốt hơn/)
      expect(screen.queryByTestId(`${ROOT}-chevron`, SHOW_DECORATIVE)).toBeNull()
    })
  })

  it('shows a long real label in full instead of inventing a shorter one', () => {
    renderCard({ statusLabel: '1.000 / 1.000 điểm' })

    withPillarContext(PILLAR, () => {
      expect(byId('points')).toHaveTextContent('1.000 / 1.000 điểm')
    })
  })

  it('stretches the plate at its designed height and crops it with a fade once the card grows tall', () => {
    renderCard()
    const designed = getUsageRankCardMetrics(358).card.minHeight

    measure(358, designed)
    withPillarContext(PILLAR, () => {
      expect(byId('art').props.contentFit).toBe('fill')
      expect(screen.queryByTestId(`${ROOT}-art-fade`, SHOW_DECORATIVE)).toBeNull()
    })

    measure(358, Math.round(designed * 1.4))
    withPillarContext(PILLAR, () => {
      expect(byId('art').props.contentFit).toBe('cover')
      expect(byId('art-fade')).toBeOnTheScreen()
    })
  })

  it('draws the border ring last so it covers the border baked into the plate', () => {
    renderCard()
    const order = renderedOrder(screen.getByTestId(ROOT))

    withPillarContext(PILLAR, () => {
      const ring = order.indexOf(`${ROOT}-ring`)
      expect(ring).toBeGreaterThan(-1)
      for (const layer of ['art', 'leaf', 'accent', 'title', 'status-pill', 'points', 'tagline']) {
        expect(order.indexOf(`${ROOT}-${layer}`)).toBeLessThan(ring)
      }
      expect(styleOf(byId('ring'))).toMatchObject({ borderWidth: getUsageRankCardMetrics(390 - 32).card.ring })
    })
  })

  it('centers the status on both axes inside its pill', () => {
    renderCard()
    measure(358, 171)

    withPillarContext(PILLAR, () => {
      expect(styleOf(byId('status-pill'))).toMatchObject({ alignItems: 'center', justifyContent: 'center' })
      expect(styleOf(byId('points'))).toMatchObject({ includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center' })
    })
  })

  it('sets title and tagline in the system serif and the status in the system sans, with no bundled font', () => {
    renderCard()

    withPillarContext(PILLAR, () => {
      expect(styleOf(byId('title')).fontFamily).toBe('ui-serif')
      expect(styleOf(byId('tagline'))).toMatchObject({ fontFamily: 'ui-serif', fontStyle: 'italic' })
      expect(styleOf(byId('points')).fontFamily).toBeUndefined()
    }, 'the design system embeds no font files, so the serif must be the platform face')
  })

  it('scales with the measured width', () => {
    renderCard()

    measure(358, 171)
    const phoneTitle = styleOf(byId('title')).fontSize as number
    measure(288, 140)
    const smallTitle = styleOf(byId('title')).fontSize as number

    withPillarContext(PILLAR, () => {
      expect(phoneTitle).toBeCloseTo(getUsageRankCardMetrics(358).title.fontSize, 1)
      expect(smallTitle).toBeCloseTo(getUsageRankCardMetrics(288).title.fontSize, 1)
      expect(smallTitle).toBeLessThan(phoneTitle)
    })
  })

  it('shrinks to fit on one line at normal text size and wraps with a growing card at large text sizes', () => {
    renderCard({ statusLabel: '620 / 1.000 điểm' })

    withPillarContext(PILLAR, () => {
      for (const part of ['title', 'points']) {
        expect(propsOf(byId(part), ['adjustsFontSizeToFit', 'numberOfLines'])).toEqual({ adjustsFontSizeToFit: true, numberOfLines: 1 })
      }
    })
    screen.unmount()

    act(() => setWindow(390, 844, 1.5))
    renderCard({ statusLabel: '620 / 1.000 điểm' })

    withPillarContext(PILLAR, () => {
      for (const part of ['title', 'points']) {
        expect(propsOf(byId(part), ['adjustsFontSizeToFit', 'numberOfLines'])).toEqual({ adjustsFontSizeToFit: false, numberOfLines: 2 })
      }
      // The card can only grow: its designed height is a minimum, never a fixed height.
      expect(styleOf(screen.getByTestId(`${ROOT}-title`).parent as never)).not.toHaveProperty('height')
    }, 'a status must wrap rather than be cut off or shrunk out of reach')
  })

  it('caps how far system text scaling can push the fixed composition', () => {
    renderCard()

    withPillarContext(PILLAR, () => {
      expect(byId('title').props.maxFontSizeMultiplier).toBe(1.3)
      expect(byId('points').props.maxFontSizeMultiplier).toBe(1.3)
      expect(byId('tagline').props.maxFontSizeMultiplier).toBe(1.15)
    })
  })

  it('hides every decorative layer from the screen reader', () => {
    renderCard()

    withPillarContext(PILLAR, () => {
      for (const layer of ['accent', 'meta']) {
        expect(propsOf(byId(layer), ['accessibilityElementsHidden', 'importantForAccessibility'])).toEqual({
          accessibilityElementsHidden: true,
          importantForAccessibility: 'no-hide-descendants',
        })
      }
      for (const image of ['art', 'leaf']) {
        expect(propsOf(byId(image), ['accessibilityIgnoresInvertColors', 'accessible'])).toEqual({
          accessibilityIgnoresInvertColors: true,
          accessible: false,
        })
      }
      // Real content stays in the accessibility tree.
      expect(screen.getByTestId(`${ROOT}-title`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${ROOT}-points`)).toBeOnTheScreen()
    })
  })

  it('is a calm opaque surface: solid white, no glass, no animation', () => {
    renderCard()

    withPillarContext(PILLAR, () => {
      const frame = styleOf(screen.getByTestId(ROOT))
      expect(frame.backgroundColor).toBe('#FFFFFF')
      expect(frame).not.toHaveProperty('opacity')
      expect(JSON.stringify(frame)).not.toMatch(/blur|backdrop/i)
    })
  })
})
