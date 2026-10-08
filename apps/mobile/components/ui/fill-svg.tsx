import { StyleSheet, View } from 'react-native'
import Svg, { type SvgProps } from 'react-native-svg'

// An Svg given width="100%" becomes a Yoga percentage width, which resolves against the parent's
// content box, so a painted background inside a parent with padding stops short of its edge. The
// absolute-fill frame is what spans the padding box; the Svg only fills the frame.
export function FillSvg({ children, frameTestID, ...svgProps }: Omit<SvgProps, 'height' | 'style' | 'width'> & { frameTestID?: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={frameTestID}>
      <Svg height="100%" width="100%" {...svgProps}>{children}</Svg>
    </View>
  )
}
