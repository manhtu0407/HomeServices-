import ts from 'typescript'

export function commentLines(path, content) {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, kind)
  const lines = new Set()
  const markRanges = (ranges) => {
    for (const range of ranges ?? []) {
      const first = source.getLineAndCharacterOfPosition(range.pos).line + 1
      const last = source.getLineAndCharacterOfPosition(range.end).line + 1
      for (let line = first; line <= last; line += 1) lines.add(line)
    }
  }
  const visit = (node) => {
    for (const child of node.getChildren(source)) {
      if (child.kind === ts.SyntaxKind.JsxText) continue
      markRanges(ts.getLeadingCommentRanges(content, child.pos))
      markRanges(ts.getTrailingCommentRanges(content, child.pos))
      visit(child)
    }
  }
  visit(source)
  return lines
}
