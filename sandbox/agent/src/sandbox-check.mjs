import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const sandboxRoot = resolve(packageDir, '..');
const repoRoot = resolve(sandboxRoot, '..');
const asJson = process.argv.includes('--json');

const errors = [];
const warnings = [];
const facts = [];

function repoPath(...parts) {
  return resolve(repoRoot, ...parts);
}

function displayPath(absolutePath) {
  return relative(repoRoot, absolutePath).replaceAll('\\', '/');
}

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function warn(condition, message) {
  if (!condition) {
    warnings.push(message);
  }
}

function readText(...parts) {
  return readFileSync(repoPath(...parts), 'utf8');
}

function readJson(...parts) {
  const absolutePath = repoPath(...parts);
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    errors.push(`Could not parse ${displayPath(absolutePath)}: ${error.message}`);
    return {};
  }
}

function requirePath(...parts) {
  const absolutePath = repoPath(...parts);
  assert(existsSync(absolutePath), `Missing required path: ${displayPath(absolutePath)}`);
  return absolutePath;
}

function walkFiles(root) {
  const found = [];
  if (!existsSync(root)) {
    return found;
  }

  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === '.runs') {
      continue;
    }

    const absolutePath = join(root, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      found.push(...walkFiles(absolutePath));
    } else {
      found.push(absolutePath);
    }
  }

  return found;
}

const rootPackage = readJson('package.json');
const sandboxPackage = readJson('sandbox', 'agent', 'package.json');
const workspaceText = readText('pnpm-workspace.yaml');
const sandboxGitignore = readText('sandbox', 'agent', '.gitignore');

requirePath('governance', 'critical.md');
requirePath('governance', 'RULES.md');
requirePath('governance', 'STRUCTURES.md');
requirePath('AGENTS.md');
requirePath('README.md');
requirePath('docs', 'architecture', 'code-ownership-map.md');
requirePath('apps', 'mobile', 'package.json');
requirePath('apps', 'api', 'package.json');
requirePath('packages', 'shared', 'package.json');
requirePath('scripts', 'run-package-script.ps1');
requirePath('sandbox', 'agent', 'workbench', 'README.md');

assert(
  workspaceText.includes('"sandbox/*"') || workspaceText.includes("'sandbox/*'") || workspaceText.includes('- sandbox/*'),
  'pnpm-workspace.yaml must include sandbox/*'
);

assert(sandboxPackage.name === '@nestscout/sandbox', 'sandbox package must be named @nestscout/sandbox');
assert(sandboxPackage.private === true, 'sandbox package must stay private');
assert(sandboxPackage.scripts?.test === 'node ./src/sandbox-check.mjs', 'sandbox test script must run sandbox-check.mjs');
assert(
  sandboxPackage.scripts?.['type-check'] === 'node --check ./src/sandbox-check.mjs',
  'sandbox type-check script must use node --check'
);

const rootScripts = rootPackage.scripts ?? {};
for (const scriptName of ['sandbox:test', 'sandbox:type-check', 'test:sandbox', 'type-check:sandbox']) {
  assert(Boolean(rootScripts[scriptName]), `root package.json missing ${scriptName}`);
  assert(
    String(rootScripts[scriptName]).includes('@nestscout/sandbox'),
    `root script ${scriptName} must target @nestscout/sandbox`
  );
}

assert(sandboxGitignore.includes('.runs/'), 'sandbox .gitignore must ignore generated .runs output');
assert(sandboxGitignore.includes('workbench/*'), 'sandbox .gitignore must ignore workbench scratch files');
assert(
  sandboxGitignore.includes('!workbench/README.md'),
  'sandbox .gitignore must keep workbench/README.md tracked'
);

const forbiddenEnvFiles = walkFiles(sandboxRoot)
  .map((filePath) => displayPath(filePath))
  .filter((filePath) => /(^|\/)\.env(\.|$)/.test(filePath));

assert(
  forbiddenEnvFiles.length === 0,
  `Sandbox must not contain .env files: ${forbiddenEnvFiles.join(', ')}`
);

warn(
  rootPackage.packageManager?.startsWith('pnpm@'),
  'root package.json should declare a pnpm packageManager'
);

facts.push(`repo=${displayPath(repoRoot) || '.'}`);
facts.push(`sandbox=${displayPath(sandboxRoot)}`);
facts.push(`package=${sandboxPackage.name}`);
facts.push(`workspacePattern=sandbox/*`);

if (asJson) {
  console.log(JSON.stringify({ ok: errors.length === 0, facts, warnings, errors }, null, 2));
} else {
  console.log('NestScout agent sandbox check');
  for (const fact of facts) {
    console.log(`- ${fact}`);
  }
  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`Error: ${error}`);
  }
  process.exitCode = 1;
} else if (!asJson) {
  console.log('Sandbox is ready for in-repo agent probes.');
}
