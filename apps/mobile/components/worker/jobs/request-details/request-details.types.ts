/** Stage 2 · Chi tiết yêu cầu — shapes the approved section cards render. */

/** The three pill treatments the approved package ships. Neutral reads as information, mint as a
 *  value the system has settled, amber as something still on the worker. */
export type RequestDetailsPillTone = 'amber' | 'mint' | 'neutral'

/** One mark per position on the screen: four section marks and thirteen row marks, none repeated,
 *  so a row is never told apart from its own section header by size alone. */
export type RequestDetailsIconName =
  | 'banknote'
  | 'briefcase'
  | 'bubble'
  | 'check'
  | 'clock'
  | 'clipboard'
  | 'coins'
  | 'envelope'
  | 'home'
  | 'lock'
  | 'map'
  | 'photo'
  | 'receipt'
  | 'shieldCheck'
  | 'tag'
  | 'user'
  | 'wallet'
  | 'wrench'

export type RequestDetailsRow = {
  icon: RequestDetailsIconName
  key: string
  meta: string
  status: string
  testID?: string
  title: string
  tone: RequestDetailsPillTone
}

/** The closing card: the same surface and header as a section, with nothing under it. */
export type RequestDetailsNote = {
  description: string
  icon: RequestDetailsIconName
  testID: string
  title: string
}

export type RequestDetailsGroup = {
  description: string
  icon: RequestDetailsIconName
  key: string
  rows: readonly RequestDetailsRow[]
  testID: string
  title: string
}
