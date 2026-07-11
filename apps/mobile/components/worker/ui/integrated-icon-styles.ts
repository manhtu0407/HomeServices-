import { StyleSheet } from 'react-native'

import { color } from '@/design/theme'

export const styles = StyleSheet.create({
  connector: {
    backgroundColor: 'rgba(47,183,164,0.58)',
    height: 1,
    position: 'absolute',
    top: '50%',
    width: 24,
    zIndex: 1,
  },
  connectorDot: {
    backgroundColor: color.brand.primary,
    borderColor: 'rgba(255,255,255,0.98)',
    borderRadius: 7,
    borderWidth: 1,
    height: 14,
    position: 'absolute',
    top: '50%',
    width: 14,
    zIndex: 2,
  },
  connectorLeft: {
    left: -24,
  },
  connectorRight: {
    right: -24,
  },
  dotLeft: {
    left: -7,
    marginTop: -7,
  },
  dotRight: {
    marginTop: -7,
    right: -7,
  },
  iconAnchor: {
    alignItems: 'center',
    backgroundColor: 'rgba(236,252,249,0.90)',
    borderColor: 'rgba(165,221,211,0.72)',
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  iconAnchorCompact: {
    borderRadius: 16,
    height: 42,
    width: 42,
  },
  iconAnchorCompactPanel: {
    alignSelf: 'stretch',
    borderRadius: 0,
    borderWidth: 0,
    minHeight: 64,
    overflow: 'visible',
    width: 72,
  },
  iconAnchorHero: {
    borderRadius: 25,
    height: 70,
    width: 70,
  },
  iconAnchorHeroPanel: {
    alignSelf: 'stretch',
    borderRadius: 0,
    borderWidth: 0,
    minHeight: 116,
    overflow: 'visible',
    width: 116,
  },
  iconAnchorOpaque: {
    backgroundColor: '#EFFAF8',
  },
  iconAnchorRail: {
    height: 64,
    width: 64,
  },
  iconAnchorPanel: {
    alignSelf: 'stretch',
    borderRadius: 0,
    borderWidth: 0,
    minHeight: 72,
    overflow: 'visible',
    width: 94,
  },
  iconAnchorStage: {
    borderRadius: 22,
    height: 64,
    width: 64,
  },
  iconAnchorStagePanel: {
    alignSelf: 'stretch',
    borderRadius: 0,
    borderWidth: 0,
    height: 78,
    overflow: 'visible',
  },
  panelDividerLeft: {
    borderLeftColor: 'rgba(198,222,218,0.92)',
    borderLeftWidth: 1,
  },
  panelDividerRight: {
    borderRightColor: 'rgba(198,222,218,0.92)',
    borderRightWidth: 1,
  },
  panelToneAction: {
    backgroundColor: '#E8FAF7',
  },
  panelToneDocument: {
    backgroundColor: '#F1FBF8',
  },
  panelToneIdentity: {
    backgroundColor: '#EEF9F6',
  },
  panelToneLocation: {
    backgroundColor: '#EAF9F4',
  },
  panelToneMoney: {
    backgroundColor: '#EEF9F7',
  },
  panelToneService: {
    backgroundColor: '#E7FBF7',
  },
  panelToneSignal: {
    backgroundColor: '#F0FBF8',
  },
  iconImage: {
    height: 42,
    width: 42,
    zIndex: 1,
  },
  iconImageCompact: {
    height: 30,
    width: 30,
  },
  iconImageCompactPanel: {
    height: 48,
    width: 48,
  },
  iconImageHero: {
    height: 46,
    width: 46,
  },
  iconImageHeroPanel: {
    height: 76,
    width: 76,
  },
  iconImagePanel: {
    height: 64,
    width: 64,
  },
  iconImageStage: {
    height: 42,
    width: 42,
  },
  iconImageStagePanel: {
    height: 62,
    width: 62,
  },
  mintAura: {
    opacity: 0.18,
  },
})
