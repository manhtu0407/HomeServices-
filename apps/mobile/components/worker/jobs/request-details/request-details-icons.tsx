import React from 'react'
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg'

import { requestDetailsTokens as t } from './request-details-tokens'
import type { RequestDetailsIconName } from './request-details.types'

/** Stage 2 · Chi tiết yêu cầu — icon set.
 *
 * One system rather than the approved package's sprite. That sprite mixes filled and stroked marks
 * and draws each shape to whatever width it wanted, so ink left edges ran from 3.0 to 6.75 inside
 * the same 24 box: at row size the column reads ragged and the marks read as different sizes even
 * though every box is identical. Every glyph here is stroked at one weight and drawn to the same
 * ink square — x and y inside [3.5, 20.6] — so the boxes and the ink line up together, and each
 * mark is chosen for what its row actually says. */
const INK: Record<RequestDetailsIconName, React.ReactNode> = {
  /** Yêu cầu — the request form the customer filed. */
  clipboard: (
    <>
      <Rect height={15.2} rx={2.6} width={15.6} x={4.2} y={5.2} />
      <Path d="M9 5.2V4.3a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 4.3v.9" />
      <Path d="M8.4 10.6h7.2M8.4 13.8h7.2M8.4 17h4.4" />
    </>
  ),
  /** Mô tả / vấn đề khách nêu — what the customer said. */
  bubble: (
    <>
      <Path d="M12 3.9c4.4 0 8 2.85 8 6.55s-3.6 6.55-8 6.55c-.8 0-1.58-.1-2.3-.28L5.2 20.1l1.15-3.35C4.9 15.55 4 13.2 4 10.45 4 6.75 7.6 3.9 12 3.9Z" />
      <Path d="M9 9.7h6M9 12.6h4" />
    </>
  ),
  /** Loại dịch vụ — the trade the job belongs to. */
  wrench: (
    <Path d="M14.79 4.44a4.14 4.14 0 0 0-3.68 5.635l-5.75 5.75a1.955 1.955 0 0 0 2.76 2.76l5.75-5.75a4.14 4.14 0 0 0 5.635-3.68l-2.415 1.495-2.53-.69-.69-2.53 1.495-2.415Z" />
  ),
  /** Ảnh hiện trạng từ khách. */
  photo: (
    <>
      <Rect height={14} rx={2.6} width={16.2} x={3.9} y={5} />
      <Circle cx={8.6} cy={9.8} r={1.4} />
      <Path d="m4.6 16.6 4.3-4.3 3 2.7 2.6-2.6 4.6 4.2" />
    </>
  ),
  /** Địa chỉ & khách hàng — where the job is. */
  map: (
    <>
      <Path d="M3.9 6.9 9.3 4.6v12.5l-5.4 2.3V6.9Z" />
      <Path d="M9.3 4.6l5.4 2.3v12.5L9.3 17.1V4.6Z" />
      <Path d="M14.7 6.9l5.4-2.3v12.5l-5.4 2.3V6.9Z" />
    </>
  ),
  /** Điểm hẹn — the address itself. */
  home: (
    <>
      <Path d="m3.9 10.9 8.1-6.9 8.1 6.9" />
      <Path d="M5.9 10.1v9h12.2v-9" />
      <Path d="M9.9 19.1v-4.9h4.2v4.9" />
    </>
  ),
  /** Khách hàng trong ứng dụng. */
  user: (
    <>
      <Circle cx={12} cy={8.6} r={4} />
      <Path d="M4.4 20.2a7.6 7.6 0 0 1 15.2 0" />
    </>
  ),
  /** Giá dịch vụ & tiền công — the money the job carries. */
  coins: (
    <>
      <Ellipse cx={12} cy={6} rx={7.6} ry={2.9} />
      <Path d="M4.4 6v4.8c0 1.6 3.4 2.9 7.6 2.9s7.6-1.3 7.6-2.9V6" />
      <Path d="M4.4 10.8v4.8c0 1.6 3.4 2.9 7.6 2.9s7.6-1.3 7.6-2.9v-4.8" />
    </>
  ),
  /** Báo giá — the quote attached to the job. */
  tag: (
    <>
      <Path d="M11.6 3.9h7.1a1.6 1.6 0 0 1 1.6 1.6v7.1a1.6 1.6 0 0 1-.47 1.13l-6.5 6.5a1.6 1.6 0 0 1-2.26 0l-7.1-7.1a1.6 1.6 0 0 1 0-2.26l6.5-6.5a1.6 1.6 0 0 1 1.13-.47Z" />
      <Circle cx={16.2} cy={7.8} r={1.5} />
    </>
  ),
  /** Khách trả — the amount the customer pays. */
  banknote: (
    <>
      <Rect height={12.4} rx={2.6} width={17} x={3.5} y={5.8} />
      <Circle cx={12} cy={12} r={2.8} />
      <Path d="M7.2 10.2v3.6M16.8 10.2v3.6" />
    </>
  ),
  /** Bạn nhận — what lands in the worker's wallet. */
  wallet: (
    <>
      <Rect height={13} rx={2.6} width={16.8} x={3.6} y={5.6} />
      <Path d="M3.6 9.8h16.8" />
      <Path d="M14.6 12.6h5.8v3.6h-5.8a1.8 1.8 0 0 1 0-3.6Z" />
    </>
  ),
  /** Kael đã đối chiếu giá. */
  check: (
    <>
      <Circle cx={12} cy={12} r={8.4} />
      <Path d="m7.9 12.1 2.7 2.7 5.5-5.9" />
    </>
  ),
  /** Thời gian đến — the arrival window still being measured. */
  clock: (
    <>
      <Circle cx={12} cy={12} r={8.4} />
      <Path d="M12 6.9V12l3.6 2.2" />
    </>
  ),
  /** Sẵn sàng nhận việc — the job itself. */
  briefcase: (
    <>
      <Rect height={12.4} rx={2.6} width={16.4} x={3.8} y={7.4} />
      <Path d="M8.8 7.4V5.6a1.8 1.8 0 0 1 1.8-1.8h2.8a1.8 1.8 0 0 1 1.8 1.8v1.8" />
      <Path d="M3.8 12h16.4" />
      <Path d="M10.4 12v1.8h3.2V12" />
    </>
  ),
  /** Đề nghị còn mở — the offer sent to the worker. */
  envelope: (
    <>
      <Rect height={14} rx={2.4} width={16.6} x={3.7} y={5} />
      <Path d="m4.7 7 7.3 5.6 7.3-5.6" />
    </>
  ),
  /** Kỹ năng & giấy tờ phù hợp. */
  shieldCheck: (
    <>
      <Path d="M12 3.6l7.3 2.45v5.95c0 4.3-2.9 7.75-7.3 9.2-4.4-1.45-7.3-4.9-7.3-9.2V6.05L12 3.6Z" />
      <Path d="m8.7 12.2 2.4 2.4 3.9-4.2" />
    </>
  ),
  /** Địa chỉ & thanh toán bảo vệ. */
  lock: (
    <>
      <Rect height={10.4} rx={2.6} width={15.2} x={4.4} y={10} />
      <Path d="M8 10V7.6a4 4 0 0 1 8 0V10" />
      <Path d="M12 14v2.6" />
    </>
  ),
  /** Giá và tiền công đã khóa — the settled receipt. */
  receipt: (
    <>
      <Path d="M4.6 3.7h14.8v17l-2.47-1.5-2.47 1.5-2.46-1.5-2.47 1.5-2.47-1.5L4.6 20.7V3.7Z" />
      <Path d="M8.4 8.6h7.2M8.4 12.2h4.8" />
    </>
  ),
}

export function RequestDetailsIcon({
  color,
  name,
  size,
}: {
  color: string
  name: RequestDetailsIconName
  size: number
}) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <G stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={t.stroke.glyph}>
        {INK[name]}
      </G>
    </Svg>
  )
}

const SURFACE_STOPS = {
  pillAmber: ['#FBF0DC', '#F9ECD8'],
  pillMint: ['#E4F8F2', '#DFF7F1'],
  pillNeutral: ['#F0F4F7', '#EBF1F5'],
} as const

export type RequestDetailsSurfaceKind = keyof typeof SURFACE_STOPS

/** Fills the parent with one of the package's vertical washes; the approved build layers CSS
 *  gradients that have no react-native style equivalent. */
export function RequestDetailsSurface({
  id,
  kind,
  radius,
}: {
  id: string
  kind: RequestDetailsSurfaceKind
  radius: number
}) {
  const [from, to] = SURFACE_STOPS[kind]
  return (
    <Svg
      height="100%"
      pointerEvents="none"
      preserveAspectRatio="none"
      style={fillLayer}
      width="100%"
    >
      <Defs>
        <LinearGradient id={id} x1="0%" x2="0%" y1="0%" y2="100%">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect fill={'url(#' + id + ')'} height="100%" rx={radius} width="100%" />
    </Svg>
  )
}

const fillLayer = { left: 0, position: 'absolute', top: 0 } as const
