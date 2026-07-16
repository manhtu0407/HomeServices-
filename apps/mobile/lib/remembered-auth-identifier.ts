import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { parseAuthIdentifier } from './auth-identifier'
import { withSecureStoreDeadline } from './secure-store-deadline'

const REMEMBERED_AUTH_IDENTIFIER_KEY = 'nestscout.auth.remembered_identifier.v1'

let webRememberedIdentifier: string | null = null
let rememberedIdentifierMutation: Promise<void> = Promise.resolve()

function canUseSecureStore() {
  return Platform.OS !== 'web'
    && typeof SecureStore.getItemAsync === 'function'
    && typeof SecureStore.setItemAsync === 'function'
    && typeof SecureStore.deleteItemAsync === 'function'
}

function toRememberedValue(value: string) {
  const identifier = parseAuthIdentifier(value)
  if (!identifier) return null
  return identifier.kind === 'phone' ? `0${identifier.value.slice(3)}` : identifier.value
}

export async function getRememberedAuthIdentifier() {
  const secureStoreAvailable = canUseSecureStore()
  const pendingMutationSettled = !secureStoreAvailable || await withSecureStoreDeadline(
    rememberedIdentifierMutation,
  ).then(() => true, () => false)
  let stored: string | null
  if (!secureStoreAvailable || !pendingMutationSettled) {
    stored = webRememberedIdentifier
  } else {
    stored = await withSecureStoreDeadline(
      SecureStore.getItemAsync(REMEMBERED_AUTH_IDENTIFIER_KEY),
    ).catch(() => webRememberedIdentifier)
  }
  const remembered = stored ? toRememberedValue(stored) : null

  if (stored && !remembered) {
    await clearRememberedAuthIdentifier()
  }

  return remembered
}

export async function rememberAuthIdentifier(value: string) {
  const remembered = toRememberedValue(value)
  if (!remembered) return

  webRememberedIdentifier = remembered
  if (!canUseSecureStore()) return

  await queueRememberedIdentifierMutation(() =>
    SecureStore.setItemAsync(REMEMBERED_AUTH_IDENTIFIER_KEY, remembered)
  )
}

export async function clearRememberedAuthIdentifier() {
  webRememberedIdentifier = null
  if (!canUseSecureStore()) return

  await queueRememberedIdentifierMutation(() =>
    SecureStore.deleteItemAsync(REMEMBERED_AUTH_IDENTIFIER_KEY)
  )
}

async function queueRememberedIdentifierMutation(operation: () => Promise<void>) {
  const mutation = rememberedIdentifierMutation
    .catch(() => undefined)
    .then(operation)
  rememberedIdentifierMutation = mutation.catch(() => undefined)
  await withSecureStoreDeadline(mutation).catch(() => undefined)
}
