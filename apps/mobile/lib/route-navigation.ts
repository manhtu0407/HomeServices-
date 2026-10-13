import type { RouteMapPoint } from './route-map-projection'

type NavigationPlatform = 'android' | 'ios' | 'macos' | 'web' | 'windows'

const coordinate = (point: RouteMapPoint) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`

/** Turn-by-turn hand-off to the phone's own maps app; the start is left out so it begins at the device position. */
export function buildDirectionsUrl(platform: NavigationPlatform, destination: RouteMapPoint): string {
  if (platform === 'ios' || platform === 'macos') {
    return `https://maps.apple.com/?daddr=${coordinate(destination)}&dirflg=d`
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${coordinate(destination)}&travelmode=two-wheeler`
}

/** One-off message the worker chooses to send, so the recipient can open the worker's current spot. */
export function buildLocationShareMessage(origin: RouteMapPoint, language: 'en' | 'vi'): string {
  const link = `https://www.google.com/maps?q=${coordinate(origin)}`
  return language === 'vi' ? `Vị trí hiện tại của tôi: ${link}` : `My current location: ${link}`
}
