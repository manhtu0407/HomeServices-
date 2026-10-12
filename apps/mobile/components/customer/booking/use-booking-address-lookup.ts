import { useEffect, useRef, useState } from 'react'

import type { PlacesAutocompleteResponse } from '@/lib/api-types'
import { generateClientRequestId } from '@/lib/client-request-id'
import { placesService } from '@/lib/services'

export type BookingAddressSuggestion = PlacesAutocompleteResponse['suggestions'][number]

type BookingAddressLookupSnapshot = {
  fallbackUsed: boolean
  owner: BookingAddressLookupOwner | null
  pending: boolean
  suggestions: BookingAddressSuggestion[]
}

type BookingAddressLookupOwner = {
  query: string
}

type CachedLookup = {
  at: number
  suggestions: BookingAddressSuggestion[]
}

const bookingAddressLookupDelayMs = 140
const bookingAddressCacheTtlMs = 300_000
const bookingAddressCacheMaxEntries = 60
const bookingAddressCache = new Map<string, CachedLookup>()

function foldAddressText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
}

function lookupCacheKey(query: string) {
  return foldAddressText(query).replace(/\s+/g, ' ').trim()
}

function readLookupCache(query: string): BookingAddressSuggestion[] | null {
  const key = lookupCacheKey(query)
  const hit = bookingAddressCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > bookingAddressCacheTtlMs) {
    bookingAddressCache.delete(key)
    return null
  }
  return hit.suggestions
}

function writeLookupCache(query: string, suggestions: BookingAddressSuggestion[]) {
  if (suggestions.length === 0) return
  const key = lookupCacheKey(query)
  bookingAddressCache.delete(key)
  bookingAddressCache.set(key, { at: Date.now(), suggestions })
  while (bookingAddressCache.size > bookingAddressCacheMaxEntries) {
    const oldest = bookingAddressCache.keys().next().value
    if (oldest === undefined) break
    bookingAddressCache.delete(oldest)
  }
}

/** Suggestions already fetched for exactly this text, used when the list was dismissed before submit. */
export function peekBookingAddressSuggestions(address: string): BookingAddressSuggestion[] {
  return readLookupCache(address.trim()) ?? []
}

/** Test seam: the cache is module-level so it survives screens, and tests need a cold start. */
export function resetBookingAddressLookupCache() {
  bookingAddressCache.clear()
}

/**
 * While the next answer is in flight, keep the earlier suggestions that still match every word the
 * resident has typed so far. Typing "S1.07 Vinh" then "S1.07 Vinhomes" never blanks the list.
 */
function carryOverSuggestions(
  previous: { query: string; suggestions: BookingAddressSuggestion[] } | null,
  query: string,
): BookingAddressSuggestion[] {
  if (!previous || previous.suggestions.length === 0) return []
  const foldedQuery = foldAddressText(query)
  if (!foldedQuery.startsWith(foldAddressText(previous.query))) return []
  const tokens = foldedQuery.split(/[^a-z0-9.]+/).filter((token) => token.length >= 2)
  if (tokens.length === 0) return []
  return previous.suggestions.filter((suggestion) => {
    const haystack = foldAddressText(`${suggestion.main_text} ${suggestion.secondary_text ?? ''} ${suggestion.label}`)
    return tokens.every((token) => haystack.includes(token))
  })
}

function emptyLookupSnapshot(
  owner: BookingAddressLookupOwner | null,
  pending: boolean,
  suggestions: BookingAddressSuggestion[] = [],
): BookingAddressLookupSnapshot {
  return {
    fallbackUsed: false,
    owner,
    pending,
    suggestions,
  }
}

export function useBookingAddressLookup(address: string, open: boolean) {
  const normalizedQuery = address.trim()
  const query = open && normalizedQuery.length >= 2 ? normalizedQuery : null
  const lastResultRef = useRef<{ query: string; suggestions: BookingAddressSuggestion[] } | null>(null)
  const sessionTokenRef = useRef<string | null>(null)
  const [snapshot, setSnapshot] = useState<BookingAddressLookupSnapshot>(() =>
    emptyLookupSnapshot(query ? { query } : null, Boolean(query)),
  )
  let visibleSnapshot = snapshot
  if ((snapshot.owner?.query ?? null) !== query) {
    const cached = query ? readLookupCache(query) : null
    visibleSnapshot = cached && query
      ? emptyLookupSnapshot({ query }, false, cached)
      : emptyLookupSnapshot(
        query ? { query } : null,
        Boolean(query),
        query ? carryOverSuggestions(lastResultRef.current, query) : [],
      )
    setSnapshot(visibleSnapshot)
  }
  const owner = visibleSnapshot.owner
  const alreadyAnswered = owner !== null && !visibleSnapshot.pending

  useEffect(() => {
    if (!query) sessionTokenRef.current = null
  }, [query])

  useEffect(() => {
    if (!owner || !query || alreadyAnswered) return undefined

    let cancelled = false
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    sessionTokenRef.current ??= generateClientRequestId()
    const sessionToken = sessionTokenRef.current
    const timerId = setTimeout(() => {
      void placesService.autocomplete(
        { input: query, session_token: sessionToken },
        controller ? { signal: controller.signal } : undefined,
      ).then((result) => {
        if (cancelled) return
        if (result.success && !result.data.fallback_used) {
          writeLookupCache(query, result.data.suggestions)
          lastResultRef.current = { query, suggestions: result.data.suggestions }
        }
        setSnapshot(result.success
          ? {
              fallbackUsed: result.data.fallback_used,
              owner,
              pending: false,
              suggestions: result.data.suggestions,
            }
          : {
              fallbackUsed: true,
              owner,
              pending: false,
              suggestions: [],
            })
      }).catch(() => {
        if (cancelled) return
        setSnapshot({
          fallbackUsed: true,
          owner,
          pending: false,
          suggestions: [],
        })
      })
    }, bookingAddressLookupDelayMs)

    return () => {
      cancelled = true
      controller?.abort()
      clearTimeout(timerId)
    }
  }, [alreadyAnswered, owner, query])

  return {
    fallbackUsed: visibleSnapshot.fallbackUsed,
    pending: visibleSnapshot.pending,
    suggestions: visibleSnapshot.suggestions,
  }
}
