#!/bin/bash
# Mutation checks: each mutant is applied to the live function in the disposable database, the matching SQL verification must
# turn red, and the original function is restored and must turn green again.
# usage: bash mutations.sh   (run after run-t1.sh, on the same container)
set -u
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W)"
EVIDENCE="$(cd "$HERE/../.." && pwd -W)"
REPO="$(cd "$EVIDENCE/../../.." && pwd -W)"
LOGS="$EVIDENCE/logs/t1"
WORK="${KAWA_T1_WORK:-$REPO/../ns-t1-work}"
mkdir -p "$LOGS" "$WORK"
C=ns-b4-pg
OUT="$LOGS/mutations.txt"
: > "$OUT"

psql_c() { docker exec $C psql -U postgres -d postgres -h 127.0.0.1 "$@"; }
suite() { (cd "$REPO" && bash docker/scripts/run-sql-tests.sh --container $C --db-user postgres --dblink-db-user supabase_admin --filter "$1" 2>&1 | grep -E "^(PASS|FAIL)|ERROR:" | cut -c1-240 | head -2); }

save() { psql_c -Atc "select pg_get_functiondef('$1'::regprocedure)" > "$WORK/$2.orig.sql"; }
mutate() {
  local name="$1" file="$2" from="$3" to="$4" test_file="$5"
  node -e "
const fs = require('fs');
const text = fs.readFileSync(process.argv[1], 'utf8');
if (!text.includes(process.argv[2])) { console.error('anchor missing'); process.exit(3); }
fs.writeFileSync(process.argv[4], text.replace(process.argv[2], process.argv[3]));" "$WORK/$file.orig.sql" "$from" "$to" "$WORK/$file.mut.sql" || { echo "== $name: ANCHOR MISSING" >> "$OUT"; return; }
  docker cp "$WORK/$file.mut.sql" $C:/tmp/mut.sql
  docker exec $C psql -U postgres -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f /tmp/mut.sql > /dev/null 2>&1
  { echo "== mutant: $name"; suite "$test_file"; } >> "$OUT"
}
restore() {
  docker cp "$WORK/$1.orig.sql" $C:/tmp/orig.sql
  echo ";" >> "$WORK/$1.orig.sql"
  docker cp "$WORK/$1.orig.sql" $C:/tmp/orig.sql
  docker exec $C psql -U postgres -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f /tmp/orig.sql > /dev/null 2>&1
  { echo "== restored $1"; suite "$2"; } >> "$OUT"
}

save 'public.decide_manual_bank_payment_reconciliation(uuid,uuid,text,integer,timestamptz,text,text,text)' decide
T=manual_bank_reconciliation_behavior_verification.sql
mutate "accept an order that is still manual_qr_ready" decide "or v_order.status not in ('manual_customer_claimed', 'manual_reconcile_required')" "or v_order.status not in ('manual_customer_claimed', 'manual_reconcile_required', 'manual_qr_ready')" $T
restore decide $T
mutate "skip the amount comparison" decide "or p_amount_received is distinct from v_order.gross_amount then" "or false then" $T
restore decide $T
mutate "drop the bank-reference reuse check" decide "where duplicate_reference.bank_reference_hash = p_bank_reference_hash" "where false and duplicate_reference.bank_reference_hash = p_bank_reference_hash" $T
restore decide $T

CONFIRM=$(psql_c -Atc "select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'confirm_kael_chat_durable_atomic' and p.prosrc like '%TIER_A_INCOMPLETE%' limit 1" | tr -d '\r')
save "$CONFIRM" confirm
G=six_service_confirmation_gate_verification.sql
mutate "skip the Tier A field check" confirm "if v_missing_field is not null then" "if false and v_missing_field is not null then" $G
restore confirm $G
mutate "skip the rfq confirmation-kind comparison" confirm "or (v_effective_quote_mode = 'rfq' and p_confirmation_kind <> 'rfq_request')" "or (false and v_effective_quote_mode = 'rfq' and p_confirmation_kind <> 'rfq_request')" $G
restore confirm $G
mutate "skip the safety blocker refusal" confirm "if v_session.safe_metadata #> '{intake_coverage,safety_blocker}' is not null" "if false and v_session.safe_metadata #> '{intake_coverage,safety_blocker}' is not null" $G
restore confirm $G
cat "$OUT"
