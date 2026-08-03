import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

const functionsRoot = fileURLToPath(
  new URL('../../../../../supabase/functions/', import.meta.url),
)

const listTypeScriptFiles = (directory: string): string[] => readdirSync(directory).flatMap((entry) => {
  const path = join(directory, entry)
  return statSync(path).isDirectory()
    ? listTypeScriptFiles(path)
    : path.endsWith('.ts') ? [path] : []
})

const functionName = (node: ts.FunctionLikeDeclarationBase): string => {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) return node.parent.name.text
  if (ts.isPropertyAssignment(node.parent) && ts.isIdentifier(node.parent.name)) return node.parent.name.text
  return '<anonymous>'
}

const isFunctionLike = (node: ts.Node): node is ts.FunctionLikeDeclarationBase => (
  ts.isFunctionDeclaration(node)
  || ts.isFunctionExpression(node)
  || ts.isArrowFunction(node)
  || ts.isMethodDeclaration(node)
)

describe('Edge backend function size', () => {
  it('keeps every implementation within the §46.0 150-line boundary', () => {
    const oversized: string[] = []

    for (const path of listTypeScriptFiles(functionsRoot)) {
      const source = readFileSync(path, 'utf8')
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      const visit = (node: ts.Node): void => {
        if (isFunctionLike(node)) {
          const start = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
          const end = file.getLineAndCharacterOfPosition(node.getEnd()).line + 1
          const lines = end - start + 1
          if (lines > 150) {
            oversized.push(`${relative(functionsRoot, path)}:${start}-${end} ${functionName(node)} (${lines})`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(file)
    }

    expect(oversized).toEqual([])
  })
})
