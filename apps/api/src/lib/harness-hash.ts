import { createHash } from 'node:crypto'

export function harnessSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
