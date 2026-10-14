import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync('.github/workflows/release-backend-system-health.yml', 'utf8')

function workflowStep(name) {
  const stepName = `      - name: ${name}`
  const stepStart = workflow.indexOf(stepName)
  assert.notEqual(stepStart, -1, `the ${name} step must remain present`)
  const nextStep = workflow.indexOf('\n      - name: ', stepStart + stepName.length)
  return workflow.slice(stepStart, nextStep < 0 ? undefined : nextStep)
}

test('Production release captures Worker versions and checks the version tag against the deployment', () => {
  assert.ok(/wrangler versions list[\s\S]*?cloudflare-versions-after\.json/u.test(workflow), 'capture Worker Version metadata')
  assert.ok(/--versions artifacts\/release\/cloudflare-versions-after\.json/u.test(workflow), 'verify the deployment version against the captured version list')
  assert.ok(/--identity-only/u.test(workflow), 'fail fast on a bad deployment identity before waiting for Cron')
})

test('Production release allows Cloudflare Cron propagation and the next one-minute tick', () => {
  assert.ok(/for attempt in \$\(seq 1 18\); do/u.test(workflow), 'allow 17 minutes for Cron propagation and first tick')
  assert.ok(/sleep 60/u.test(workflow), 'poll at most once per Cron interval')
})

test('Backend probe and promotion consume the same captured Worker Version evidence', () => {
  const probe = workflowStep('Byte-prove deployed Edge source and run read-only Admin role probe')
  const promotion = workflowStep('Build promotion packet and preserve all evidence before the final CAS')
  const versionsPath = '--cloudflare-versions artifacts/release/cloudflare-versions-after.json'

  assert.ok(probe.includes('backend-release-probe.mjs'), 'run the read-only Backend/Admin probe')
  assert.ok(probe.includes('wrangler versions list'), 'refresh Worker Version identity after Cron startup wait')
  assert.ok(probe.includes('--identity-only'), 'fail closed if the live Worker changed before Backend/Admin probing')
  assert.ok(probe.includes(versionsPath), 'bind the Backend/Admin probe to the deployed Worker Version')
  assert.ok(promotion.includes('backend-system-health-promotion.mjs'), 'build the final promotion packet')
  assert.ok(promotion.includes(versionsPath), 'bind promotion to the same deployed Worker Version')
})
