import React from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import { STAGE_REFERENCE_SCALE, stageFontSize, stageLineHeight } from '../stage-ratio'
import { RequestDetailsIcon, RequestDetailsSurface } from './request-details-icons'
import { requestDetailsScale, requestDetailsTokens as t } from './request-details-tokens'
import type {
  RequestDetailsGroup,
  RequestDetailsIconName,
  RequestDetailsNote,
  RequestDetailsPillTone,
  RequestDetailsRow,
} from './request-details.types'

const C = t.color
const G = t.geometry

const PILL_MIN_WIDTH: Record<RequestDetailsPillTone, number> = {
  amber: G.pillMinWidthAmber,
  mint: G.pillMinWidthMint,
  neutral: G.pillMinWidthNeutral,
}

const PILL_TEXT: Record<RequestDetailsPillTone, string> = {
  amber: C.pillAmberText,
  mint: C.pillMintText,
  neutral: C.pillNeutralText,
}

const PILL_SURFACE = {
  amber: 'pillAmber',
  mint: 'pillMint',
  neutral: 'pillNeutral',
} as const

type Scale = {
  ft: (n: number) => number
  lh: (n: number, ratio: number) => number
  px: (n: number) => number
}

/**
 * Stage 2 · Chi tiết yêu cầu — the section cards, approved layout.
 *
 * A section owns one card: its icon, title and description sit inside the same surface as its rows,
 * so the header is part of the group rather than a heading floating above a separate list. Nothing
 * frames a glyph, so every mark starts at the card's content edge, and the closing note is the same
 * card with a header and no rows. Geometry scales from the measured container against the card
 * canvas; type resolves through `stage-ratio.ts` against the window, so the host's padding moves
 * the layout without moving text.
 */
export function WorkerRequestDetailsSections({
  groups,
  note,
}: {
  groups: readonly RequestDetailsGroup[]
  note?: RequestDetailsNote
}) {
  const { width: windowWidth } = useWindowDimensions()
  const [measured, setMeasured] = React.useState(0)
  const container = measured || windowWidth
  const s = requestDetailsScale(container)
  const px = (n: number) => n * s
  const ft = (n: number) => stageFontSize(n, STAGE_REFERENCE_SCALE.requestDetails, windowWidth)
  const lh = (n: number, ratio: number) => stageLineHeight(ft(n), Math.max(ratio, t.type.lineHeightFloor))
  const scale: Scale = { ft, lh, px }

  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width
        if (next > 0 && Math.abs(next - measured) > 0.5) setMeasured(next)
      }}
      style={{ gap: px(G.cardSpacing) }}
      testID="worker-v5-offer-section-stack"
    >
      {groups.map((group) => (
        <Card key={group.key} px={px} testID={group.testID}>
          <CardHeader description={group.description} icon={group.icon} scale={scale} title={group.title} />
          <View style={[styles.rule, { marginBottom: px(G.dividerBottom), marginTop: px(G.dividerTop) }]} />
          {group.rows.map((row, index) => (
            <React.Fragment key={row.key}>
              {index > 0 ? <View style={[styles.rule, { marginVertical: px(G.rowDividerGap) }]} /> : null}
              <StatusRow row={row} scale={scale} />
            </React.Fragment>
          ))}
        </Card>
      ))}

      {note ? (
        <Card px={px} testID={note.testID}>
          <CardHeader description={note.description} icon={note.icon} scale={scale} title={note.title} />
        </Card>
      ) : null}
    </View>
  )
}

function Card({
  children,
  px,
  testID,
}: {
  children: React.ReactNode
  px: (n: number) => number
  testID: string
}) {
  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: px(G.cardRadius),
          paddingBottom: px(G.cardPaddingBottom),
          paddingHorizontal: px(G.cardPaddingX),
          paddingTop: px(G.cardPaddingTop),
        },
      ]}
      testID={testID}
    >
      {children}
    </View>
  )
}

function CardHeader({
  description,
  icon,
  scale: { ft, lh, px },
  title,
}: {
  description: string
  icon: RequestDetailsIconName
  scale: Scale
  title: string
}) {
  return (
    <View style={[styles.groupHeader, { gap: px(G.iconGap) }]}>
      <RequestDetailsIcon color={C.mintIcon} name={icon} size={px(G.iconGlyph)} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: C.sectionTitle, fontSize: ft(t.type.sectionTitle), fontWeight: '500', letterSpacing: -0.5, lineHeight: lh(t.type.sectionTitle, 1.08) }}>
          {title}
        </Text>
        <Text style={{ color: C.sectionSub, fontSize: ft(t.type.sectionSub), fontWeight: '500', letterSpacing: -0.1, lineHeight: lh(t.type.sectionSub, 1.24), marginTop: px(G.sectionSubTop) }}>
          {description}
        </Text>
      </View>
    </View>
  )
}

function StatusRow({ row, scale: { ft, lh, px } }: { row: RequestDetailsRow; scale: Scale }) {
  const pillRadius = px(G.pillHeight) / 2

  return (
    <View style={[styles.row, { gap: px(G.iconGap), minHeight: px(G.rowHeight) }]} testID={row.testID}>
      <RequestDetailsIcon color={C.mintIcon} name={row.icon} size={px(G.iconGlyph)} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ color: C.rowTitle, fontSize: ft(t.type.rowTitle), fontWeight: '500', letterSpacing: -0.34, lineHeight: lh(t.type.rowTitle, 1.13) }}>
          {row.title}
        </Text>
        {row.meta ? (
          <Text numberOfLines={2} style={{ color: C.rowSub, fontSize: ft(t.type.rowSub), fontWeight: '500', letterSpacing: -0.08, lineHeight: lh(t.type.rowSub, 1.28), marginTop: px(G.rowSubTop) }}>
            {row.meta}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.pill,
          {
            borderRadius: pillRadius,
            minHeight: px(G.pillHeight),
            minWidth: px(PILL_MIN_WIDTH[row.tone]),
            paddingHorizontal: px(G.pillPaddingX),
          },
        ]}
      >
        <RequestDetailsSurface id={`stage2-${row.key}-pill`} kind={PILL_SURFACE[row.tone]} radius={pillRadius} />
        <Text numberOfLines={1} style={{ color: PILL_TEXT[row.tone], fontSize: ft(t.type.pill), fontWeight: '600', letterSpacing: -0.16, zIndex: 1 }}>
          {row.status}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    boxShadow: '0 6px 14px rgba(92, 139, 137, 0.105)',
  },
  groupHeader: { alignItems: 'center', flexDirection: 'row' },
  pill: { alignItems: 'center', flexShrink: 0, justifyContent: 'center', overflow: 'hidden' },
  row: { alignItems: 'center', flexDirection: 'row' },
  rule: { backgroundColor: C.line, height: 1 },
})
