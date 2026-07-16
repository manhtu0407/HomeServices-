import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.resolve(__dirname, '../kael-stream.ts'), 'utf8')

describe('Kael SSE network lifetime', () => {
  it('encodes session identifiers as one route segment', () => {
    expect(source).toContain('${encodeURIComponent(sessionId)}/stream')
    expect(source).not.toContain('${sessionId}/stream')
  })

  it('bounds both connection and total stream lifetime and cancels the reader', () => {
    expect(source).toContain('STREAM_CONNECT_TIMEOUT_MS')
    expect(source).toContain('STREAM_TOTAL_TIMEOUT_MS')
    expect(source).toContain('signal: lifetime.signal')
    expect(source).toContain("redirect: 'error'")
    expect(source).toContain('await reader?.cancel()')
  })

  it('bounds error bodies, cumulative stream bytes, and partial frame buffers', () => {
    expect(source).toContain('readResponseTextBounded(response, STREAM_MAX_ERROR_BYTES)')
    expect(source).toContain('responseBytes > STREAM_MAX_RESPONSE_BYTES')
    expect(source).toContain('buffer.length > STREAM_MAX_FRAME_BUFFER_CHARS')
    expect(source).toContain('safeServerError(parsed[httpError.httpErrorField]')
    expect(source).toContain('safeServerErrorCode(parsed.code, response.status)')
  })
})
