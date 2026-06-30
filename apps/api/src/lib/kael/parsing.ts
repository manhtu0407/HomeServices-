// safeParseJSON now lives in packages/shared/kael/parsing.ts as the single canonical npm-side
// parser. Re-exported here so existing './parsing' and '@/lib/kael/parsing' import paths are
// unchanged. The Edge runtime keeps its own copy (Deno boundary) — see code-ownership-map.md.
export { safeParseJSON } from '@nestscout/shared/kael/parsing'
