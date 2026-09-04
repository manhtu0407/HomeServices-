import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireFromMobile = createRequire(resolve(ROOT, 'apps/mobile/package.json'))
const ts = requireFromMobile('typescript')
const SOURCE_ROOTS = Object.freeze([
  'apps/mobile/app',
  'apps/mobile/components',
  'apps/mobile/lib',
])
const BANNED_VISIBLE_COPY = Object.freeze([
  /\b(?:cohort|debug|harness|native customer|native worker|operation id|release id|stage\s*\d+|test|tier\s*[ab]|trace id)\b/iu,
  /\b(?:staging|synthetic|technician)\b/iu,
  /(?:bản test|mã operation|mã trace|môi trường test|kiểm thử|thử nghiệm)/iu,
  /(?:kỹ thuật viên|lý do kỹ thuật|mang tính kỹ thuật|technical reason)/iu,
])

export function auditProductionUiCopy(rootInput = ROOT) {
  const root = resolve(rootInput)
  const files = SOURCE_ROOTS.flatMap((entry) => collectSourceFiles(root, entry)).sort()
  if (files.length === 0) throw new Error('production UI copy audit found no runtime source files')
  const sourceHash = createHash('sha256')
  const unsafe = []
  let visibleLiteralCount = 0
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const local = relative(root, file).replaceAll('\\', '/')
    sourceHash.update(`${local}\0${source}\0`)
    const syntax = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, syntax)
    const visit = (node) => {
      const value = visibleLiteralValue(node)
      if (value !== null && likelyVisible(node, value)) {
        visibleLiteralCount += 1
        const rule = BANNED_VISIBLE_COPY.find((pattern) => pattern.test(value))
        if (rule) {
          const position = ast.getLineAndCharacterOfPosition(node.getStart(ast))
          unsafe.push({
            file: local,
            line: position.line + 1,
            column: position.character + 1,
            copy: value.trim().replace(/\s+/gu, ' ').slice(0, 180),
          })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  return Object.freeze({
    sourceSha256: sourceHash.digest('hex'),
    scannedFileCount: files.length,
    visibleLiteralCount,
    unsafe: Object.freeze(unsafe),
  })
}

export function buildProductionUiNormalityReceipt(input = {}) {
  const audit = input.audit ?? auditProductionUiCopy(input.root)
  if (audit.unsafe.length > 0) throw new Error('production UI copy contains internal release or test terminology')
  const receipt = {
    schemaVersion: 'stage1-production-ui-normality.v1',
    status: 'passed',
    sourceSha256: audit.sourceSha256,
    scannedFileCount: audit.scannedFileCount,
    visibleLiteralCount: audit.visibleLiteralCount,
    unsafeVisibleCopyCount: 0,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    receiptSha256: '',
  }
  receipt.receiptSha256 = receiptSha256(receipt)
  return Object.freeze(receipt)
}

export function verifyProductionUiNormalityReceipt(receipt) {
  return receipt?.schemaVersion === 'stage1-production-ui-normality.v1' &&
    receipt.status === 'passed' && /^[0-9a-f]{64}$/u.test(receipt.sourceSha256 ?? '') &&
    Number.isSafeInteger(receipt.scannedFileCount) && receipt.scannedFileCount > 0 &&
    Number.isSafeInteger(receipt.visibleLiteralCount) && receipt.visibleLiteralCount > 0 &&
    receipt.unsafeVisibleCopyCount === 0 && receipt.receiptSha256 === receiptSha256(receipt)
}

function collectSourceFiles(root, entry) {
  const target = resolve(root, entry)
  if (!existsSync(target)) return []
  const files = []
  const walk = (directory) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (item.name === '__tests__' || item.name === 'node_modules') continue
      const path = resolve(directory, item.name)
      if (item.isDirectory()) walk(path)
      else if (item.isFile() && /\.(?:ts|tsx)$/u.test(item.name) &&
          !/(?:^|[-.])test(?:[-.]|$)/iu.test(item.name)) files.push(path)
    }
  }
  walk(target)
  return files
}

function visibleLiteralValue(node) {
  if (ts.isJsxText(node) || ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return node.text
  return null
}

function likelyVisible(node, value) {
  if (/\s/u.test(value)) return true
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxAttribute(current)) {
      return !new Set(['id', 'key', 'nativeID', 'testID']).has(current.name.getText())
    }
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return true
    if (ts.isCallExpression(current)) {
      const name = current.expression.getText()
      return /(?:setError|setRemoteError|Alert\.alert)$/u.test(name)
    }
    if (ts.isSourceFile(current)) break
  }
  return false
}

function receiptSha256(receipt) {
  return createHash('sha256').update([
    receipt.schemaVersion,
    receipt.status,
    receipt.sourceSha256,
    receipt.scannedFileCount,
    receipt.visibleLiteralCount,
    receipt.unsafeVisibleCopyCount,
    receipt.generatedAt,
  ].map(String).join('\n')).digest('hex')
}

function outputPath(value) {
  const output = resolve(ROOT, value)
  const local = relative(ROOT, output)
  if (!local || local.startsWith('..')) throw new Error('production UI receipt path escapes repository root')
  return output
}

function main() {
  const audit = auditProductionUiCopy(ROOT)
  if (audit.unsafe.length > 0) {
    for (const finding of audit.unsafe) {
      console.error(`${finding.file}:${finding.line}:${finding.column}: unsafe visible copy: ${finding.copy}`)
    }
    throw new Error(`${audit.unsafe.length} internal release/test term(s) can reach Production UI copy`)
  }
  const receipt = buildProductionUiNormalityReceipt({ audit })
  const outputIndex = process.argv.indexOf('--output')
  if (outputIndex >= 0) {
    const value = process.argv[outputIndex + 1]
    if (!value || value.startsWith('--')) throw new Error('--output requires a value')
    const output = outputPath(value)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`)
  }
  console.log(`production UI normality passed: ${receipt.scannedFileCount} files, ${receipt.visibleLiteralCount} visible literals, 0 unsafe terms`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
