import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const target = 'ns-codex-final-verify-pg'
const evidence = join(root, 'docs/test-logs/codex-final-remediation-20261022')
const source = readFileSync(join(root, 'supabase/migrations/20261022141232_control_bank_reference_race.sql'), 'utf8')
const suite = readFileSync(join(root, 'supabase/tests/manual_bank_reconciliation_behavior_verification.sql'), 'utf8')
const results = []
function sql(input) {
  return spawnSync('docker', ['exec', '-i', target, 'psql', '-U', 'postgres', '-h', '127.0.0.1', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], {
    input, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024,
  })
}
const mutants = [
  ['disable-reopen', "and v_ledger.payment_state = 'reversed'", "and v_ledger.payment_state = 'never'"],
  ['reopen-any-order-status', "and v_order.status = 'manual_reconcile_required'", 'and true'],
  ['reopen-any-reversal-reason', "and v_ledger.settlement_state = 'admin_rejected'", 'and true'],
  ['ignore-wrong-amount', 'or p_amount_received is distinct from v_order.gross_amount then', 'or false then'],
  ['allow-null-reference', '      or p_bank_reference_hash is null\n      or p_bank_reference_suffix is null\n', ''],
  ['remove-24-hour-hold', "v_now + interval '24 hours'", "v_now + interval '0 hours'"],
  ['remove-base-finance-authority', 'perform private.assert_finance_reconciler(p_actor_id);', 'perform 1;'],
  ['allow-unclaimed-order', "or v_order.status not in ('manual_customer_claimed', 'manual_reconcile_required')", "or v_order.status not in ('manual_customer_claimed', 'manual_reconcile_required', 'manual_qr_ready')"],
]
try {
  for (const [name, from, to] of mutants) {
    if (!source.includes(from)) throw new Error(`missing mutation anchor: ${name}`)
    const apply = sql(source.replace(from, to))
    if (apply.status !== 0) throw new Error(`mutant could not be applied: ${name}: ${apply.stderr}`)
    const check = sql(suite)
    const restore = sql(source)
    const control = sql(suite)
    writeFileSync(join(evidence, `logs/final/mutant-${name}.txt`), `mutant_exit=${check.status}\n${check.stdout}\n${check.stderr}\nrestore_exit=${restore.status}\ncontrol_exit=${control.status}\n${control.stderr}`)
    results.push({ name, killed: check.status !== null && check.status !== 0, exit: check.status, restored: restore.status === 0, greenControl: control.status === 0 })
    console.log(JSON.stringify(results.at(-1)))
  }
} finally {
  const restored = sql(source)
  writeFileSync(join(evidence, 'results/payment-mutations.json'), JSON.stringify({ target, finalRestoreExit: restored.status, results }, null, 2) + '\n')
}
process.exitCode = results.length === mutants.length && results.every((r) => r.killed && r.restored && r.greenControl) ? 0 : 1
