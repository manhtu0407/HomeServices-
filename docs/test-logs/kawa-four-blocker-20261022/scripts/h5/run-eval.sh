#!/bin/bash
# usage: run-eval.sh <worktree> <label>
WT="$1"; LABEL="$2"
D="$WT/apps/api/src/__tests__/kael-edge-runtime/domains/zz-h5-standard-eval-pillar.test.ts"
cp /c/ns-fix/h5/zz-h5-standard-eval-pillar.test.ts "$D"
cd "$WT/apps/api" || exit 1
H5_EVAL_OUT="C:/ns-fix/h5/raw-$LABEL.json" H5_FRESH_PROBES=C:/ns-fix/h5/fresh-probes-20261022.json \
H5_FRESH_SHA=f5dfc6f4cdf877b221b43776b5cddefaaeb08fd2200bb7083549d24b1172cf86 \
corepack pnpm exec vitest run src/__tests__/kael-edge-runtime/domains/zz-h5-standard-eval-pillar.test.ts 2>&1 | grep -E "Tests |Test Files|Error|FAIL" | head -5
rm -f "$D"
node /c/ns-fix/h5/analyse.mjs "C:/ns-fix/h5/raw-$LABEL.json" "C:/ns-fix/h5/summary-$LABEL.json"
