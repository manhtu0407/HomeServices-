import { useEffect, useState } from 'react'

import type { PlacesAutocompleteResponse } from '@/lib/api-types'
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

const bookingAddressLookupDelayMs = 260

function emptyLookupSnapshot(
  owner: BookingAddressLookupOwner | null,
  pending: boolean,
): BookingAddressLookupSnapshot {
  return {
    fallbackUsed: false,
    owner,
    pending,
    suggestions: [],
  }
}

export function useBookingAddressLookup(address: string, open: boolean) {
  const normalizedQuery = address.trim()
  const query = open && normalizedQuery.length >= 2 ? normalizedQuery : null
  const [snapshot, setSnapshot] = useState<BookingAddressLookupSnapshot>(() =>
    emptyLookupSnapshot(query ? { query } : null, Boolean(query)),
  )
  let visibleSnapshot = snapshot
  if ((snapshot.owner?.query ?? null) !== query) {
    visibleSnapshot = emptyLookupSnapshot(query ? { query } : null, Boolean(query))
    setSnapshot(visibleSnapshot)
  }
  const owner = visibleSnapshot.owner

  useEffect(() => {
    if (!owner || !query) return undefined

    let cancelled = false
    const timerId = setTimeout(() => {
      void placesService.autocomplete({ input: query }).then((result) => {
        if (cancelled) return
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
      clearTimeout(timerId)
    }
  }, [owner, query])

  return {
    fallbackUsed: visibleSnapshot.fallbackUsed,
    pending: visibleSnapshot.pending,
    suggestions: visibleSnapshot.suggestions,
  }
}
