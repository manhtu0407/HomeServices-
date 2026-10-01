import AsyncStorage from '@react-native-async-storage/async-storage'

// An invite code is public, so plain storage is enough; it only has to survive the signup
// that follows opening the invite link.
const PENDING_INVITE_KEY = 'nestscout.pending-invite.v1'
const PENDING_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000
const INVITE_CODE_PATTERN = /^[A-Z0-9]{8}$/

export function normalizeInviteCode(value: string): string | null {
  const code = value.replace(/[\s-]/g, '').toUpperCase()
  return INVITE_CODE_PATTERN.test(code) ? code : null
}

export async function savePendingInvite(value: string): Promise<string | null> {
  const code = normalizeInviteCode(value)
  if (!code) return null
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ code, saved_at: Date.now() })).catch(() => undefined)
  return code
}

export async function loadPendingInvite(now = Date.now()): Promise<string | null> {
  const raw = await AsyncStorage.getItem(PENDING_INVITE_KEY).catch(() => null)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { code?: unknown; saved_at?: unknown }
    const code = typeof parsed.code === 'string' ? normalizeInviteCode(parsed.code) : null
    const savedAt = typeof parsed.saved_at === 'number' ? parsed.saved_at : 0
    if (code && now - savedAt < PENDING_INVITE_TTL_MS) return code
  } catch {
    // A corrupt entry is dropped below like an expired one.
  }
  await clearPendingInvite()
  return null
}

export async function clearPendingInvite(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_INVITE_KEY).catch(() => undefined)
}
