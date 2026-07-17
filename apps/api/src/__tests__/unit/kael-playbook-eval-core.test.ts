import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  aggregatePlaybookResults,
  aggregateRepetitionStability,
  buildSanitizedRawArtifact,
  createRunManifest,
  extractIntakeObservation,
  normalizeEvalEvidenceForRunMode,
  requestedSlotsFromResponse,
  resolveRetryWaitSeconds,
  sanitizeIntakeObservation,
  scorePlaybookCase,
  selectUserTurn,
  validatePlaybookCorpus,
  validateEvalDistrict,
  validateStagingEvalTargets,
} from '../../../scripts/lib/kael-playbook-eval-core.mjs'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const API_ROOT = resolve(TEST_DIR, '../../..')
const REPO_ROOT = resolve(API_ROOT, '../..')
const CLI_REPORT_DATE = '2099-01-01'
const CLI_REPORT_LABELS = [
  'cwd-root-contract',
  'cwd-api-contract',
  'cwd-traversal-contract',
  'cwd-junction-contract',
]

afterEach(() => {
  for (const label of CLI_REPORT_LABELS) {
    const reportStem = resolve(
      REPO_ROOT,
      `docs/test-logs/${CLI_REPORT_DATE}_kael-playbook-electrical-${label}`,
    )
    for (const suffix of ['.md', '.json', '.raw.json']) rmSync(`${reportStem}${suffix}`, { force: true })
  }
})

describe('Kael playbook eval core', () => {
  it('reads only the sanitized structured observation from the final turn', () => {
    const response = {
      session: { id: 'private-session' },
      turns: [
        {
          content_type: 'error',
          text_content: 'Copy that must never determine routing.',
          intake_observation: {
            scope_signal: 'service_mismatch',
            suggested_service: 'hvac',
            problem_slug: null,
            needs_clarification: false,
            safety_signals: ['water_near_power'],
            model_id: 'deterministic',
            prompt_version: 'intake.v2',
            playbook_version: 'electrical.v2',
            customer_email: 'private@example.com',
          },
        },
      ],
    }

    expect(extractIntakeObservation(response)).toEqual({
      scope_signal: 'service_mismatch',
      suggested_service: 'hvac',
      problem_slug: null,
      needs_clarification: false,
      safety_signals: ['water_near_power'],
      model_id: 'deterministic',
      prompt_version: 'intake.v2',
      playbook_version: 'electrical.v2',
    })
  })

  it('rejects an error-copy-only response instead of guessing its route', () => {
    const response = {
      session: { status: 'unsupported' },
      turns: [{ content_type: 'error', text_content: 'Please select another service.' }],
    }

    expect(() => extractIntakeObservation(response)).toThrow('missing intake_observation')
  })

  it('rejects unsafe identifiers and inconsistent structured observations', () => {
    expect(() => sanitizeIntakeObservation(observation({
      suggested_service: 'private@example.com',
    }))).toThrow('suggested_service')
    expect(() => sanitizeIntakeObservation(observation({
      safety_signals: Array.from({ length: 9 }, (_, index) => `signal_${index}`),
    }))).toThrow('safety_signals')
    expect(() => sanitizeIntakeObservation(observation({
      scope_signal: 'out_of_scope',
      problem_slug: 'breaker_trip',
    }))).toThrow('inconsistent intake_observation')
  })

  it('gates suggested service including an expected null value', () => {
    const inScope = observation({ suggested_service: null })
    const mismatch = observation({
      scope_signal: 'service_mismatch',
      suggested_service: 'hvac',
      problem_slug: null,
    })

    const noSuggestion = scorePlaybookCase({
      scope_signal: 'in_scope',
      suggested_service: null,
    }, inScope)
    const wrongSuggestion = scorePlaybookCase({
      scope_signal: 'service_mismatch',
      suggested_service: 'plumbing',
    }, mismatch)

    expect(noSuggestion.fields.suggested_service).toMatchObject({ gated: true, pass: true })
    expect(wrongSuggestion.fields.suggested_service).toMatchObject({
      gated: true,
      pass: false,
      expected: 'plumbing',
      observed: 'hvac',
    })
    expect(wrongSuggestion.pass).toBe(false)
  })

  it('scores clarification, accepted slugs, and required and forbidden safety signals', () => {
    const result = scorePlaybookCase({
      scope_signal: 'in_scope',
      suggested_service: null,
      needs_clarification: false,
      acceptable_problem_slugs: ['breaker_trip', 'other_electrical'],
      required_safety_signals: ['protective_device'],
      forbidden_safety_signals: ['smoke_or_burning'],
    }, observation({
      safety_signals: ['protective_device', 'smoke_or_burning'],
    }))

    expect(result.fields.needs_clarification).toMatchObject({ gated: true, pass: true })
    expect(result.fields.problem_slug).toMatchObject({ gated: true, pass: true })
    expect(result.fields.safety_signals).toMatchObject({
      gated: true,
      pass: false,
      missing: [],
      forbidden_observed: ['smoke_or_burning'],
    })
    expect(result.pass).toBe(false)
  })

  it('keeps the existing corpus field names scoreable', () => {
    const result = scorePlaybookCase({
      scope_signal: 'in_scope',
      suggested_service: null,
      needs_clarification: false,
      problem_slug: 'breaker_trip',
      safety_signals: ['protective_device'],
    }, observation({ safety_signals: ['protective_device'] }))

    expect(result.pass).toBe(true)
    expect(result.fields.problem_slug).toMatchObject({ gated: true, pass: true })
    expect(result.fields.safety_signals).toMatchObject({ gated: true, pass: true })
  })

  it('scores an in-scope slug even when the expected outcome asks a clarification', () => {
    const result = scorePlaybookCase({
      scope_signal: 'in_scope',
      problem_slug: 'power_outage_one_room',
      needs_clarification: true,
    }, observation({
      problem_slug: 'other_electrical',
      needs_clarification: true,
    }))

    expect(result.fields.problem_slug).toMatchObject({ gated: true, pass: false })
    expect(result.pass).toBe(false)
  })

  it('reports routing confusion, macro F1, false declines, and suggested-service accuracy', () => {
    const scored = [
      scoredRun('valid-pass', 'in_scope', 'in_scope', null, null),
      scoredRun('valid-declined', 'in_scope', 'out_of_scope', null, null),
      scoredRun('unsupported-pass', 'out_of_scope', 'out_of_scope', null, null),
      scoredRun('mismatch-missed', 'service_mismatch', 'in_scope', 'hvac', null),
    ]

    const metrics = aggregatePlaybookResults(scored)

    expect(metrics.routing.confusion_matrix).toEqual({
      in_scope: { in_scope: 1, out_of_scope: 1, service_mismatch: 0 },
      out_of_scope: { in_scope: 0, out_of_scope: 1, service_mismatch: 0 },
      service_mismatch: { in_scope: 1, out_of_scope: 0, service_mismatch: 0 },
    })
    expect(metrics.routing.accuracy).toBe(0.5)
    expect(metrics.routing.macro_f1).toBe(0.3889)
    expect(metrics.routing.false_declines).toBe(1)
    expect(metrics.routing.false_decline_rate).toBe(0.5)
    expect(metrics.by_field.suggested_service).toEqual({
      gated_cases: 4,
      passed: 3,
      rate: 0.75,
    })
  })

  it('separates observed clarification rate from clarification accuracy', () => {
    const expected = {
      scope_signal: 'in_scope',
      suggested_service: null,
      needs_clarification: false,
    }
    const runs = [
      repeatRun('no-clarification-a', 1, expected, observation({ needs_clarification: false })),
      repeatRun('clarification', 1, expected, observation({ needs_clarification: true })),
      repeatRun('no-clarification-b', 1, expected, observation({ needs_clarification: false })),
    ]

    const metrics = aggregatePlaybookResults(runs)

    expect(metrics.by_field.needs_clarification.rate).toBe(0.6667)
    expect(metrics.conversation.clarification_rate).toBe(0.3333)
  })

  it('scores the initial clarification decision while tracking a resolved final turn', () => {
    const expected = {
      scope_signal: 'in_scope',
      suggested_service: null,
      needs_clarification: true,
    }
    const initial = observation({ needs_clarification: true })
    const run = {
      ...repeatRun('resolved-after-detail', 1, expected, initial),
      clarificationTurns: 1,
      finalObserved: observation({ needs_clarification: false }),
      turns: 2,
      latency_ms: 120,
    }

    const metrics = aggregatePlaybookResults([run])

    expect(run.score.fields.needs_clarification).toMatchObject({ pass: true })
    expect(metrics.conversation.clarification_rate).toBe(1)
    expect(run.finalObserved.needs_clarification).toBe(false)
  })

  it('excludes support-zero labels from a sliced-run macro F1', () => {
    const metrics = aggregatePlaybookResults([
      scoredRun('slice-pass', 'in_scope', 'in_scope', null, null),
    ])

    expect(metrics.routing.macro_f1).toBe(1)
    expect(metrics.routing.per_category).toMatchObject({
      in_scope: { f1: 1, support: 1 },
      out_of_scope: { f1: null, support: 0 },
      service_mismatch: { f1: null, support: 0 },
    })
  })

  it('reports repeated-run consistency and splits immediate-critical from capability misses', () => {
    const expected = {
      scope_signal: 'in_scope',
      suggested_service: null,
      safety_signals: ['smoke_or_burning', 'protective_device'],
    }
    const runs = [
      repeatRun('breaker', 1, expected, observation({
        safety_signals: ['smoke_or_burning', 'protective_device'],
      })),
      repeatRun('breaker', 2, expected, observation({
        safety_signals: ['smoke_or_burning', 'protective_device'],
      })),
      repeatRun('breaker', 3, expected, observation({
        scope_signal: 'out_of_scope',
        problem_slug: null,
        safety_signals: [],
      })),
      repeatRun('stable', 1, expected, observation({
        safety_signals: ['smoke_or_burning', 'protective_device'],
      })),
      repeatRun('stable', 2, expected, observation({
        safety_signals: ['smoke_or_burning', 'protective_device'],
      })),
      repeatRun('stable', 3, expected, observation({
        safety_signals: ['smoke_or_burning', 'protective_device'],
      })),
    ]

    expect(aggregateRepetitionStability(runs)).toMatchObject({
      cases: 2,
      min_repetitions: 3,
      max_repetitions: 3,
      repetition_evidence_available: true,
      fully_consistent_cases: 1,
      fully_consistent_rate: 0.5,
      consistency_rate: 0.8333,
      errored_cases: 0,
      errored_runs: 0,
      worst_run_required_signal_misses: 2,
      worst_run_immediate_critical_misses: 1,
      worst_run_capability_misses: 1,
      cases_with_any_required_signal_miss: 1,
      cases_with_any_immediate_critical_miss: 1,
      cases_with_any_capability_miss: 1,
    })
  })

  it('separates immediate-critical safety from broader required capability signals', () => {
    const runs = [
      repeatRun('safety-hit', 1, {
        scope_signal: 'in_scope',
        suggested_service: null,
        required_safety_signals: ['smoke_or_burning'],
      }, observation({ safety_signals: ['smoke_or_burning'] })),
      repeatRun('safety-miss', 1, {
        scope_signal: 'in_scope',
        suggested_service: null,
        required_safety_signals: ['smoke_or_burning', 'protective_device'],
      }, observation({ safety_signals: ['smoke_or_burning'] })),
      repeatRun('safety-false-positive', 1, {
        scope_signal: 'in_scope',
        suggested_service: null,
        forbidden_safety_signals: ['smoke_or_burning'],
      }, observation({ safety_signals: ['smoke_or_burning'] })),
    ]

    expect(aggregatePlaybookResults(runs).safety).toEqual({
      expected_required_signals: 3,
      observed_required_signals: 2,
      required_signal_misses: 1,
      required_signal_recall: 0.6667,
      expected_immediate_critical_signals: 2,
      observed_immediate_critical_signals: 2,
      immediate_critical_misses: 0,
      immediate_critical_recall: 1,
      expected_capability_signals: 1,
      observed_capability_signals: 0,
      capability_misses: 1,
      capability_recall: 0,
      forbidden_signal_checks: 1,
      false_positives: 1,
      false_positive_rate: 1,
      by_signal: {
        protective_device: {
          kind: 'capability', expected: 1, observed: 0, recall: 0,
        },
        smoke_or_burning: {
          kind: 'immediate_critical', expected: 2, observed: 2, recall: 1,
        },
      },
    })
  })

  it('counts critical safety expectations as misses when a run errors', () => {
    const expected = {
      scope_signal: 'in_scope',
      required_safety_signals: ['smoke_or_burning'],
      forbidden_safety_signals: ['water_near_power'],
    }
    const errored = {
      id: 'safety-error',
      difficulty: 'hard',
      repetition: 1,
      expected,
      observed: null,
      error: new Error('http_500'),
      score: scorePlaybookCase(expected, null, new Error('http_500')),
    }

    expect(aggregatePlaybookResults([errored]).safety).toMatchObject({
      expected_required_signals: 1,
      observed_required_signals: 0,
      required_signal_misses: 1,
      required_signal_recall: 0,
      expected_immediate_critical_signals: 1,
      immediate_critical_misses: 1,
      expected_capability_signals: 0,
      capability_misses: 0,
      forbidden_signal_checks: 0,
      false_positive_rate: null,
    })
    expect(aggregateRepetitionStability([errored])).toMatchObject({
      repetition_evidence_available: false,
      fully_consistent_cases: null,
      fully_consistent_rate: null,
      consistency_rate: null,
      errored_cases: 1,
      errored_runs: 1,
      worst_run_required_signal_misses: 1,
      worst_run_immediate_critical_misses: 1,
      worst_run_capability_misses: 0,
      cases_with_any_required_signal_miss: 1,
      cases_with_any_immediate_critical_miss: 1,
      cases_with_any_capability_miss: 0,
    })
  })

  it('does not present a one-sample case as repeated-run stability evidence', () => {
    const expected = { scope_signal: 'in_scope', suggested_service: null }
    const stability = aggregateRepetitionStability([
      repeatRun('single-sample', 1, expected, observation()),
    ])

    expect(stability).toMatchObject({
      min_repetitions: 1,
      max_repetitions: 1,
      repetition_evidence_available: false,
      fully_consistent_cases: null,
      fully_consistent_rate: null,
      consistency_rate: null,
      errored_cases: 0,
      errored_runs: 0,
      per_case: [{ fully_consistent: null, consistency_rate: null }],
    })
  })

  it('keeps repeated identical errors out of the error-aware stability headline', () => {
    const expected = { scope_signal: 'in_scope', suggested_service: null }
    const repeatedErrors = [1, 2, 3].map((repetition) => ({
      id: 'repeated-error',
      difficulty: 'hard',
      repetition,
      expected,
      observed: null,
      error: new Error('http_500'),
      score: scorePlaybookCase(expected, null, new Error('http_500')),
    }))

    expect(aggregateRepetitionStability(repeatedErrors)).toMatchObject({
      repetition_evidence_available: true,
      fully_consistent_cases: 0,
      fully_consistent_rate: 0,
      consistency_rate: 1,
      errored_cases: 1,
      errored_runs: 3,
      per_case: [{ fully_consistent: false, consistency_rate: 1, errored_runs: 3 }],
    })
  })

  it('marks deterministic mock timing and stability evidence as not applicable', () => {
    const expected = {
      scope_signal: 'in_scope',
      suggested_service: null,
      required_safety_signals: ['smoke_or_burning', 'protective_device'],
    }
    const runs = [{
      ...repeatRun('breaker', 1, expected, observation({ safety_signals: [] })),
      turns: 1,
      latency_ms: 0,
    }]

    const evidence = normalizeEvalEvidenceForRunMode(
      'mock',
      aggregatePlaybookResults(runs),
      aggregateRepetitionStability(runs),
    )

    expect(evidence.metrics.conversation).toEqual({
      average_turns: null,
      clarification_rate: 0,
      latency_ms_p50: null,
      latency_ms_p95: null,
    })
    expect(evidence.stability).toMatchObject({
      repetition_evidence_available: false,
      fully_consistent_cases: null,
      fully_consistent_rate: null,
      consistency_rate: null,
      worst_run_immediate_critical_misses: 1,
      worst_run_capability_misses: 1,
      per_case: [{ fully_consistent: null, consistency_rate: null }],
    })
  })

  it('keeps the mandatory report template and mock diagnostic boundary', () => {
    const runner = readFileSync(
      new URL('../../../scripts/kael-playbook-eval.mjs', import.meta.url),
      'utf8',
    )

    for (const heading of [
      '## Hypothesis',
      '## Changed',
      '## Baseline',
      '## After',
      '## Delta',
      '## Verification actually run',
      '## Human/domain review still required',
      '## Risks/Limitations',
      '## Decision',
      '## Next Step',
    ]) {
      expect(runner).toContain(heading)
    }
    expect(runner).toContain('## Local diagnostic metrics (not After)')
    expect(runner).toContain('**NOT RUN.** Deterministic fixture replay')
    expect(runner).toContain('Immediate-critical recall')
    expect(runner).toContain('Capability-signal recall')
    expect(runner).toContain('Observed clarification rate')
    expect(runner).toContain('Repeated-run fully-consistent rate (error-aware)')
    expect(runner).toContain('Errored case groups / runs')
    expect(runner).toContain('**NEEDS_HOLDOUT**')
    for (const sourceFile of [
      'supabase/functions/mobile-api/_shared/kael/index.ts',
      'supabase/functions/mobile-api/_shared/services/serializers.ts',
    ]) {
      expect(runner).toContain(`'${sourceFile}'`)
    }
  })

  it.each([
    ['repository root', REPO_ROOT, 'apps/api/scripts/fixtures/kael-playbook-eval-mock.json', CLI_REPORT_LABELS[0]],
    ['apps/api', API_ROOT, './scripts/fixtures/kael-playbook-eval-mock.json', CLI_REPORT_LABELS[1]],
  ])('resolves the approved mock fixture from %s', (_name, cwd, mockPath, label) => {
    const result = spawnSync(
      process.execPath,
      [
        resolve(API_ROOT, 'scripts/kael-playbook-eval.mjs'),
        '--mock', mockPath,
        '--label', label,
        '--date', CLI_REPORT_DATE,
        '--limit', '1',
        '--repetitions', '1',
        '--allow-failures',
      ],
      { cwd, encoding: 'utf8' },
    )

    expect(result.status, result.stderr || result.stdout).toBe(0)
    const report = readFileSync(
      resolve(REPO_ROOT, `docs/test-logs/${CLI_REPORT_DATE}_kael-playbook-electrical-${label}.md`),
      'utf8',
    )
    expect(report).toContain('**NEEDS_HOLDOUT**')
    expect(report.endsWith('\n')).toBe(true)
    expect(report.endsWith('\n\n')).toBe(false)
  })

  it('rejects a mock fixture path outside the approved directory', () => {
    const result = spawnSync(
      process.execPath,
      [
        resolve(API_ROOT, 'scripts/kael-playbook-eval.mjs'),
        '--mock', '../../docs/playbooks/eval/electrical-cases.json',
        '--label', 'cwd-traversal-contract',
        '--date', CLI_REPORT_DATE,
        '--limit', '1',
        '--allow-failures',
      ],
      { cwd: API_ROOT, encoding: 'utf8' },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('mock_path_outside_fixture_directory')
  })

  it('rejects a fixture junction whose canonical target is outside the approved directory', () => {
    const outsideDirectory = mkdtempSync(join(tmpdir(), 'kael-eval-outside-'))
    const junctionName = `.kael-eval-outside-${process.pid}-${Date.now()}`
    const junctionPath = resolve(API_ROOT, 'scripts/fixtures', junctionName)
    writeFileSync(resolve(outsideDirectory, 'mock.json'), '{}')

    try {
      symlinkSync(outsideDirectory, junctionPath, 'junction')
      const result = spawnSync(
        process.execPath,
        [
          resolve(API_ROOT, 'scripts/kael-playbook-eval.mjs'),
          '--mock', `./scripts/fixtures/${junctionName}/mock.json`,
          '--label', 'cwd-junction-contract',
          '--date', CLI_REPORT_DATE,
          '--limit', '1',
          '--allow-failures',
        ],
        { cwd: API_ROOT, encoding: 'utf8' },
      )

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('mock_path_outside_fixture_directory')
    } finally {
      if (existsSync(junctionPath)) unlinkSync(junctionPath)
      rmSync(outsideDirectory, { recursive: true, force: true })
    }
  })

  it('builds an auditable manifest and preserves only sanitized raw observations', () => {
    const artifact = buildSanitizedRawArtifact({
      git_sha: 'abc123',
      git_sha_scope: 'local_base_commit',
      deployment_version: 'local-mock',
      deployment_version_source: 'local_mock_constant',
      deployment_attestation: 'not_performed',
      model_id: 'model-a',
      model_ids: ['model-a'],
      provider: 'unobserved',
      sampling_config: null,
      prompt_version: 'intake.v2',
      playbook_version: 'electrical.v2',
      observed_playbook_state: 'on',
      playbook_hash: SHA256_A,
      playbook_hash_scope: 'full_local_source_file',
      playbook_source_path: 'supabase/functions/mobile-api/_shared/kael/playbooks/electrical.ts',
      source_tree_hash: SHA256_B,
      source_scope: 'local_curated_source_set',
      source_files: ['apps/api/scripts/kael-playbook-eval.mjs'],
      source_hash_algorithm: 'sha256_path_and_file_sha256_v1',
      source_state: 'base_sha_with_uncommitted_sources',
      fixture_hash: SHA256_C,
      selected_case_hash: SHA256_D,
      corpus_path: 'docs/playbooks/eval/electrical-cases.json',
      feature_flags: { electrical_playbook: true, ignored_non_boolean: 'secret' },
      corpus_version: 'electrical-dev-v1',
      run_mode: 'mock',
      started_at: '2026-07-16T00:00:00.000Z',
      repetitions: 3,
      repetition_strategy: 'deterministic_fixture_replay',
      run_config: { offset: 0, limit: 24, max_turns: 3, district: 'q7' },
      bearer_token: 'private-token',
    }, [
      {
        id: 'el_01',
        repetition: 2,
        turns: 2,
        latency_ms: 125,
        observed: {
          ...observation({ safety_signals: ['protective_device'] }),
          customer_email: 'private@example.com',
        },
        error: 'http_500: private response body',
        response: { text_content: 'private customer message' },
      },
      {
        id: 'el_02',
        repetition: 2,
        turns: 1,
        latency_ms: 25,
        observed: null,
        error: 'private@example.com could not be processed',
      },
    ])

    expect(artifact).toEqual({
      manifest: {
        git_sha: 'abc123',
        git_sha_scope: 'local_base_commit',
        deployment_version: 'local-mock',
        deployment_version_source: 'local_mock_constant',
        deployment_attestation: 'not_performed',
        model_id: 'model-a',
        model_ids: ['model-a'],
        provider: 'unobserved',
        sampling_config: null,
        prompt_version: 'intake.v2',
        playbook_version: 'electrical.v2',
        observed_playbook_state: 'on',
        playbook_hash: SHA256_A,
        playbook_hash_scope: 'full_local_source_file',
        playbook_source_path: 'supabase/functions/mobile-api/_shared/kael/playbooks/electrical.ts',
        source_tree_hash: SHA256_B,
        source_scope: 'local_curated_source_set',
        source_files: ['apps/api/scripts/kael-playbook-eval.mjs'],
        source_hash_algorithm: 'sha256_path_and_file_sha256_v1',
        source_state: 'base_sha_with_uncommitted_sources',
        fixture_hash: SHA256_C,
        selected_case_hash: SHA256_D,
        corpus_path: 'docs/playbooks/eval/electrical-cases.json',
        feature_flags: { electrical_playbook: true },
        corpus_version: 'electrical-dev-v1',
        run_mode: 'mock',
        started_at: '2026-07-16T00:00:00.000Z',
        repetitions: 3,
        repetition_strategy: 'deterministic_fixture_replay',
        run_config: { offset: 0, limit: 24, max_turns: 3, district: 'q7' },
      },
      observations: [
        {
          id: 'el_01',
          repetition: 2,
          turns: null,
          clarification_turns: null,
          latency_ms: null,
          observation: observation({ safety_signals: ['protective_device'] }),
          final_observation: observation({ safety_signals: ['protective_device'] }),
          error_code: 'http_500',
        },
        {
          id: 'el_02',
          repetition: 2,
          turns: null,
          clarification_turns: null,
          latency_ms: null,
          observation: null,
          final_observation: null,
          error_code: 'runner_error',
        },
      ],
    })
    expect(JSON.stringify(artifact)).not.toMatch(/private|bearer_token|text_content|customer_email/)
  })

  it('selects an unused user turn for the exact clarification slot', () => {
    const response = {
      turns: [{
        content_type: 'clarification',
        clarification: {
          missing_slots: ['breaker_state', 'breaker_state'],
          question: 'Aptomat dang o trang thai nao?',
        },
      }],
    }
    const testCase = {
      detail: 'This fallback must not be repeated.',
      user_turns: [
        { when_asked_for: 'duration', reply: 'Tu hom qua.' },
        { when_asked_for: 'breaker_state', reply: 'Aptomat dang sap.' },
        { when_asked_for: 'photo', fixture: 'images/breaker.jpg' },
      ],
    }

    const requested = requestedSlotsFromResponse(response)

    expect(requested).toEqual(['breaker_state'])
    expect(selectUserTurn(testCase, requested, [])).toEqual({
      index: 1,
      when_asked_for: 'breaker_state',
      reply: 'Aptomat dang sap.',
      fixture: null,
    })
    expect(selectUserTurn(testCase, requested, [1])).toBeNull()
    expect(selectUserTurn({ detail: 'legacy only' }, requested, [])).toBeNull()
  })

  it('records a requested live arm without falsely claiming it was observed', () => {
    const artifact = buildSanitizedRawArtifact({
      git_sha: 'abc123',
      git_sha_scope: 'local_base_commit',
      deployment_version: 'mobile-api-v132',
      deployment_version_source: 'operator_supplied',
      deployment_attestation: 'not_performed',
      model_id: 'unobserved',
      model_ids: [],
      provider: 'unobserved',
      sampling_config: null,
      prompt_version: 'unobserved',
      playbook_version: null,
      observed_playbook_state: 'unobserved',
      playbook_hash: SHA256_A,
      playbook_hash_scope: 'full_local_source_file',
      playbook_source_path: 'supabase/functions/mobile-api/_shared/kael/playbooks/electrical.ts',
      source_tree_hash: SHA256_B,
      source_scope: 'local_curated_source_set',
      source_files: ['apps/api/scripts/kael-playbook-eval.mjs'],
      source_hash_algorithm: 'sha256_path_and_file_sha256_v1',
      source_state: 'clean_commit',
      fixture_hash: null,
      selected_case_hash: SHA256_D,
      corpus_path: 'docs/playbooks/eval/electrical-cases.json',
      feature_flags: { electrical_playbook: true },
      corpus_version: 'sha256:corpus',
      run_mode: 'live',
      started_at: '2026-07-16T00:00:00.000Z',
      repetitions: 1,
      repetition_strategy: 'independent_live_sessions',
      run_config: { offset: 0, limit: 1, max_turns: 3, district: 'q7' },
    }, [])

    expect(artifact.manifest).toMatchObject({
      feature_flags: { electrical_playbook: true },
      playbook_version: null,
      observed_playbook_state: 'unobserved',
    })
  })

  it('rejects mock deployment spoofing and unbounded provenance paths', () => {
    expect(() => createRunManifest(validManifest({
      deployment_version: 'mobile-api-v132',
      deployment_version_source: 'operator_supplied',
    }))).toThrow('invalid manifest.mock_deployment_provenance')
    expect(() => createRunManifest(validManifest({
      source_files: ['../outside-repo.ts'],
    }))).toThrow('invalid manifest.source_files')
    expect(() => createRunManifest(validManifest({
      deployment_version: 'mobile-api-v132\nAUTH_TOKEN=secret',
    }))).toThrow('invalid manifest.deployment_version')
    expect(() => createRunManifest(validManifest({
      deployment_version: `eyJ${'a'.repeat(140)}.payload.signature`,
    }))).toThrow('invalid manifest.deployment_version')
  })

  it('preserves measured timing only for a live run', () => {
    const artifact = buildSanitizedRawArtifact(validManifest({
      run_mode: 'live',
      deployment_version: 'mobile-api-v132',
      deployment_version_source: 'operator_supplied',
      fixture_hash: null,
      repetitions: 1,
      repetition_strategy: 'independent_live_sessions',
    }), [{
      id: 'el_01',
      repetition: 1,
      turns: 2,
      latency_ms: 125,
      observed: observation(),
      error: null,
    }])

    expect(artifact.observations[0]).toMatchObject({ turns: 2, latency_ms: 125 })
  })

  it('rejects non-canonical observation identifiers', () => {
    expect(() => sanitizeIntakeObservation(observation({
      problem_slug: 'invented_electrical_slug',
    }))).toThrow('problem_slug')
    expect(() => sanitizeIntakeObservation(observation({
      safety_signals: ['invented_hazard'],
    }))).toThrow('safety_signals')
  })

  it('strictly validates the expected electrical corpus contract', () => {
    expect(validatePlaybookCorpus([validCorpusCase()])).toEqual([validCorpusCase()])
    expect(() => validatePlaybookCorpus([validCorpusCase({
      expected: {
        scope_signal: 'in_scope',
        suggested_service: null,
        acceptable_problem_slugs: ['breaker_trip', 'other_electrical'],
        safety_signals: [],
        needs_clarification: true,
        complexity: null,
      },
    })])).not.toThrow()

    expect(() => validatePlaybookCorpus([
      validCorpusCase({ id: 'duplicate' }),
      validCorpusCase({ id: 'duplicate' }),
    ])).toThrow('duplicate corpus case id')
    expect(() => validatePlaybookCorpus([
      validCorpusCase({ expected: { ...validExpected(), problem_slug: 'invented_slug' } }),
    ])).toThrow('invalid corpus expected.problem_slug')
    expect(() => validatePlaybookCorpus([
      validCorpusCase({
        expected: {
          ...validExpected(),
          scope_signal: 'out_of_scope',
          problem_slug: 'breaker_trip',
        },
      }),
    ])).toThrow('inconsistent corpus expected.problem_slug')
    expect(() => validatePlaybookCorpus([
      validCorpusCase({ expected: { ...validExpected(), safety_signals: ['invented_hazard'] } }),
    ])).toThrow('invalid corpus expected.safety_signals')
    expect(() => validatePlaybookCorpus([
      validCorpusCase({
        expected: {
          ...validExpected(),
          safety_signals: ['smoke_or_burning'],
          forbidden_safety_signals: ['smoke_or_burning'],
        },
      }),
    ])).toThrow('overlapping corpus safety signals')
    expect(() => validatePlaybookCorpus([
      { ...validCorpusCase(), customer_email: 'private@example.com' },
    ])).toThrow('unknown corpus case field')
  })

  it('validates the canonical electrical corpus with the same strict contract', () => {
    const corpus = JSON.parse(readFileSync(
      new URL('../../../../../docs/playbooks/eval/electrical-cases.json', import.meta.url),
      'utf8',
    ))

    expect(validatePlaybookCorpus(corpus)).toEqual(corpus)
  })

  it('allows only canonical districts and the approved HTTPS staging target', () => {
    expect(validateEvalDistrict('q7')).toBe('q7')
    expect(() => validateEvalDistrict('hcmc_all')).toThrow('invalid_eval_district')
    expect(() => validateEvalDistrict('district-seven')).toThrow('invalid_eval_district')
    expect(validateStagingEvalTargets(
      'https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api',
      'https://xyylanuyflrjzbjzhqfl.supabase.co',
      'xyylanuyflrjzbjzhqfl',
    )).toEqual({
      mobileApiUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api',
      supabaseUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co',
    })
    expect(() => validateStagingEvalTargets(
      'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api',
      null,
      'xyylanuyflrjzbjzhqfl',
    )).toThrow('unapproved_mobile_api_target')
    expect(() => validateStagingEvalTargets(
      'http://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api',
      null,
      'xyylanuyflrjzbjzhqfl',
    )).toThrow('invalid_mobile_api_url')
    expect(() => validateStagingEvalTargets(
      'https://xyylanuyflrjzbjzhqfl.supabase.co:444/functions/v1/mobile-api',
      null,
      'xyylanuyflrjzbjzhqfl',
    )).toThrow('invalid_mobile_api_url')
  })

  it('honors a bounded Retry-After value and fails closed above the safe maximum', () => {
    expect(resolveRetryWaitSeconds(null, 190)).toBe(190)
    expect(resolveRetryWaitSeconds('210', 190)).toBe(210)
    expect(resolveRetryWaitSeconds('120', 190)).toBe(190)
    expect(() => resolveRetryWaitSeconds('3601', 190)).toThrow(
      'retry_after_exceeds_max_3600_seconds',
    )
    expect(() => resolveRetryWaitSeconds('Wed, 21 Oct 2026 07:28:00 GMT', 190)).toThrow(
      'invalid_retry_after',
    )
  })
})

function observation(overrides: Record<string, unknown> = {}) {
  return {
    scope_signal: 'in_scope',
    suggested_service: null,
    problem_slug: 'breaker_trip',
    needs_clarification: false,
    safety_signals: [],
    model_id: 'model-a',
    prompt_version: 'intake.v2',
    playbook_version: 'electrical.v2',
    ...overrides,
  }
}

function scoredRun(
  id: string,
  expectedScope: string,
  observedScope: string,
  expectedService: string | null,
  observedService: string | null,
) {
  const expected = {
    scope_signal: expectedScope,
    suggested_service: expectedService,
  }
  const observed = observation({
    scope_signal: observedScope,
    suggested_service: observedService,
    problem_slug: null,
  })
  return {
    id,
    difficulty: 'easy',
    repetition: 1,
    expected,
    observed,
    error: null,
    score: scorePlaybookCase(expected, observed),
  }
}

function repeatRun(
  id: string,
  repetition: number,
  expected: Record<string, unknown>,
  observed: ReturnType<typeof observation>,
) {
  return {
    id,
    difficulty: 'easy',
    repetition,
    expected,
    observed,
    error: null,
    score: scorePlaybookCase(expected, observed),
  }
}

const SHA256_A = `sha256:${'a'.repeat(64)}`
const SHA256_B = `sha256:${'b'.repeat(64)}`
const SHA256_C = `sha256:${'c'.repeat(64)}`
const SHA256_D = `sha256:${'d'.repeat(64)}`

function validExpected() {
  return {
    problem_slug: 'breaker_trip',
    scope_signal: 'in_scope',
    suggested_service: null,
    safety_signals: ['protective_device'],
    needs_clarification: false,
    complexity: 'medium',
  }
}

function validCorpusCase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'el_valid',
    input_text_vi: 'Aptomat nha toi bi sap lien tuc.',
    expected: validExpected(),
    difficulty: 'medium',
    rationale: 'Known electrical symptom.',
    detail: 'Aptomat sap lai sau khi bat.',
    ...overrides,
  }
}

function validManifest(overrides: Record<string, unknown> = {}) {
  return {
    git_sha: 'abc123',
    git_sha_scope: 'local_base_commit',
    deployment_version: 'local-mock',
    deployment_version_source: 'local_mock_constant',
    deployment_attestation: 'not_performed',
    model_id: 'model-a',
    model_ids: ['model-a'],
    provider: 'unobserved',
    sampling_config: null,
    prompt_version: 'intake.v2',
    playbook_version: 'electrical.v2',
    observed_playbook_state: 'on',
    playbook_hash: SHA256_A,
    playbook_hash_scope: 'full_local_source_file',
    playbook_source_path: 'supabase/functions/mobile-api/_shared/kael/playbooks/electrical.ts',
    source_tree_hash: SHA256_B,
    source_scope: 'local_curated_source_set',
    source_files: ['apps/api/scripts/kael-playbook-eval.mjs'],
    source_hash_algorithm: 'sha256_path_and_file_sha256_v1',
    source_state: 'clean_commit',
    fixture_hash: SHA256_C,
    selected_case_hash: SHA256_D,
    corpus_path: 'docs/playbooks/eval/electrical-cases.json',
    feature_flags: {},
    corpus_version: SHA256_D,
    run_mode: 'mock',
    started_at: '2026-07-16T00:00:00.000Z',
    repetitions: 3,
    repetition_strategy: 'deterministic_fixture_replay',
    run_config: { offset: 0, limit: 24, max_turns: 3, district: 'q7' },
    ...overrides,
  }
}
