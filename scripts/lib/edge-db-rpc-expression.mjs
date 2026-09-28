import ts from 'typescript'
import { dirname, resolve as resolvePath } from 'node:path'

const RPC_NAME = /^[a-z][a-z0-9_]*$/

function unwrap(expression) {
  let current = expression
  while (current && (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  )) {
    current = current.expression
  }
  return current
}

function functionName(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text
  const parent = node.parent
  if (ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isIdentifier(parent.name)) {
    return parent.name.text
  }
  return null
}

function variableInitializer(container, name) {
  for (const statement of container.statements ?? []) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue
      if (!(statement.declarationList.flags & ts.NodeFlags.Const) || !declaration.initializer) {
        return { kind: 'dynamic', node: declaration }
      }
      return { kind: 'initializer', node: declaration, initializer: declaration.initializer }
    }
  }
  return null
}

function findBinding(identifier) {
  for (let current = identifier.parent; current; current = current.parent) {
    if (ts.isBlock(current) || ts.isSourceFile(current) || ts.isModuleBlock(current)) {
      const binding = variableInitializer(current, identifier.text)
      if (binding) return binding
    }

    if (ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current)) {
      const initializer = current.initializer
      if (initializer && ts.isVariableDeclarationList(initializer)) {
        for (const declaration of initializer.declarations) {
          if (!ts.isIdentifier(declaration.name) || declaration.name.text !== identifier.text) continue
          if (!(initializer.flags & ts.NodeFlags.Const) || !declaration.initializer) {
            return { kind: 'dynamic', node: declaration }
          }
          return { kind: 'initializer', node: declaration, initializer: declaration.initializer }
        }
      }
    }

    if (ts.isCatchClause(current) && current.variableDeclaration &&
      ts.isIdentifier(current.variableDeclaration.name) &&
      current.variableDeclaration.name.text === identifier.text) {
      return { kind: 'dynamic', node: current.variableDeclaration }
    }

    if (ts.isFunctionLike(current)) {
      const index = current.parameters.findIndex((parameter) =>
        ts.isIdentifier(parameter.name) && parameter.name.text === identifier.text)
      if (index >= 0) return { kind: 'parameter', node: current.parameters[index], index, fn: current }
    }
  }
  return null
}

function isWithin(node, ancestor) {
  for (let current = node; current; current = current.parent) {
    if (current === ancestor) return true
  }
  return false
}

function isAssignmentOperator(token) {
  return token >= ts.SyntaxKind.FirstAssignment && token <= ts.SyntaxKind.LastAssignment
}

function isWriteReference(identifier) {
  for (let current = identifier.parent; current; current = current.parent) {
    if (ts.isBinaryExpression(current) && isAssignmentOperator(current.operatorToken.kind) &&
      isWithin(identifier, current.left)) return true
    if (ts.isPrefixUnaryExpression(current) &&
      (current.operator === ts.SyntaxKind.PlusPlusToken || current.operator === ts.SyntaxKind.MinusMinusToken) &&
      isWithin(identifier, current.operand)) return true
    if (ts.isPostfixUnaryExpression(current) &&
      (current.operator === ts.SyntaxKind.PlusPlusToken || current.operator === ts.SyntaxKind.MinusMinusToken) &&
      isWithin(identifier, current.operand)) return true
    if (ts.isDeleteExpression(current) && isWithin(identifier, current.expression)) return true
    if ((ts.isForInStatement(current) || ts.isForOfStatement(current)) && isWithin(identifier, current.initializer) &&
      !ts.isVariableDeclarationList(current.initializer)) return true
  }
  return false
}

function guard(seen, key, resolve) {
  if (seen.has(key)) return null
  seen.add(key)
  try {
    return resolve()
  } finally {
    seen.delete(key)
  }
}

function collectIndex(sourceFiles) {
  const functions = new Map()
  const calls = new Map()
  const identifiers = new Map()

  function add(map, name, node) {
    const entries = map.get(name) ?? []
    entries.push(node)
    map.set(name, entries)
  }

  function visit(node) {
    if (ts.isFunctionLike(node)) {
      const name = functionName(node)
      if (name) add(functions, name, node)
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      add(calls, node.expression.text, node)
    }
    if (ts.isIdentifier(node)) add(identifiers, node.text, node)
    ts.forEachChild(node, visit)
  }

  for (const sourceFile of sourceFiles) visit(sourceFile)
  return { functions, calls, identifiers }
}

function isAllowedFunctionNameReference(identifier, fn) {
  const parent = identifier.parent
  if (identifier === fn.name) return true
  if (ts.isVariableDeclaration(parent) && parent.initializer === fn && parent.name === identifier) return true
  if (ts.isCallExpression(parent) && parent.expression === identifier) return true
  if (ts.isImportSpecifier(parent) && (parent.name === identifier || parent.propertyName === identifier)) {
    if (parent.propertyName && parent.propertyName.text !== parent.name.text) return false
    const declaration = parent.parent.parent.parent
    if (!ts.isImportDeclaration(declaration) || !ts.isStringLiteral(declaration.moduleSpecifier)) return false
    const modulePath = declaration.moduleSpecifier.text
    if (!modulePath.startsWith('.')) return false
    const importer = declaration.getSourceFile().fileName
    const importedPath = resolvePath(dirname(importer), modulePath)
    const targetPath = resolvePath(fn.getSourceFile().fileName)
    const candidates = new Set([
      importedPath,
      `${importedPath}.ts`,
      `${importedPath}.mts`,
      `${importedPath}.tsx`,
      resolvePath(importedPath, 'index.ts'),
      resolvePath(importedPath, 'index.mts'),
    ].map((path) => path.toLowerCase()))
    return candidates.has(targetPath.toLowerCase())
  }
  return false
}

export function createRpcExpressionResolver(sourceFiles) {
  const index = collectIndex(sourceFiles)

  function parameterSources(binding, seen) {
    const parameter = binding.node
    if (parameter.type?.kind !== ts.SyntaxKind.StringKeyword || !binding.fn.body) return null

    let reassigned = false
    function visitBody(node) {
      if (reassigned) return
      if (ts.isIdentifier(node) && node.text === parameter.name.text &&
        findBinding(node)?.node === parameter && isWriteReference(node)) {
        reassigned = true
        return
      }
      ts.forEachChild(node, visitBody)
    }
    visitBody(binding.fn.body)
    if (reassigned) return null

    const name = functionName(binding.fn)
    const definitions = name ? index.functions.get(name) ?? [] : []
    if (!name || definitions.length !== 1 || definitions[0] !== binding.fn) return null
    const calls = index.calls.get(name) ?? []
    const identifiers = index.identifiers.get(name) ?? []
    if (!calls.length || identifiers.some((identifier) => !isAllowedFunctionNameReference(identifier, binding.fn))) {
      return null
    }

    const sources = []
    for (const call of calls) {
      const argument = call.arguments[binding.index]
      if (!argument) return null
      const resolved = resolveRpcNames(argument, seen)
      if (!resolved) return null
      sources.push(...resolved)
    }
    return [...new Set(sources)]
  }

  function resolveRpcNames(expression, seen = new Set()) {
    const node = unwrap(expression)
    if (!node) return null
    if (ts.isStringLiteralLike(node)) return RPC_NAME.test(node.text) ? [node.text] : null
    if (ts.isConditionalExpression(node)) {
      const whenTrue = resolveRpcNames(node.whenTrue, seen)
      const whenFalse = resolveRpcNames(node.whenFalse, seen)
      return whenTrue && whenFalse ? [...new Set([...whenTrue, ...whenFalse])] : null
    }
    if (!ts.isIdentifier(node)) return null

    const binding = findBinding(node)
    if (!binding || binding.kind === 'dynamic') return null
    if (binding.kind === 'initializer') {
      return guard(seen, binding.node, () => resolveRpcNames(binding.initializer, seen))
    }
    return guard(seen, binding.node, () => parameterSources(binding, seen))
  }

  return resolveRpcNames
}
