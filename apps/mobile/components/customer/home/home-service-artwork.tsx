import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg'

import type { CustomerServiceId } from '@nestscout/shared'

type HomeServiceArtworkProps = {
  accent: string
  ink: string
  primary: string
  service: CustomerServiceId
  size: number
  soft: string
}

type ArtworkPalette = {
  accent: string
  ink: string
  primary: string
  soft: string
  surface: string
}

const VIEWBOX = '0 0 240 160'

export function HomeServiceArtwork({ accent, ink, primary, service, size, soft }: HomeServiceArtworkProps) {
  const palette: ArtworkPalette = { accent, ink, primary, soft, surface: '#F7FFFB' }
  const line = { stroke: palette.ink, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 3.5 }

  return (
    <Svg height={size * 0.67} pointerEvents="none" viewBox={VIEWBOX} width={size}>
      <Ellipse cx="120" cy="93" fill={palette.soft} opacity={0.58} rx="94" ry="48" />
      <G>
        {service === 'electrical' ? <ElectricalArtwork line={line} palette={palette} /> : null}
        {service === 'plumbing' ? <PlumbingArtwork line={line} palette={palette} /> : null}
        {service === 'home_cleaning' ? <CleaningArtwork line={line} palette={palette} /> : null}
        {service === 'hvac_basic_maintenance' ? <HvacArtwork line={line} palette={palette} /> : null}
        {service === 'upholstery_care' ? <UpholsteryArtwork line={line} palette={palette} /> : null}
        {service === 'handyman_minor_installation' ? <HandymanArtwork line={line} palette={palette} /> : null}
      </G>
    </Svg>
  )
}

function ElectricalArtwork({ line, palette }: { line: object; palette: ArtworkPalette }) {
  return (
    <>
      <Rect fill={palette.soft} height="70" rx="14" stroke={palette.ink} strokeWidth="3.5" width="70" x="51" y="48" />
      <Rect fill={palette.surface} height="45" rx="8" stroke={palette.ink} strokeWidth="3.5" width="34" x="69" y="61" />
      <Circle cx="81" cy="76" fill={palette.primary} r="5" {...line} />
      <Circle cx="94" cy="76" fill={palette.primary} r="5" {...line} />
      <Path d="M165 36 143 78h22l-18 47 46-64h-23l15-25Z" fill={palette.accent} {...line} />
    </>
  )
}

function PlumbingArtwork({ line, palette }: { line: object; palette: ArtworkPalette }) {
  return (
    <>
      <Path d="M58 93V78h103v15" fill={palette.soft} {...line} />
      <Path d="M87 78V47h31c16 0 24 9 24 24v7" fill="none" {...line} />
      <Line x1="142" x2="167" y1="78" y2="78" {...line} />
      <Path d="M167 78v13" fill="none" {...line} />
      <Path d="M153 108c0-11 14-25 14-25s14 14 14 25c0 9-6 15-14 15s-14-6-14-15Z" fill={palette.primary} opacity={0.78} {...line} />
      <Path d="M74 108h91" fill="none" stroke={palette.ink} strokeLinecap="round" strokeWidth="5" />
    </>
  )
}

function CleaningArtwork({ line, palette }: { line: object; palette: ArtworkPalette }) {
  return (
    <>
      <Path d="M64 57h35l7 14v49H58V71l6-14Z" fill={palette.soft} {...line} />
      <Path d="M71 57v-9h22v9M100 71h17l8 12" fill="none" {...line} />
      <Path d="M116 83h18" fill="none" {...line} />
      <Circle cx="75" cy="83" fill={palette.primary} r="5" />
      <Path d="M77 98h18M77 108h28" fill="none" stroke={palette.ink} strokeLinecap="round" strokeWidth="3.5" />
      <Path d="M147 76h32l-5 43h-32l5-43Z" fill={palette.primary} opacity={0.84} {...line} />
      <Path d="M151 76c2-13 9-19 18-19h13" fill="none" {...line} />
      <Path d="M181 57h16" fill="none" {...line} />
      <Path d="M155 84h23M153 94h23M152 104h22" fill="none" stroke={palette.surface} strokeLinecap="round" strokeWidth="3" />
    </>
  )
}

function HvacArtwork({ line, palette }: { line: object; palette: ArtworkPalette }) {
  return (
    <>
      <Rect fill={palette.soft} height="53" rx="14" stroke={palette.ink} strokeWidth="3.5" width="154" x="43" y="48" />
      <Path d="M59 84h122" fill="none" stroke={palette.ink} strokeLinecap="round" strokeWidth="3.5" />
      <Path d="m76 97 14 17M101 97l14 17M126 97l14 17M151 97l14 17" fill="none" stroke={palette.primary} strokeLinecap="round" strokeWidth="4" />
      <Path d="M73 64h96" fill="none" stroke={palette.surface} strokeLinecap="round" strokeWidth="7" />
      <Circle cx="181" cy="65" fill={palette.accent} r="5" {...line} />
    </>
  )
}

function UpholsteryArtwork({ line, palette }: { line: object; palette: ArtworkPalette }) {
  return (
    <>
      <Path d="M61 81c0-13 10-23 23-23h72c13 0 23 10 23 23v35H61V81Z" fill={palette.soft} {...line} />
      <Path d="M70 81h100v35H70V81Z" fill={palette.surface} {...line} />
      <Path d="M79 116v17M161 116v17" fill="none" {...line} />
      <Path d="M87 69v27M153 69v27" fill="none" stroke={palette.primary} strokeLinecap="round" strokeWidth="4" />
      <Path d="m118 74 4 9 10 1-8 7 3 10-9-5-9 5 3-10-8-7 10-1 4-9Z" fill={palette.accent} stroke={palette.ink} strokeLinejoin="round" strokeWidth="2.5" />
    </>
  )
}

function HandymanArtwork({ line, palette }: { line: object; palette: ArtworkPalette }) {
  return (
    <>
      <Path d="M56 57h93c11 0 20 9 20 20v29H56V57Z" fill={palette.soft} {...line} />
      <Path d="M74 106h54v28H74z" fill={palette.primary} opacity={0.9} {...line} />
      <Path d="M128 67h31l18 14v12h-49V67Z" fill={palette.primary} {...line} />
      <Path d="M177 81h28v12h-28M205 87h19" fill="none" {...line} />
      <Path d="M88 63h28v14H88z" fill={palette.surface} {...line} />
      <Path d="M89 134h53" fill="none" stroke={palette.ink} strokeLinecap="round" strokeWidth="5" />
      <Circle cx="155" cy="87" fill={palette.accent} r="6" {...line} />
    </>
  )
}
