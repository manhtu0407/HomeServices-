import assert from 'node:assert/strict'
import test from 'node:test'

import { allowMainInCi, inspectGitState } from './check-ship-ready-git-state.mjs'

test('main remains blocked unless the caller opts into the main release check in CI', () => {
  assert.equal(allowMainInCi([], { CI: 'true', GITHUB_REF: 'refs/heads/main' }), false)
  assert.equal(allowMainInCi(['--allow-main-in-ci'], { CI: 'false', GITHUB_REF: 'refs/heads/main' }), false)
  assert.equal(allowMainInCi(['--allow-main-in-ci'], { CI: 'true', GITHUB_REF: 'refs/heads/feature' }), false)

  const state = inspectGitState({ branch: 'main', status: '' })
  assert.equal(state.problems[0]?.[0], 'on main — branch before you push')
})

test('an explicit main release check permits only a clean main checkout', () => {
  const allowMain = allowMainInCi(['--allow-main-in-ci'], {
    CI: 'true',
    GITHUB_REF: 'refs/heads/main',
  })

  assert.equal(allowMain, true)
  assert.deepEqual(inspectGitState({ branch: 'main', status: '', allowMain }).problems, [])
  assert.equal(inspectGitState({ branch: 'main', status: ' M changed.txt', allowMain }).problems.length, 1)
})

test('feature branches keep the existing clean-tree requirement', () => {
  assert.deepEqual(inspectGitState({ branch: 'codex/fix', status: '' }).problems, [])
  assert.equal(inspectGitState({ branch: 'codex/fix', status: '?? new.txt' }).problems.length, 1)
})

test('missing git state fails closed', () => {
  const state = inspectGitState({ branch: null, status: null })
  assert.equal(state.branch, 'unknown')
  assert.equal(state.problems[0]?.[0], 'git is not answering here — run this inside the repository')
})
