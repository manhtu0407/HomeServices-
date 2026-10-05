import AsyncStorage from '@react-native-async-storage/async-storage'

// An invite code is public, so plain storage is enough; it only has to survive the signup
// that follows opening the invite link.
const PENDING_INVITE_KEY = 'nestscout.pending-invite.v1'
const PENDING_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000
const INVITE_CLAIM_RESULT_KEY = 'nestscout.invite-claim-result.v1'
// Mirrors the alphabet of public.ensure_worker_referral_code: 0, 1, I and O are never issued,
// so a code containing them is a typo and must not spend one of the daily claim attempts.
const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/
const NEVER_ISSUED_CHARACTERS = /[01IO]/

function compactInviteCode(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase()
}

export function normalizeInviteCode(value: string): string | null {
  const code = compactInviteCode(value)
  return INVITE_CODE_PATTERN.test(code) ? code : null
}

export function inviteCodeHasNeverIssuedCharacter(value: string): boolean {
  return NEVER_ISSUED_CHARACTERS.test(compactInviteCode(value))
}

export async function saveInviteClaimResult(outcome: string): Promise<void> {
  await AsyncStorage.setItem(INVITE_CLAIM_RESULT_KEY, outcome).catch(() => undefined)
}

// Read once: the result of a claim made from an invite link is shown a single time.
export async function takeInviteClaimResult(): Promise<string | null> {
  const outcome = await AsyncStorage.getItem(INVITE_CLAIM_RESULT_KEY).catch(() => null)
  if (outcome !== null) await AsyncStorage.removeItem(INVITE_CLAIM_RESULT_KEY).catch(() => undefined)
  return outcome
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
