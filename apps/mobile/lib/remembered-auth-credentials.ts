import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { parseAuthIdentifier } from './auth-identifier'
import { isBoundedLoginPassword } from './auth-password'
import { withSecureStoreDeadline } from './secure-store-deadline'

const REMEMBERED_AUTH_CREDENTIALS_KEY = 'nestscout.auth.remembered_credentials.v1'

export type RememberedAuthCredentials = {
  identifier: string
  password: string
  role: 'customer' | 'worker'
}

let credentialsMutation: Promise<void> = Promise.resolve()

function canUseSecureStore() {
  return Platform.OS !== 'web'
    && typeof SecureStore.getItemAsync === 'function'
    && typeof SecureStore.setItemAsync === 'function'
    && typeof SecureStore.deleteItemAsync === 'function'
}

function normalizeCredentials(identifierInput: string, password: string, role: RememberedAuthCredentials['role']) {
  const identifier = parseAuthIdentifier(identifierInput)
  if (!identifier || !isBoundedLoginPassword(password)) return null

  return {
    identifier: identifier.kind === 'phone' ? `0${identifier.value.slice(3)}` : identifier.value,
    password,
    role,
  } satisfies RememberedAuthCredentials
}

function parseStoredCredentials(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<RememberedAuthCredentials>
    if (
      typeof parsed.identifier !== 'string'
      || typeof parsed.password !== 'string'
      || (parsed.role !== 'customer' && parsed.role !== 'worker')
    ) return null

    return normalizeCredentials(parsed.identifier, parsed.password, parsed.role)
  } catch {
    return null
  }
}

export async function getRememberedAuthCredentials(): Promise<RememberedAuthCredentials | null> {
  if (!canUseSecureStore()) return null

  const pendingMutationSettled = await withSecureStoreDeadline(credentialsMutation)
    .then(() => true, () => false)
  if (!pendingMutationSettled) return null

  const stored = await withSecureStoreDeadline(
    SecureStore.getItemAsync(REMEMBERED_AUTH_CREDENTIALS_KEY),
  ).catch(() => null)
  if (!stored) return null

  const remembered = parseStoredCredentials(stored)
  if (remembered) return remembered

  await clearRememberedAuthCredentials()
  return null
}

export async function rememberAuthCredentials(
  identifier: string,
  password: string,
  role: RememberedAuthCredentials['role'],
) {
  const remembered = normalizeCredentials(identifier, password, role)
  if (!remembered || !canUseSecureStore()) return

  await queueCredentialsMutation(() => SecureStore.setItemAsync(
    REMEMBERED_AUTH_CREDENTIALS_KEY,
    JSON.stringify(remembered),
  ))
}

export async function clearRememberedAuthCredentials() {
  if (!canUseSecureStore()) return
  await queueCredentialsMutation(() => SecureStore.deleteItemAsync(REMEMBERED_AUTH_CREDENTIALS_KEY))
}

async function queueCredentialsMutation(operation: () => Promise<void>) {
  const mutation = credentialsMutation
    .catch(() => undefined)
    .then(operation)
  credentialsMutation = mutation.catch(() => undefined)
  await withSecureStoreDeadline(mutation).catch(() => undefined)
}
