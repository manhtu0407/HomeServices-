# Production web preview in Claude Code

How to open the live Production web preview (Expo web, port 8085, the registered Production Supabase project) inside the Claude Code Preview pane, where you can click through the app and edit with hot reload.

## Where it works

| Session | Interactive Preview | What the agent does |
|---|---|---|
| Local: the Claude Desktop app, Code tab, or `claude remote-control` in the repo folder | Yes | Runs the preflight, then `preview_start` with the launch entry below |
| Cloud (claude.ai/code, cloud environments) | No: there is no Preview pane and no `preview_start` | Says so in its first reply and does not quietly switch to screenshots |

The `SessionStart` hook `.claude/hooks/preview-session-context.mjs` tells the agent which row applies when the session starts.

## One-time setup (local machine)

1. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` (gitignored).
2. Fill in `EXPO_PUBLIC_SUPABASE_URL` (must be `https://iwevizmsedyqozxlawwl.supabase.co`) and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `EXPO_PUBLIC_API_BASE_URL` is optional; if it's empty, it is derived as `<url>/functions/v1/mobile-api`.
3. `pnpm install`.

## Open it

Say: **"Claude, mở Production ngay trên Claude Code Preview"**.

The agent runs `node scripts/preview/production-web.mjs --check`, then starts the matching `.claude/launch.json` entry:

- Windows: `mobile-web-production` → `scripts/run-mobile-web-production-preview.ps1`
- macOS / Linux: `mobile-web-production-posix` → `scripts/preview/production-web.mjs`

To run it by hand: `pnpm preview:mobile:web:production` (Windows) or `node scripts/preview/production-web.mjs` (macOS / Linux).

## Guards (both launchers)

- Only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `EXPO_PUBLIC_API_BASE_URL` are read from the env file. Harness credentials such as `SECTION32_*` are never exported to Expo.
- Both URLs must use the exact Production origin over HTTPS, with no credentials, query, fragment, or custom port.
- The key must be `sb_publishable_*` or a legacy `anon` JWT. A `service_role` or secret key is refused.
- `EXPO_PUBLIC_STAGING_PAYMENT_RAIL_ENABLED` is forced to `false`.
- No value is ever printed.

Pillar `P324-production-preview-guard` (`apps/api/src/__tests__/unit/production-preview-guard-pillar.test.ts`) keeps these guards and the launch wiring from regressing.

## Troubleshooting

| Preflight message | Fix |
|---|---|
| `env file not found` | Do the one-time setup above |
| `must use the exact production Supabase origin` | `.env.local` points at another project; correct the URL |
| `must not contain server authority` | You pasted a secret or `service_role` key; use the publishable key |
| `dependencies are not installed` | `pnpm install` |
| `port 8085 is already in use` | Stop the old preview; Production web-preview writes are registered only on ports `8085` and `8086` |
