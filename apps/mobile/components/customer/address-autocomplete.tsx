import { useEffect, useReducer, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { extractKnownDistrictLabel } from '@home-services/shared'
import { getCustomerThemeTokens, useCustomerThemeMode } from '@/components/customer/customer-surfaces'
import { type AppLanguage } from '@/lib/app-language'
import { placesService } from '@/lib/services'
import type { PlacesAutocompleteResponse } from '@/lib/api-types'

type AddressSuggestion = PlacesAutocompleteResponse['suggestions'][number]
type AddressLookupState = {
  fallbackUsed: boolean
  suggestions: AddressSuggestion[]
}

type AddressLookupAction =
  | { type: 'failed' }
  | { type: 'reset' }
  | { fallbackUsed: boolean; suggestions: AddressSuggestion[]; type: 'resolved' }

const EMPTY_ADDRESS_SUGGESTIONS: AddressSuggestion[] = []
const EMPTY_ADDRESS_LOOKUP_STATE: AddressLookupState = {
  fallbackUsed: false,
  suggestions: EMPTY_ADDRESS_SUGGESTIONS,
}

function addressLookupReducer(_state: AddressLookupState, action: AddressLookupAction): AddressLookupState {
  switch (action.type) {
    case 'failed':
      return { fallbackUsed: true, suggestions: EMPTY_ADDRESS_SUGGESTIONS }
    case 'resolved':
      return { fallbackUsed: action.fallbackUsed, suggestions: action.suggestions }
    case 'reset':
      return EMPTY_ADDRESS_LOOKUP_STATE
  }
}

type AddressAutocompleteProps = {
  language: AppLanguage
  onChange: (value: string, districtLabel: string | null) => void
  value: string
}

const copy = {
  vi: {
    label: 'Khu vực căn hộ',
    placeholder: 'Nhập tên tòa nhà, đường hoặc quận TP.HCM',
    fallback: 'Kael vẫn có thể dùng quận TP.HCM nếu chưa có gợi ý.',
  },
  en: {
    label: 'Apartment area',
    placeholder: 'Enter building, street, or HCMC district',
    fallback: 'Kael can still use the HCMC district if suggestions are unavailable.',
  },
} as const

export function AddressAutocomplete({ language, onChange, value }: AddressAutocompleteProps) {
  const mode = useCustomerThemeMode()
  const tokens = getCustomerThemeTokens(mode)
  const text = copy[language]
  const [{ fallbackUsed, suggestions }, dispatchLookup] = useReducer(addressLookupReducer, EMPTY_ADDRESS_LOOKUP_STATE)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const trimmed = value.trim()
    if (trimmed.length < 2) {
      dispatchLookup({ type: 'reset' })
      return
    }

    let cancelled = false
    const timer = setTimeout(() => {
      void placesService.autocomplete({ input: trimmed }).then((result) => {
        if (cancelled) return
        if (!result.success) {
          dispatchLookup({ type: 'failed' })
          return
        }
        dispatchLookup({ fallbackUsed: result.data.fallback_used, suggestions: result.data.suggestions, type: 'resolved' })
      })
    }, 260)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value])

  const updateValue = (nextValue: string) => {
    setOpen(true)
    onChange(nextValue, extractKnownDistrictLabel(nextValue) || null)
  }

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    setOpen(false)
    dispatchLookup({ type: 'reset' })
    onChange(suggestion.label, extractKnownDistrictLabel(suggestion.label) || null)
  }

  return (
    <View style={addressStyles.shell} testID="customer-address-autocomplete">
      <Text style={[addressStyles.label, { color: tokens.muted }]}>{text.label}</Text>
      <TextInput
        autoCapitalize="words"
        onChangeText={updateValue}
        onFocus={() => setOpen(true)}
        placeholder={text.placeholder}
        placeholderTextColor={tokens.subtleText}
        style={[addressStyles.input, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }]}
        testID="customer-address-autocomplete-input"
        value={value}
      />
      {open && suggestions.length > 0 ? (
        <View style={[addressStyles.suggestions, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID="customer-address-autocomplete-suggestions">
          {suggestions.map((suggestion) => (
            <Pressable
              accessibilityRole="button"
              key={suggestion.place_id}
              onPress={() => selectSuggestion(suggestion)}
              style={({ pressed }) => [addressStyles.suggestionButton, pressed ? addressStyles.pressed : null]}
              testID="customer-address-autocomplete-suggestion"
            >
              <Text numberOfLines={1} style={[addressStyles.suggestionTitle, { color: tokens.text }]}>
                {suggestion.main_text}
              </Text>
              {suggestion.secondary_text ? (
                <Text numberOfLines={1} style={[addressStyles.suggestionSubtitle, { color: tokens.muted }]}>
                  {suggestion.secondary_text}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {fallbackUsed ? (
        <Text style={[addressStyles.fallback, { color: tokens.muted }]} testID="customer-address-autocomplete-fallback">
          {text.fallback}
        </Text>
      ) : null}
    </View>
  )
}

const addressStyles = StyleSheet.create({
  fallback: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 8,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.8,
  },
  shell: {
    gap: 8,
    marginTop: 14,
  },
  suggestionButton: {
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  suggestionSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  suggestions: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
})
