export type WorkerRouteGeometry = {
  type: 'LineString'
  coordinates: [number, number][]
}

export function decodeGooglePolyline5(encoded: string | null | undefined): WorkerRouteGeometry | null {
  if (!encoded || encoded.length > 100_000) return null

  const coordinates: [number, number][] = []
  let index = 0
  let latitude = 0
  let longitude = 0

  while (index < encoded.length) {
    const latitudeResult = decodePolylineValue(encoded, index)
    if (!latitudeResult) return null
    index = latitudeResult.nextIndex
    const longitudeResult = decodePolylineValue(encoded, index)
    if (!longitudeResult) return null
    index = longitudeResult.nextIndex

    latitude += latitudeResult.value
    longitude += longitudeResult.value
    coordinates.push([longitude / 100_000, latitude / 100_000])
  }

  return coordinates.length >= 2
    ? { type: 'LineString', coordinates }
    : null
}

function decodePolylineValue(encoded: string, startIndex: number): { nextIndex: number; value: number } | null {
  let index = startIndex
  let result = 0
  let shift = 0

  while (index < encoded.length) {
    const byte = encoded.charCodeAt(index) - 63
    if (byte < 0 || byte > 63) return null
    index += 1
    result |= (byte & 0x1f) << shift
    shift += 5
    if (shift > 30) return null
    if ((byte & 0x20) === 0) {
      const value = (result & 1) !== 0 ? ~(result >> 1) : result >> 1
      return { nextIndex: index, value }
    }
  }

  return null
}
