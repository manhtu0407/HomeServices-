import { readFileSync, writeFileSync } from 'node:fs'

const [rawPath, outPath] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(rawPath, 'utf8'))
const REQUIRED = { fire: ['114'], medical: ['115'], police: ['113'], electrical_water: ['112', '114', '115'], gas: ['114'], uncertain: ['112'] }

function wilson(k, n) {
  if (n === 0) return null
  const z = 1.96, p = k / n, d = 1 + z * z / n
  const c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
  return [Number(((c - m) / d).toFixed(3)), Number(((c + m) / d).toFixed(3))]
}

const verdictOf = (expected, route) => {
  const hazard = !(expected.length === 1 && expected[0] === 'none')
  if (hazard) return route === 'none' ? 'FN' : expected.includes(route) ? 'TP' : 'WRONG_ROUTE'
  return route === 'none' ? 'TN' : 'FP'
}

const stat = () => ({ n: 0, positives: 0, negatives: 0, TP: 0, FN: 0, WRONG_ROUTE: 0, FP: 0, TN: 0 })
const groups = {}
const bump = (key, v, hazard) => {
  const g = (groups[key] ??= stat())
  g.n += 1
  if (hazard) g.positives += 1; else g.negatives += 1
  g[v] += 1
}
const misses = []
const parity = { classifier_route_differs: [], handler_route_differs: [], handler_numbers_dropped: [], handler_missing_guidance: [], handler_not_2xx: [] }
let maxClassifierMs = 0, maxHandlerMs = 0
const handlerStats = { off: stat(), on: stat() }

for (const row of raw.rows) {
  const hazard = !(row.expected.length === 1 && row.expected[0] === 'none')
  const cOff = row.classifier_off.route, cOn = row.classifier_on.route
  const v = verdictOf(row.expected, cOff)
  const klassKey = row.pinned ? 'pinned-contestable' : row.klass
  bump(`${row.set}:ALL`, v, hazard)
  bump(`${row.set}:${klassKey}`, v, hazard)
  if (v === 'FN' || v === 'WRONG_ROUTE' || v === 'FP') misses.push({ id: row.id, set: row.set, class: klassKey, expected: row.expected, classifier: cOff, verdict: v, text: row.text })
  if (cOff !== cOn) parity.classifier_route_differs.push({ id: row.id, off: cOff, on: cOn })
  maxClassifierMs = Math.max(maxClassifierMs, row.classifier_off.ms, row.classifier_on.ms)
  const h = {}
  for (const flags of ['off', 'on']) {
    const r = row[`handler_${flags}`]
    const route = r.routes[0] ?? r.structured ?? 'none'
    h[flags] = { route, numbers: r.numbers, status: r.status }
    const hv = verdictOf(row.expected, route)
    handlerStats[flags].n += 1
    if (hazard) handlerStats[flags].positives += 1; else handlerStats[flags].negatives += 1
    handlerStats[flags][hv] += 1
    maxHandlerMs = Math.max(maxHandlerMs, r.ms)
    if (route !== 'none') {
      const need = REQUIRED[route] ?? []
      const missing = need.filter((n) => !r.numbers.includes(n))
      if (missing.length) parity.handler_missing_guidance.push({ id: row.id, flags, route, missing })
    }
    if (r.status >= 300 && route === 'none') parity.handler_not_2xx.push({ id: row.id, flags, status: r.status })
  }
  if (h.off.route !== h.on.route) parity.handler_route_differs.push({ id: row.id, off: h.off.route, on: h.on.route })
  const dropped = h.off.numbers.filter((n) => !h.on.numbers.includes(n))
  if (dropped.length) parity.handler_numbers_dropped.push({ id: row.id, dropped })
}

const table = Object.entries(groups).map(([key, g]) => ({
  group: key, ...g,
  recall: g.positives ? Number(((g.TP) / g.positives).toFixed(3)) : null,
  recall_ci95: wilson(g.TP, g.positives),
  false_positive_rate: g.negatives ? Number((g.FP / g.negatives).toFixed(3)) : null,
  fp_ci95: wilson(g.FP, g.negatives),
}))
const slow = raw.timing.map((t) => ({ ...t, ms: Number(t.ms.toFixed(1)) }))
const summary = {
  schema: 'nestscout.h5.standard_eval_summary.v1',
  rows: raw.rows.length,
  table,
  handler_flags_off: handlerStats.off,
  handler_flags_on: handlerStats.on,
  parity: Object.fromEntries(Object.entries(parity).map(([k, v]) => [k, { count: v.length, rows: v.slice(0, 40) }])),
  max_classifier_ms: Number(maxClassifierMs.toFixed(2)),
  max_handler_ms: Number(maxHandlerMs.toFixed(1)),
  pathological_timing: slow,
  misses,
}
writeFileSync(outPath, `${JSON.stringify(summary, null, 1)}\n`)
for (const t of table) console.log(t.group.padEnd(40), `n=${t.n} pos=${t.positives} TP=${t.TP} FN=${t.FN} WR=${t.WRONG_ROUTE} | neg=${t.negatives} FP=${t.FP} TN=${t.TN}`, t.recall !== null ? `recall=${t.recall} ${JSON.stringify(t.recall_ci95)}` : '', t.false_positive_rate !== null ? `fpr=${t.false_positive_rate}` : '')
console.log('handler off', JSON.stringify(handlerStats.off))
console.log('handler on ', JSON.stringify(handlerStats.on))
for (const [k, v] of Object.entries(parity)) console.log('parity', k, v.length)
console.log('max classifier ms', summary.max_classifier_ms, 'max handler ms', summary.max_handler_ms)
console.log('pathological', JSON.stringify(slow))
console.log('misses', misses.length)
