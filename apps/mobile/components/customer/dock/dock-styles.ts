import { typography } from '@/design/theme'
import { StyleSheet } from 'react-native'

export const CUSTOMER_LIQUID_NAV_MAX_WIDTH = 384
export const CUSTOMER_LIQUID_NAV_SIDE_INSET = 18
export const CUSTOMER_LIQUID_NAV_DOCK_HEIGHT = 62
export const CUSTOMER_LIQUID_NAV_ORB_SIZE = 68
export const CUSTOMER_LIQUID_NAV_GAP = 7
export const CUSTOMER_LIQUID_NAV_RAIL_PADDING = 2
export const CUSTOMER_LIQUID_NAV_LENS_RADIUS = 30

export const customerV21DockStyles = StyleSheet.create({
  dockIcon: {
    height: 21,
    opacity: 1,
    position: 'relative',
    width: 21,
    zIndex: 3,
  },
  dockIconActive: {
    opacity: 1,
    transform: [{ translateY: -0.15 }, { scale: 1.018 }],
  },
  dockItem: {
    alignItems: 'center',
    borderRadius: 30,
    flex: 1,
    gap: 1,
    height: 56,
    justifyContent: 'center',
    minWidth: 0,
    position: 'relative',
    zIndex: 3,
  },
  dockItemPressed: {
    transform: [{ scale: 0.976 }],
  },
  dockLabel: {
    ...typography.caption2,
    fontWeight: '600',
    maxWidth: 64,
    position: 'relative',
    textAlign: 'center',
    zIndex: 3,
  },
  dockLabelActive: {
    fontWeight: '600',
    transform: [{ translateY: -1 }],
  },
  dockOverlay: {
    alignItems: 'center',
    bottom: 12,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 30,
  },
  dockPlane: {
    alignItems: 'center',
    borderRadius: CUSTOMER_LIQUID_NAV_DOCK_HEIGHT / 2,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 0,
    height: CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
    minHeight: CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
    overflow: 'hidden',
    padding: CUSTOMER_LIQUID_NAV_RAIL_PADDING,
    position: 'relative',
  },
  dockRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: CUSTOMER_LIQUID_NAV_GAP,
    justifyContent: 'center',
  },
  kaelAccessory: {
    alignItems: 'center',
    borderRadius: CUSTOMER_LIQUID_NAV_ORB_SIZE / 2,
    flexShrink: 0,
    height: CUSTOMER_LIQUID_NAV_ORB_SIZE,
    justifyContent: 'center',
    overflow: 'visible',
    width: CUSTOMER_LIQUID_NAV_ORB_SIZE,
  },
  kaelAccessoryActive: {
    borderColor: 'rgba(46,50,54,0.30)',
    borderWidth: 1,
    shadowColor: '#04302C',
    shadowOffset: { height: 13, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 27,
  },
})
