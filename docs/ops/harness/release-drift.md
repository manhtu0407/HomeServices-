# Release Drift Runbook

Owner: release-engineering. Stop promotion when migration inventory, generated types, release manifest, or deployed function digest differs from the selected Git commit. Produce a read-only drift report. Correct drift through reviewed forward changes; never repair Production from an audit session.
