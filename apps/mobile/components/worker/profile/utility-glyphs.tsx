import Svg, { Circle, Path, Rect } from 'react-native-svg'

import { color } from '@/design/theme'

import { useWorkerThemeMode } from '../worker-theme'

export type WorkerV5UtilityGlyphName =
  | 'bell'
  | 'briefcase'
  | 'check'
  | 'chat'
  | 'clock'
  | 'document'
  | 'globe'
  | 'jobs'
  | 'lock'
  | 'map'
  | 'memory'
  | 'palette'
  | 'person'
  | 'shield'
  | 'tools'

function useWorkerUtilityGlyphStroke() {
  const workerThemeMode = useWorkerThemeMode()
  return workerThemeMode === 'dark' ? '#63E6D0' : color.brand.primary
}

export function WorkerV5UtilityGlyph({ name, size = 22, testID }: { name: WorkerV5UtilityGlyphName; size?: number; testID?: string }) {
  const stroke = useWorkerUtilityGlyphStroke()
  const common = {
    fill: 'none' as const,
    stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.55,
  }

  switch (name) {
    case 'bell':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Path {...common} d="M5 13.8h10l-1.2-1.8V8.6a3.8 3.8 0 0 0-7.6 0V12L5 13.8ZM8.2 16a2 2 0 0 0 3.6 0" /></Svg>
    case 'briefcase':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Rect {...common} height={10.5} rx={2} width={14.8} x={2.6} y={6.3} /><Path {...common} d="M7.2 6.3V4.7c0-.9.7-1.6 1.6-1.6h2.4c.9 0 1.6.7 1.6 1.6v1.6M2.6 10.2h14.8" /></Svg>
    case 'check':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Circle {...common} cx={10} cy={10} r={7.2} /><Path {...common} d="m6.5 10 2.2 2.2 4.8-4.7" /></Svg>
    case 'chat':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Path {...common} d="M4.4 4.1h11.2a2 2 0 0 1 2 2v6.1a2 2 0 0 1-2 2H9.4l-3.6 2.1v-2.1h-1.4a2 2 0 0 1-2-2V6.1a2 2 0 0 1 2-2Z" /><Path {...common} d="M6.3 9.2h.1M9.9 9.2h.1M13.5 9.2h.1" /></Svg>
    case 'clock':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Circle {...common} cx={10} cy={10} r={7.2} /><Path {...common} d="M10 6v4l2.8 1.7" /></Svg>
    case 'document':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Path {...common} d="M5.2 2.8h6l3.6 3.6v10.8H5.2V2.8Z" /><Path {...common} d="M11.2 2.8v3.6h3.6M7.7 10h4.6M7.7 13h4.6" /></Svg>
    case 'globe':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Circle {...common} cx={10} cy={10} r={7.2} /><Path {...common} d="M2.8 10h14.4M10 2.8c2 1.9 3 4.3 3 7.2s-1 5.3-3 7.2c-2-1.9-3-4.3-3-7.2s1-5.3 3-7.2Z" /></Svg>
    case 'jobs':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Path {...common} d="m3.2 14.8 4-4 2.8 2.1 6.8-6" /><Path {...common} d="M13.8 6.9h3v3" /></Svg>
    case 'lock':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Rect {...common} height={8.4} rx={1.8} width={12.8} x={3.6} y={8.2} /><Path {...common} d="M6.5 8.2V6a3.5 3.5 0 0 1 7 0v2.2" /></Svg>
    case 'map':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Path {...common} d="M10 17.2s5-4.8 5-9a5 5 0 0 0-10 0c0 4.2 5 9 5 9Z" /><Circle {...common} cx={10} cy={8.2} r={1.8} /></Svg>
    case 'memory':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Path {...common} d="m10 2.8 6.3 3.6v7.2L10 17.2l-6.3-3.6V6.4L10 2.8Z" /><Path {...common} d="m3.7 6.4 6.3 3.7 6.3-3.7M10 10.1v7.1" /></Svg>
    case 'palette':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Path {...common} d="M10 3a7 7 0 0 0 0 14h1.2c.8 0 1.4-.6 1.4-1.4 0-.7-.5-1.3-.2-1.8.2-.4.7-.6 1.2-.6h.5A3.9 3.9 0 0 0 18 9.3C17.7 5.8 14.2 3 10 3Z" /><Circle fill={stroke} cx={6.5} cy={8} r={.7} /><Circle fill={stroke} cx={9.5} cy={6.4} r={.7} /><Circle fill={stroke} cx={13} cy={6.8} r={.7} /></Svg>
    case 'person':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Circle {...common} cx={10} cy={6.2} r={2.7} /><Path {...common} d="M4.6 16.7a5.4 5.4 0 0 1 10.8 0" /></Svg>
    case 'shield':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Path {...common} d="m10 2.7 6 2.2v4.7c0 3.5-2.4 6.3-6 7.7-3.6-1.4-6-4.2-6-7.7V4.9l6-2.2Z" /><Path {...common} d="m7.3 10 1.8 1.8 3.7-3.7" /></Svg>
    case 'tools':
      return <Svg height={size} testID={testID} viewBox="0 0 20 20" width={size}><Path {...common} d="M11.7 4a3.3 3.3 0 0 0-3.8 4.3l-4.1 4.1a1.6 1.6 0 0 0 2.3 2.3l4.1-4.1A3.3 3.3 0 0 0 14.5 7l-2 2-2-.6-.6-2 1.8-2.4Z" /></Svg>
  }
}
