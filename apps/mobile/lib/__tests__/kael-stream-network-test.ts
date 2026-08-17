import fs from 'node:fs'
import path from 'node:path'

// kael-stream.ts exports callable functions, so its route shape, timeouts and
// bounded reads are testable by stubbing fetch and asserting the request — that
// is the layer these belong in, and the substring versions were removed rather
// than left as a weaker copy. The one claim a behaviour test cannot make is that
// the un-encoded interpolation is absent from the file, so it stays here.
const source = fs.readFileSync(path.resolve(__dirname, '../kael-stream.ts'), 'utf8')

describe('Kael SSE network lifetime', () => {
  it('never interpolates a session identifier into the route unencoded', () => {
    expect(source).not.toContain('${sessionId}/stream')
  })
})
