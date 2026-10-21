KAWA_01 final closure candidate - evidence folder (T0 only, not independently reviewed)

Base: 63c01524ed6b11bdd059f58c64421d8cbdb79017. See checkpoint CLOSURE-FINAL in ../kawa-execution-ledger.md.

Contents
- kawa01-final-closure-source.patch   source diff against the base (this folder excluded)
- file-digests.txt                    SHA-256 of every changed source file and every file here except itself and the patch
- h5-reproduction.json                sealed holdout H5 on the frozen classifier, label REPRODUCTION, not independent validation, not an original first run
- gates/                              raw output (last 120 lines) and exit codes of each gate; type-check-api.log is the FIRST run and still shows its 5 failures, fixed afterwards (rerun exit 0 is recorded in the ledger)
- red-green/, mutation/               before/after runs and the 18 mutants
- pillars-p401-p411.vitest.json       machine-readable result of the eleven emergency pillars (647 passed)
- kael-eval-deterministic.*           deterministic fixture agreement, n=99, modelAccuracy null
- playbook-mock-replay-manifest.json  mock replay manifest: fixture replay only, not model quality
- auditor-*                           copies of the independent re-audit's probe and first-run files for the baseline

Redaction: absolute local paths in these files were replaced by placeholders (<repo>, <temp>, <user-home>, <auditor-artifacts>, <user>). Nothing else in the raw output was edited. h5-reproduction.json contained no path and is byte-identical to the file produced by the run.

Known open items, unresolved and not hidden
- H5 recall 11 of 29 (37.9 %) on the frozen classifier; the classifier was not changed.
- One unexplained failure (599 of 600) in the first run of the ten pillars after 63c01524; not reproduced in 8 later runs; cause unknown.
- pnpm lint:authority fails (existing violation, unchanged).
- No T1/T2/T3 evidence; exactly-once writes need an RPC that was not written.
