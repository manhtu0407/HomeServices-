// Tabulates the handler-level hazard observations: route correctness, visible guidance and structured metadata kept apart.
// usage: node hazard-table.mjs <handler.json> [--rows]
import { readFileSync } from 'node:fs'

const [path, flag] = process.argv.slice(2)
const doc = JSON.parse(readFileSync(path, 'utf8'))
const rows = []
for (const result of doc.results) {
  for (const hazard of result.hazard) {
    rows.push({
      scenario: result.scenario,
      variant: result.variant,
      flags: result.flags,
      mode: result.mode,
      step: hazard.step,
      route: hazard.route,
      status: hazard.status,
      numbers: hazard.text_numbers.join('/'),
      text_ok: hazard.delivered_text,
      route_exact: hazard.route_exact_text,
      structured: hazard.delivered_structured,
      providers: hazard.providers.length,
    })
  }
}
const groups = {}
for (const row of rows) {
  const key = `${row.mode}/flags-${row.flags}`
  const group = groups[key] ?? { checkpoints: 0, text_ok: 0, route_exact: 0, structured: 0, any_2xx_with_text: 0 }
  group.checkpoints += 1
  if (row.text_ok) group.text_ok += 1
  if (row.route_exact) group.route_exact += 1
  if (row.structured) group.structured += 1
  if (row.text_ok && row.status >= 200 && row.status < 300) group.any_2xx_with_text += 1
  groups[key] = group
}
if (flag === '--rows') {
  for (const row of rows.filter((entry) => entry.mode === 'frozen')) {
    console.log([row.scenario, row.variant, row.step, `flags=${row.flags}`, row.status, row.numbers || '-', row.text_ok ? 'TEXT' : 'no-text', row.route_exact ? 'ROUTE' : 'no-route', row.structured ? 'STRUCT' : 'no-struct'].join('\t'))
  }
}
console.log(JSON.stringify(groups, null, 1))
