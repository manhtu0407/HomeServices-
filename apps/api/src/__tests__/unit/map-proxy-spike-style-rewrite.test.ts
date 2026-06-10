import { describe, expect, it } from 'vitest'
import {
  buildUpstreamUrl,
  rewriteVietmapStyleJson,
  rewriteVietmapUrl,
} from '../../../../../supabase/functions/map-proxy-spike/style-rewrite'

const PROXY_BASE = 'https://project.supabase.co/functions/v1/map-proxy-spike'

function buildVietmapStyle(): Record<string, unknown> {
  return {
    version: 8,
    glyphs: 'https://maps.vietmap.vn/maps/fonts/{fontstack}/{range}.pbf?apikey=secret-key-123',
    sprite: 'https://maps.vietmap.vn/maps/styles/tm/sprite',
    sources: {
      vietmap: {
        type: 'vector',
        tiles: [
          'https://maps.vietmap.vn/api/tm/tiles/{z}/{x}/{y}.pbf?apikey=secret-key-123',
        ],
      },
      tilejson: {
        type: 'vector',
        url: 'https://tiles.vietmap.vn/data/v1.json?apikey=secret-key-123',
      },
      external: {
        type: 'raster',
        tiles: ['https://example.com/other/{z}/{x}/{y}.png'],
      },
    },
    layers: [{ id: 'bg', type: 'background' }],
  }
}

describe('§37 MP0 map-proxy-spike style rewrite', () => {
  it('rewrites every VietMap tiles/glyphs/sprite/TileJSON URL to the proxy and strips all key params', () => {
    const result = rewriteVietmapStyleJson(buildVietmapStyle(), PROXY_BASE)
    const payload = JSON.stringify(result.style)

    // Gate G2: zero key material in the rewritten payload.
    expect(payload).not.toContain('secret-key-123')
    expect(payload.toLowerCase()).not.toContain('apikey')

    expect(result.rewrittenUrlCount).toBe(4)
    expect(result.strippedKeyCount).toBe(3)
    const sources = result.style.sources as Record<string, { tiles?: string[]; url?: string }>
    expect(sources.vietmap.tiles?.[0]).toBe(`${PROXY_BASE}/u/maps.vietmap.vn/api/tm/tiles/{z}/{x}/{y}.pbf`)
    expect(sources.tilejson.url).toBe(`${PROXY_BASE}/u/tiles.vietmap.vn/data/v1.json`)
    expect(result.style.glyphs).toBe(`${PROXY_BASE}/u/maps.vietmap.vn/maps/fonts/{fontstack}/{range}.pbf`)
    expect(result.style.sprite).toBe(`${PROXY_BASE}/u/maps.vietmap.vn/maps/styles/tm/sprite`)
  })

  it('keeps MapLibre template braces literal (no %7B percent-encoding)', () => {
    const result = rewriteVietmapStyleJson(buildVietmapStyle(), PROXY_BASE)
    const payload = JSON.stringify(result.style)
    expect(payload).toContain('{z}/{x}/{y}.pbf')
    expect(payload).toContain('{fontstack}/{range}.pbf')
    expect(payload).not.toContain('%7B')
  })

  it('leaves non-VietMap hosts untouched and reports them', () => {
    const result = rewriteVietmapStyleJson(buildVietmapStyle(), PROXY_BASE)
    const sources = result.style.sources as Record<string, { tiles?: string[] }>
    expect(sources.external.tiles?.[0]).toBe('https://example.com/other/{z}/{x}/{y}.png')
    expect(result.untouchedExternalUrls).toEqual(['https://example.com/other/{z}/{x}/{y}.png'])
  })

  it('is idempotent on an already-rewritten style', () => {
    const once = rewriteVietmapStyleJson(buildVietmapStyle(), PROXY_BASE)
    const twice = rewriteVietmapStyleJson(once.style, PROXY_BASE)
    expect(twice.rewrittenUrlCount).toBe(0)
    expect(JSON.stringify(twice.style)).toBe(JSON.stringify(once.style))
  })

  it('preserves non-key query params while stripping every key alias', () => {
    const rewritten = rewriteVietmapUrl(
      'https://maps.vietmap.vn/api/tiles/{z}/{x}/{y}.pbf?apikey=k1&format=pbf&api_key=k2&access_token=k3',
      PROXY_BASE,
    )
    expect(rewritten).toEqual({
      kind: 'rewritten',
      url: `${PROXY_BASE}/u/maps.vietmap.vn/api/tiles/{z}/{x}/{y}.pbf?format=pbf`,
      stripped: 3,
    })
  })

  it('builds the inverse upstream URL with the server-side key injected', () => {
    expect(buildUpstreamUrl('/u/maps.vietmap.vn/api/tm/tiles/14/12930/7333.pbf', 'real-key'))
      .toBe('https://maps.vietmap.vn/api/tm/tiles/14/12930/7333.pbf?apikey=real-key')
    expect(buildUpstreamUrl('/u/maps.vietmap.vn/maps/fonts/Roboto/0-255.pbf?format=pbf', 'real-key'))
      .toBe('https://maps.vietmap.vn/maps/fonts/Roboto/0-255.pbf?format=pbf&apikey=real-key')
  })

  it('rejects non-allowlisted hosts and path traversal in the passthrough route', () => {
    expect(buildUpstreamUrl('/u/evil.example.com/steal', 'real-key')).toBeNull()
    expect(buildUpstreamUrl('/u/maps.vietmap.vn/../../etc/passwd', 'real-key')).toBeNull()
    expect(buildUpstreamUrl('/u/maps.vietmap.vn//double', 'real-key')).toBeNull()
    expect(buildUpstreamUrl('/not-a-proxy-path', 'real-key')).toBeNull()
  })

  it('strips a client-smuggled apikey from the passthrough query before injecting the real key', () => {
    expect(buildUpstreamUrl('/u/maps.vietmap.vn/api/tiles/1/2/3.pbf?apikey=attacker-key', 'real-key'))
      .toBe('https://maps.vietmap.vn/api/tiles/1/2/3.pbf?apikey=real-key')
  })
})
