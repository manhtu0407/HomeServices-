import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg'

export type ProfileSettingsGlyphName =
  | 'address'
  | 'appearance'
  | 'delete'
  | 'language'
  | 'memory'
  | 'notifications'
  | 'password'
  | 'personal'
  | 'refunds'
  | 'signout'
  | 'support'
  | 'terms'

const profileSettingsGlyphSize = 21

export function ProfileSettingsGlyph({
  color,
  name,
  testID,
}: {
  color: string
  name: ProfileSettingsGlyphName
  testID?: string
}) {
  const common = {
    fill: 'none' as const,
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.45,
  }

  switch (name) {
    case 'address':
      return (
        <Svg height={profileSettingsGlyphSize} testID={testID} viewBox="0 0 20 20" width={profileSettingsGlyphSize}>
          <Path {...common} d="M10 18s5.2-4.8 5.2-9.2A5.2 5.2 0 0 0 4.8 8.8C4.8 13.2 10 18 10 18Z" />
          <Circle {...common} cx={10} cy={8.7} r={1.8} />
        </Svg>
      )
    case 'appearance':
      return (
        <Svg height={profileSettingsGlyphSize} testID={testID} viewBox="0 0 20 20" width={profileSettingsGlyphSize}>
          <Path {...common} d="M10 3.2a6.8 6.8 0 1 0 0 13.6h1.1c.8 0 1.3-.9.8-1.6l-.5-.7c-.5-.7 0-1.7.9-1.7h.8A4.9 4.9 0 0 0 18 8a4.9 4.9 0 0 0-2-3.5A8.6 8.6 0 0 0 10 3.2Z" />
          <Circle cx={6.5} cy={8} fill={color} r={1} />
          <Circle cx={9.8} cy={6.3} fill={color} r={1} />
          <Circle cx={13.3} cy={6.8} fill={color} r={1} />
        </Svg>
      )
    case 'delete':
      return (
        <Svg height={profileSettingsGlyphSize} testID={testID} viewBox="0 0 20 20" width={profileSettingsGlyphSize}>
          <Path {...common} d="M4.5 6.2h11M8 3.7h4M7 6.2v9.7h6V6.2M8.8 8.5v5M11.2 8.5v5" />
          <Path {...common} d="M5.7 16.2h8.6" />
        </Svg>
      )
    case 'language':
      return (
        <Svg height={profileSettingsGlyphSize} testID={testID} viewBox="0 0 20 20" width={profileSettingsGlyphSize}>
          <Circle {...common} cx={10} cy={10} r={7.5} />
          <Path {...common} d="M2.8 10h14.4M10 2.5c2.1 2.1 3.1 4.6 3.1 7.5S12.1 15.4 10 17.5C7.9 15.4 6.9 12.9 6.9 10S7.9 4.6 10 2.5Z" />
        </Svg>
      )
    case 'memory':
      return (
        <Svg height={profileSettingsGlyphSize} testID={testID} viewBox="0 0 20 20" width={profileSettingsGlyphSize}>
          <Polygon {...common} points="10,2.8 16.2,6.3 16.2,13.7 10,17.2 3.8,13.7 3.8,6.3" />
          <Path {...common} d="m3.8 6.3 6.2 3.6 6.2-3.6M10 9.9v7.3" />
        </Svg>
      )
    case 'notifications':
      return (
        <Svg height={profileSettingsGlyphSize} testID={testID} viewBox="0 0 20 20" width={profileSettingsGlyphSize}>
          <Path {...common} d="M5 13.8h10l-1.1-1.7V8.8a3.9 3.9 0 0 0-7.8 0v3.3L5 13.8Z" />
          <Path {...common} d="M8.4 16a1.8 1.8 0 0 0 3.2 0" />
        </Svg>
      )
    case 'password':
      return (
        <Svg height={profileSettingsGlyphSize} testID={testID} viewBox="0 0 20 20" width={profileSettingsGlyphSize}>
          <Rect {...common} height={8.5} rx={1.7} width={12.5} x={3.75} y={8.3} />
          <Path {...common} d="M6.5 8.3V6.6a3.5 3.5 0 0 1 7 0v1.7M10 11.1v2.8" />
        </Svg>
      )
    case 'personal':
      return (
        <Svg height={profileSettingsGlyphSize} testID={testID} viewBox="0 0 20 20" width={profileSettingsGlyphSize}>
          <Circle {...common} cx={10} cy={6} r={2.8} />
          <Path {...common} d="M4.7 16.8a5.3 5.3 0 0 1 10.6 0" />
        </Svg>
      )
    case 'refunds':
      return (
        <Svg height={profileSettingsGlyphSize} testID={testID} viewBox="0 0 20 20" width={profileSettingsGlyphSize}>
          <Path {...common} d="M5.2 6.1a6.6 6.6 0 1 1-.7 8.2M5.2 3.5v3.1h3.1" />
          <Path {...common} d="M10 7.4v5.1M8.2 8.8c0-.8.7-1.4 1.8-1.4s1.8.6 1.8 1.4-.6 1.2-1.8 1.4-1.8.6-1.8 1.4.7 1.4 1.8 1.4 1.8-.6 1.8-1.4" />
        </Svg>
      )
    case 'signout':
      return (
        <Svg height={profileSettingsGlyphSize} testID={testID} viewBox="0 0 20 20" width={profileSettingsGlyphSize}>
          <Path {...common} d="M8 3.3H4.7v13.4H8M11.2 6.7l3.2 3.3-3.2 3.3M8 10h6.4" />
        </Svg>
      )
    case 'support':
      return (
        <Svg height={profileSettingsGlyphSize} testID={testID} viewBox="0 0 20 20" width={profileSettingsGlyphSize}>
          <Circle {...common} cx={10} cy={10} r={7.5} />
          <Path {...common} d="M8.2 7.5a1.9 1.9 0 1 1 3.2 1.4c-.8.6-1.4.9-1.4 2M10 13.9v.1" />
        </Svg>
      )
    case 'terms':
      return (
        <Svg height={profileSettingsGlyphSize} testID={testID} viewBox="0 0 20 20" width={profileSettingsGlyphSize}>
          <Path {...common} d="m10 2.5 6.1 2.3v4.8c0 3.6-2.5 6.5-6.1 7.9-3.6-1.4-6.1-4.3-6.1-7.9V4.8L10 2.5Z" />
          <Path {...common} d="m7.3 10 1.8 1.8 3.7-3.7" />
        </Svg>
      )
  }
}
