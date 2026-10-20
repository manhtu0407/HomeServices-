# Former GitHub Actions verification release lane

The `release-production-verification.yml` workflow was removed when Production release authority moved to the local `kael-ship` runner. It accepted incomplete transaction evidence and allowed a manual GitHub Actions Production deployment, which no longer matches the release policy.

The old workflow, dispatch command, and generated-workflow script are retired. Do not attempt to dispatch the historical `deploy-verification-release-to-production` confirmation phrase. Current releases require the read-only preflight and explicit authorized local execution described in [Local Production release](local-production-release.md).

The former verification lane did not close transaction evidence gaps: its receipt recorded them while the test cases ran, but it did not establish real Customer-to-Worker completion or native device evidence. Those gaps remain governed by `config/harness/transaction-critical-coverage.json` and the applicable release gates.
