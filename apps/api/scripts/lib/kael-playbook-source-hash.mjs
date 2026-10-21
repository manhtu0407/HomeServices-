import { createHash } from 'node:crypto'

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

// One path once, in a fixed order, so the recorded list and the hashed list are the same list and reordering the
// source of the list cannot change a report's hash.
export function normalizeSourceFiles(files) {
  return [...new Set(files)].sort()
}

// sha256_path_and_file_sha256_v1: every path with the hash of its text, in path order. A changed byte, a renamed
// file, a removed file and an added file each change the result.
export function computeSourceTreeHash(files, readText) {
  const parts = normalizeSourceFiles(files).map((path) => `${path}\n${sha256Hex(readText(path))}`)
  return sha256Hex(parts.join('\n'))
}
