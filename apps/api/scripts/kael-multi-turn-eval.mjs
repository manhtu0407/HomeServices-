#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const args = [
  '--filter',
  '@nestscout/shared',
  'exec',
  'vitest',
  'run',
  'src/__tests__/kael-multi-turn-eval.test.ts',
  '--reporter=verbose',
]

const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : pnpm
const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', pnpm, ...args] : args
const child = spawn(command, commandArgs, {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
})
child.on('error', (error) => {
  console.error(`Unable to start multi-turn evaluation: ${error.message}`)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Multi-turn evaluation terminated by ${signal}`)
    process.exitCode = 1
    return
  }
  process.exitCode = code ?? 1
})
