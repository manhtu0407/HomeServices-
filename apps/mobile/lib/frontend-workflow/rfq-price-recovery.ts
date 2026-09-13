import AsyncStorage from '@react-native-async-storage/async-storage'
import { z } from 'zod'
import { rfqPriceProposalInputSchema, rfqPriceProposalSchema } from '@nestscout/shared'
import type { RfqCommand, RfqIdentity } from '../services/rfq-price'

const identitySchema = z.object({ ownerId: z.string().uuid(), jobId: z.string().uuid(), role: z.enum(['customer', 'worker']) })
const commandSchema = z.discriminatedUnion('kind', [
  identitySchema.extend({ kind: z.literal('propose'), input: rfqPriceProposalInputSchema }).strict(),
  identitySchema.extend({ kind: z.literal('decide'), proposal: rfqPriceProposalSchema, approve: z.boolean() }).strict(),
])
const writes = new Map<string, Promise<unknown>>()
const sameCommand = (left: RfqCommand, right: RfqCommand) =>
  JSON.stringify(commandSchema.parse(left)) === JSON.stringify(commandSchema.parse(right))
const key = (identity: RfqIdentity) => `nestscout.rfq-price.v1.${identity.ownerId}.${identity.role}.${identity.jobId}`

export async function readRfqCommand(identity: RfqIdentity): Promise<RfqCommand | null> {
  identitySchema.parse(identity)
  await writes.get(key(identity))?.catch(() => undefined)
  return read(identity)
}
async function read(identity: RfqIdentity): Promise<RfqCommand | null> {
  const raw = await AsyncStorage.getItem(key(identity))
  if (raw === null || raw === 'null') return null
  const command = commandSchema.parse(JSON.parse(raw))
  if (command.ownerId !== identity.ownerId || command.jobId !== identity.jobId || command.role !== identity.role ||
    (command.kind === 'propose' ? command.role !== 'worker' : command.role !== 'customer' ||
      command.proposal.job_id !== identity.jobId || command.proposal.customer_id !== identity.ownerId)) {
    throw new Error('RFQ_PRICE_STORAGE_UNAVAILABLE')
  }
  return command
}
export async function writeRfqCommand(identity: RfqIdentity, command: RfqCommand | null, current: () => boolean, expected?: RfqCommand) {
  const storageKey = key(identity)
  const work = (writes.get(storageKey) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    identitySchema.parse(identity)
    const prior = await read(identity)
    if (!current()) return false
    // A late response from another mounted surface must not clear a newer intent.
    if (command === null && (!expected || (prior && !sameCommand(prior, expected)))) return false
    if (command) {
      commandSchema.parse(command)
      if (command.ownerId !== identity.ownerId || command.jobId !== identity.jobId || command.role !== identity.role) {
        throw new Error('RFQ_PRICE_STORAGE_UNAVAILABLE')
      }
      if (prior && !sameCommand(prior, command)) throw new Error('RFQ_PRICE_OUTCOME_UNKNOWN')
    }
    await AsyncStorage.setItem(storageKey, JSON.stringify(command))
    return true
  })
  writes.set(storageKey, work)
  try { return await work } finally { if (writes.get(storageKey) === work) writes.delete(storageKey) }
}
