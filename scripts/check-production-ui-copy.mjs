import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireFromMobile = createRequire(resolve(ROOT, 'apps/mobile/package.json'))
let typescriptModule = null

// Loaded on first use, not at import: this module sits in the release-control import graph, and the
// hourly reconcile action runs in a job with no workspace install, where a module-level require
// fails before any action can run.
function typescriptApi() {
  typescriptModule ??= requireFromMobile('typescript')
  return typescriptModule
}
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
const ENGLISH_IN_VI_COPY = Object.freeze([
  /\b(?:customer|worker|technician|workflow|profile|choose|area|local|deal)\b/iu,
  /\b(?:loading|retry|payment|review|job|pending|confirmed|failed|unavailable|support)\b/iu,
  /\b(?:request|submit|cancel|continue|completed|approved|rejected|ready|saved|onboarding|draft|application)\b/iu,
  /\b(?:problem|baseline|quote-ready|server|active|revision|taxonomy|canonical|service type|back)\b/iu,
  /\b(?:admin|rule|dependency|dependencies|evidence|provenance|deploy|deployed|undo|slug)\b/iu,
  /\b(?:receipt|timeline|snapshot|metadata|quorum|reserve|reserved|cash|scope|preview)\b/iu,
])
const VIETNAMESE_DIACRITIC = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu
const NON_COPY_OBJECT_FIELDS = new Set(['href', 'icon', 'id', 'key', 'nativeID', 'path', 'route', 'slug', 'testID'])
const NEUTRAL_VI_TOKENS = new Set([
  'ai', 'android', 'apns', 'apple', 'expo', 'fcm', 'google', 'hcm', 'ios', 'kael', 'otp', 'qr', 'sepay', 'tp', 'vietqr', 'vnd', 'wifi',
])
const COMMON_ENGLISH_WORDS = new Set([
  'a', 'after', 'all', 'and', 'are', 'at', 'back', 'begin', 'better', 'breath', 'calm', 'clear', 'clearly', 'context',
  'count', 'day', 'details', 'difference', 'down', 'enough', 'feel', 'find', 'focus', 'for', 'give', 'good', 'got', 'help',
  'helps', 'here', 'it', 'keep', 'less', 'let', 'lighter', 'make', 'matters', 'mind', 'moment', 'more', 'next', 'noise',
  'one', 'pace', 'pause', 'quiet', 'ready', 'request', 'reset', 'room', 'scope', 'service', 'shape', 'simple', 'slow',
  'small', 'smoother', 'space', 'start', 'starts', 'steady', 'step', 'steps', 'still', 'take', 'tell', 'the', 'thing',
  'think', 'this', 'time', 'today', 'unfold', 'we', 'what', 'when', 'where', 'with', 'you', 'your', 'yourself',
])

export function auditProductionUiCopy(rootInput = ROOT) {
  const ts = typescriptApi()
  const root = resolve(rootInput)
  const files = SOURCE_ROOTS.flatMap((entry) => collectSourceFiles(root, entry)).sort()
  if (files.length === 0) throw new Error('production UI copy audit found no runtime source files')
  const sourceHash = createHash('sha256')
  const unsafe = []
  const languageLeakage = []
  const localizedLiteralKeys = new Set()
  let visibleLiteralCount = 0
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const local = relative(root, file).replaceAll('\\', '/')
    sourceHash.update(`${local}\0${source}\0`)
    const syntax = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, syntax)
    const recordLocalizedExpression = (expression, language, origin) => {
      for (const literal of staticTextLiterals(expression)) {
        const value = literal.text.trim().replace(/\s+/gu, ' ')
        if (!value) continue
        const key = `${literal.getStart(ast)}:${language}`
        if (localizedLiteralKeys.has(`${local}:${key}`)) continue
        localizedLiteralKeys.add(`${local}:${key}`)
        const reason = languageLeakReason(language, value)
        if (!reason) continue
        const position = ast.getLineAndCharacterOfPosition(literal.getStart(ast))
        languageLeakage.push({
          file: local,
          line: position.line + 1,
          column: position.character + 1,
          language,
          origin,
          reason,
          copy: value.slice(0, 180),
        })
      }
    }
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
      if (ts.isCallExpression(node) && isTextByLanguageCall(node)) {
        recordLocalizedExpression(node.arguments[1], 'vi', 'textByLanguage')
        recordLocalizedExpression(node.arguments[2], 'en', 'textByLanguage')
      } else if (ts.isConditionalExpression(node)) {
        const slots = conditionalLanguageSlots(node)
        if (slots) {
          recordLocalizedExpression(slots.vi, 'vi', 'language-conditional')
          recordLocalizedExpression(slots.en, 'en', 'language-conditional')
        }
      } else if (ts.isObjectLiteralExpression(node)) {
        const slots = objectLanguageSlots(node)
        if (slots) {
          recordLocalizedExpression(slots.vi, 'vi', 'language-object')
          recordLocalizedExpression(slots.en, 'en', 'language-object')
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
    localizedLiteralCount: localizedLiteralKeys.size,
    languageLeakage: Object.freeze(languageLeakage),
  })
}

export function buildProductionUiNormalityReceipt(input = {}) {
  const audit = input.audit ?? auditProductionUiCopy(input.root)
  if (audit.unsafe.length > 0) throw new Error('production UI copy contains internal release or test terminology')
  if (audit.languageLeakage.length > 0) throw new Error('production UI copy contains language leakage')
  const receipt = {
    schemaVersion: 'stage1-production-ui-normality.v2',
    status: 'passed',
    sourceSha256: audit.sourceSha256,
    scannedFileCount: audit.scannedFileCount,
    visibleLiteralCount: audit.visibleLiteralCount,
    localizedLiteralCount: audit.localizedLiteralCount,
    unsafeVisibleCopyCount: 0,
    languageLeakageCount: 0,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    receiptSha256: '',
  }
  receipt.receiptSha256 = receiptSha256(receipt)
  return Object.freeze(receipt)
}

export function verifyProductionUiNormalityReceipt(receipt) {
  return receipt?.schemaVersion === 'stage1-production-ui-normality.v2' &&
    receipt.status === 'passed' && /^[0-9a-f]{64}$/u.test(receipt.sourceSha256 ?? '') &&
    Number.isSafeInteger(receipt.scannedFileCount) && receipt.scannedFileCount > 0 &&
    Number.isSafeInteger(receipt.visibleLiteralCount) && receipt.visibleLiteralCount > 0 &&
    Number.isSafeInteger(receipt.localizedLiteralCount) && receipt.localizedLiteralCount > 0 &&
    receipt.unsafeVisibleCopyCount === 0 && receipt.languageLeakageCount === 0 &&
    receipt.receiptSha256 === receiptSha256(receipt)
}

function isTextByLanguageCall(node) {
  const ts = typescriptApi()
  if (node.arguments.length < 3) return false
  const expression = node.expression
  if (ts.isIdentifier(expression)) return expression.text === 'textByLanguage'
  return ts.isPropertyAccessExpression(expression) && expression.name.text === 'textByLanguage'
}

function conditionalLanguageSlots(node) {
  const ts = typescriptApi()
  const condition = unwrapExpression(node.condition)
  if (!ts.isBinaryExpression(condition)) return null
  const operator = condition.operatorToken.kind
  const equal = operator === ts.SyntaxKind.EqualsEqualsEqualsToken || operator === ts.SyntaxKind.EqualsEqualsToken
  const unequal = operator === ts.SyntaxKind.ExclamationEqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsToken
  if (!equal && !unequal) return null
  const left = unwrapExpression(condition.left)
  const right = unwrapExpression(condition.right)
  const literal = localeLiteral(left) ?? localeLiteral(right)
  const selector = localeLiteral(left) ? right : left
  if (!literal || !isLanguageSelector(selector)) return null
  const trueLanguage = equal ? literal : oppositeLanguage(literal)
  return trueLanguage === 'vi'
    ? { vi: node.whenTrue, en: node.whenFalse }
    : { vi: node.whenFalse, en: node.whenTrue }
}

function objectLanguageSlots(node) {
  const ts = typescriptApi()
  let vi = null
  let en = null
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = propertyName(property.name)
    if (name === 'vi') vi = property.initializer
    if (name === 'en') en = property.initializer
  }
  return vi && en ? { vi, en } : null
}

function propertyName(node) {
  const ts = typescriptApi()
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text
  return null
}

function localeLiteral(node) {
  const ts = typescriptApi()
  return ts.isStringLiteralLike(node) && (node.text === 'vi' || node.text === 'en') ? node.text : null
}

function isLanguageSelector(node) {
  const ts = typescriptApi()
  const expression = unwrapExpression(node)
  if (ts.isIdentifier(expression)) return /(?:language|locale)$/iu.test(expression.text)
  if (ts.isPropertyAccessExpression(expression)) return /(?:language|locale)$/iu.test(expression.name.text)
  return false
}

function oppositeLanguage(language) {
  return language === 'vi' ? 'en' : 'vi'
}

function unwrapExpression(node) {
  const ts = typescriptApi()
  let current = node
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current)) current = current.expression
  return current
}

function staticTextLiterals(node) {
  const ts = typescriptApi()
  const literals = []
  const visit = (current) => {
    if (ts.isStringLiteralLike(current) || ts.isTemplateHead(current) ||
        ts.isTemplateMiddle(current) || ts.isTemplateTail(current)) {
      literals.push(current)
      return
    }
    if (ts.isPropertyAssignment(current)) {
      const name = propertyName(current.name)
      if (!name || !NON_COPY_OBJECT_FIELDS.has(name)) visit(current.initializer)
      return
    }
    if (ts.isConditionalExpression(current)) {
      visit(current.whenTrue)
      visit(current.whenFalse)
      return
    }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind !== ts.SyntaxKind.PlusToken) return
    ts.forEachChild(current, visit)
  }
  visit(node)
  return literals
}

function languageLeakReason(language, value) {
  if (language === 'vi') {
    if (looksLikeMachineValue(value)) return null
    const marker = ENGLISH_IN_VI_COPY.find((pattern) => pattern.test(value))
    if (marker) return 'english-marker-in-vietnamese-slot'
    const words = value.toLocaleLowerCase('en-US').match(/[a-z]+(?:-[a-z]+)*/gu) ?? []
    const meaningfulWords = words.filter((word) => !NEUTRAL_VI_TOKENS.has(word.replaceAll('-', '')))
    const englishWordCount = meaningfulWords.filter((word) => COMMON_ENGLISH_WORDS.has(word)).length
    if (!VIETNAMESE_DIACRITIC.test(value) && englishWordCount >= 2 &&
        englishWordCount / Math.max(meaningfulWords.length, 1) >= 0.6) {
      return 'english-phrase-in-vietnamese-slot'
    }
    return null
  }
  return VIETNAMESE_DIACRITIC.test(value) ? 'vietnamese-diacritic-in-english-slot' : null
}

function looksLikeMachineValue(value) {
  if (/^#[0-9a-f]{3,8}$/iu.test(value)) return true
  if (!/\s/u.test(value) && /[_/@]/u.test(value)) return true
  return /^[a-z][a-z0-9]*(?:[.:/-][a-z0-9]+)+$/iu.test(value)
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
  const ts = typescriptApi()
  if (ts.isJsxText(node) || ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return node.text
  return null
}

function likelyVisible(node, value) {
  const ts = typescriptApi()
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
    receipt.localizedLiteralCount,
    receipt.unsafeVisibleCopyCount,
    receipt.languageLeakageCount,
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
  if (audit.languageLeakage.length > 0) {
    for (const finding of audit.languageLeakage) {
      console.error(`${finding.file}:${finding.line}:${finding.column}: ${finding.language} language leak (${finding.origin}): ${finding.copy}`)
    }
    throw new Error(`${audit.languageLeakage.length} localized Production UI term(s) use the wrong language`)
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
  console.log(`production UI normality passed: ${receipt.scannedFileCount} files, ${receipt.visibleLiteralCount} visible literals, ${receipt.localizedLiteralCount} localized literals, 0 unsafe terms`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
