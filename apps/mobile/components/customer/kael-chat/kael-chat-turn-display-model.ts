import type { KaelChatTurn } from '@/lib/api-types'
import type { AppLanguage } from '@/lib/app-language'

import { normalizeKaelRoutingText } from './case-work-display-model'

export function totalMediaRefs(turns: KaelChatTurn[]) {
  return turns.reduce((total, turn) => total + (Array.isArray(turn.media_refs) ? turn.media_refs.length : 0), 0)
}

export function customerVisibleKaelTurnText(
  text: string | null | undefined,
  language: AppLanguage,
) {
  if (!text) return ''
  const labels = language === 'vi'
    ? {
        'bank-account': 'tài khoản ngân hàng đã ẩn',
        building: 'tòa nhà đã ẩn',
        email: 'email đã ẩn',
        floor: 'tầng đã ẩn',
        'house-no': 'số nhà đã ẩn',
        'id-number': 'giấy tờ định danh đã ẩn',
        phone: 'số điện thoại đã ẩn',
        unit: 'căn hộ đã ẩn',
      }
    : {
        'bank-account': 'hidden bank account',
        building: 'hidden building',
        email: 'hidden email',
        floor: 'hidden floor',
        'house-no': 'hidden house number',
        'id-number': 'hidden identity number',
        phone: 'hidden phone number',
        unit: 'hidden unit',
      }
  const legacyHandymanEvidencePrompt = language === 'vi'
    ? 'Bạn gửi một ảnh thấy rõ vật cần sửa/lắp và vị trí thi công để Kael kiểm tra bề mặt, kích thước và dụng cụ cần chuẩn bị.'
    : 'Send one clear photo of the item and the installation area so Kael can check the surface, size, and tools needed.'
  const compactHandymanEvidencePrompt = language === 'vi'
    ? 'Gửi ảnh rõ vật cần sửa/lắp và vị trí thi công để Kael kiểm tra bề mặt, kích thước, dụng cụ cần dùng.'
    : 'Send a clear photo of the item and work area so Kael can check the surface, size, and tools needed.'
  const repairedLegacyText = text
    .replace(legacyHandymanEvidencePrompt, compactHandymanEvidencePrompt)
    .replace(/\[unit\]ộ/giu, language === 'vi' ? 'căn hộ' : 'unit')
    .replace(/phòng\s+\[unit\]ách/giu, language === 'vi' ? 'phòng khách' : 'living room')
    .replace(/\[unit\]ách/giu, language === 'vi' ? 'phòng khách' : 'living room')
  return repairedLegacyText.replace(
    /\[(bank-account|building|email|floor|house-no|id-number|phone|unit)\]/g,
    (_token, key: keyof typeof labels) => labels[key],
  )
}

export function customerVisibleIntakeSummaryText(
  text: string | null | undefined,
  language: AppLanguage,
) {
  if (!text) return ''
  const visibleText = customerVisibleKaelTurnText(text, language)
  const labels = language === 'vi'
    ? ['Dịch vụ:', 'Vấn đề:', 'Khu vực:', 'Thời gian:', 'Mô tả:']
    : ['Service:', 'Issue:', 'Area:', 'Time:', 'Description:']
  const structuredRows = splitStructuredIntakeRows(visibleText, labels)
  if (!structuredRows) return visibleText

  const displayRows: string[] = []
  for (const row of repairLegacyIntakeSchedule(structuredRows.join('\n'), language).split(/\r?\n+/)) {
    const trimmed = row.trim()
    if (trimmed) displayRows.push(trimmed)
  }
  return displayRows.join('\n\n')
}

export function customerVisibleCaseRequestText(
  text: string | null | undefined,
  language: AppLanguage,
) {
  const visibleText = customerVisibleIntakeSummaryText(text, language)
  if (!visibleText || visibleText.includes('\n') || visibleText.length < 110) return visibleText

  const sentenceRows = splitSentenceRows(visibleText)
  return sentenceRows.length >= 3 ? sentenceRows.join('\n\n') : visibleText
}

function splitStructuredIntakeRows(text: string, labels: string[]) {
  const markers: { index: number; label: string }[] = []
  let searchFrom = 0

  for (const label of labels) {
    const index = text.indexOf(label, searchFrom)
    if (index < 0) continue
    markers.push({ index, label })
    searchFrom = index + label.length
  }

  if (markers.length < 3 || text.slice(0, markers[0]?.index ?? 0).trim()) return null

  return markers.map((marker, index) => {
    const nextIndex = markers[index + 1]?.index ?? text.length
    return text.slice(marker.index, nextIndex).trim()
  })
}

function splitSentenceRows(text: string) {
  const rows: string[] = []
  let rowStart = 0

  for (let index = 0; index < text.length; index += 1) {
    if (!'.!?'.includes(text[index] ?? '')) continue
    const nextCharacter = text[index + 1]
    if (nextCharacter && !/\s/u.test(nextCharacter)) continue

    const row = text.slice(rowStart, index + 1).trim()
    if (row) rows.push(row)
    while (index + 1 < text.length && /\s/u.test(text[index + 1] ?? '')) index += 1
    rowStart = index + 1
  }

  const trailingRow = text.slice(rowStart).trim()
  if (trailingRow) rows.push(trailingRow)
  return rows
}

function repairLegacyIntakeSchedule(text: string, language: AppLanguage) {
  const pattern = language === 'vi'
    ? /Bắt đầu lúc\s+([01]\d|2[0-3]):(?:\[house-no\]|số nhà đã ẩn)/giu
    : /Starts at\s+([01]\d|2[0-3]):(?:\[house-no\]|hidden house number)/giu

  return text.replace(pattern, (_match, hour: string) => language === 'vi'
    ? `Bắt đầu khoảng ${hour} giờ`
    : `Starts around ${hour}:00`)
}

export function isScriptedKaelAcknowledgementTurn(turn: KaelChatTurn) {
  if (turn.role === 'customer') return false
  const text = turn.text_content?.trim()
  if (!text) return false
  const normalized = normalizeKaelRoutingText(text)
  return normalized.includes('kael ghi nhan moi lo') &&
    (normalized.includes('admin can thiep') || normalized.includes('moi tuong tac duoc luu'))
}
