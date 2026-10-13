// Google-style encoded polyline (precision 5), the shape VietMap returns routes in. The mobile app decodes
// the same encoding for the worker's own map; this is the Edge side, used to hand a customer the route
// as coordinates instead of an opaque string.

export type LatLng = [number, number];

const MAX_ENCODED_LENGTH = 100_000;

export function decodePolyline5(encoded: string | null | undefined): LatLng[] | null {
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH) return null;
  const points: LatLng[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    while (index < encoded.length) {
      const byte = encoded.charCodeAt(index) - 63;
      if (byte < 0 || byte > 63) return null;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (shift > 30) return null;
      if ((byte & 0x20) === 0) return (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    }
    return null;
  };
  while (index < encoded.length) {
    const dLat = next();
    const dLng = dLat === null ? null : next();
    if (dLat === null || dLng === null) return null;
    latitude += dLat;
    longitude += dLng;
    points.push([latitude / 100_000, longitude / 100_000]);
  }
  return points.length >= 2 ? points : null;
}

// Keeps the first and last point and spreads the rest evenly, so a long route stays inside a response
// size that is safe to hand a phone on every refresh.
export function thinPolyline(points: LatLng[], maxPoints: number): LatLng[] {
  if (points.length <= maxPoints || maxPoints < 2) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const thinned: LatLng[] = [];
  for (let slot = 0; slot < maxPoints - 1; slot += 1) thinned.push(points[Math.round(slot * step)]);
  thinned.push(points[points.length - 1]);
  return thinned;
}
