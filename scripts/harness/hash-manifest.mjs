import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkHarnessManifest } from './check-manifest.mjs'

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function toRepoPath(path) {
  return path.split(sep).join('/')
}

function parseArgs(args) {
  const options = { json: false }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--json') options.json = true
    else if (argument === '--root') options.root = args[++index]
    else if (argument === '--manifest') options.manifestPath = args[++index]
    else throw new Error(`unknown argument: ${argument}`)
  }
  return options
}

const options = parseArgs(process.argv.slice(2))
const report = checkHarnessManifest({
  root: options.root ?? SCRIPT_ROOT,
  manifestPath: options.manifestPath,
})

if (!report.ok) {
  console.error('cannot hash an invalid harness manifest:')
  for (const problem of report.problems) console.error(`  - ${problem}`)
  process.exit(1)
}

const output = {
  manifest: toRepoPath(relative(report.root, report.manifestPath)),
  algorithm: 'sha256',
  digest: report.hash,
  entryCount: report.manifest.entries.length,
}

if (options.json) console.log(JSON.stringify(output, null, 2))
else console.log(`sha256:${output.digest}`)
