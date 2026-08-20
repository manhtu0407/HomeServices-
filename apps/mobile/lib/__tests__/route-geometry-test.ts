import { decodeGooglePolyline5 } from '../route-geometry'

describe('VietMap route geometry', () => {
  it('decodes the Google polyline five-point format used by VietMap', () => {
    expect(decodeGooglePolyline5('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual({
      type: 'LineString',
      coordinates: [
        [-120.2, 38.5],
        [-120.95, 40.7],
        [-126.453, 43.252],
      ],
    })
  })

  it('rejects malformed or unusable geometry instead of drawing a fabricated route', () => {
    expect(decodeGooglePolyline5('not-a-polyline')).toBeNull()
    expect(decodeGooglePolyline5('')).toBeNull()
  })
})
