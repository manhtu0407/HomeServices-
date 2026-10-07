#!/usr/bin/env node
// SessionStart hook — Production web preview routing.
//
// The interactive Preview pane exists only when Claude Code runs on Tu's own machine. A cloud
// session has no preview_start, and without this note it quietly falls back to screenshots, which
// reads as "the preview is broken" instead of "this session cannot show one". Stdout from a
// SessionStart hook becomes session context, so this tells the agent which path applies before the
// first request arrives.
//
// Safety rail: always exits 0 and prints nothing secret.

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [platform]
 */
export function previewContext(env = process.env, platform = process.platform) {
  const heading = 'Production web preview (when Tu asks to open Production in Claude Code Preview):'
  if (env.CLAUDE_CODE_REMOTE === 'true') {
    return [
      heading,
      '- This is a cloud session: the interactive Preview pane and preview_start are unavailable here.',
      '- Say so in the first reply and point Tu to a local session in the Claude Desktop app (Code tab) or `claude remote-control` in the repo folder.',
      '- Do not substitute screenshots unless Tu asks for them.',
    ].join('\n')
  }
  const entry = platform === 'win32' ? 'mobile-web-production' : 'mobile-web-production-posix'
  return [
    heading,
    '- Run `node scripts/preview/production-web.mjs --check` first and report any failure verbatim.',
    `- Then call preview_start with the .claude/launch.json entry \`${entry}\` (port 8085).`,
    '- Confirm port 8085 responds before saying the preview is open.',
    '- Never point the preview at staging or any origin other than the registered Production project.',
  ].join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${previewContext()}\n`)
  } catch {
    // Context is a convenience; a failure here must never block the session.
  }
  process.exit(0)
}
