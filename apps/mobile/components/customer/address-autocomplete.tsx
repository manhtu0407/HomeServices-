import { useEffect, useReducer, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { extractKnownDistrictLabel } from '@nestscout/shared'
import { getCustomerThemeTokens, useCustomerThemeMode } from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelTextField } from '@/components/ui/kael-primitives'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
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
const ADDRESS_AUTOCOMPLETE_APPLE_IOS26_COMPONENT_SYSTEM = 'ADDRESS_AUTOCOMPLETE_APPLE_IOS26_COMPONENT_SYSTEM: address input and suggestions use Apple-style grouped field material, edge highlight, press state, and reduce-transparency fallback'
void ADDRESS_AUTOCOMPLETE_APPLE_IOS26_COMPONENT_SYSTEM

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
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
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
      <View pointerEvents="none" style={addressStyles.hiddenMarker} testID="customer-address-apple-ios26-component-system" />
      <Text style={[addressStyles.label, { color: tokens.muted }]}>{text.label}</Text>
      <KaelTextField
        autoCapitalize="words"
        inputShellAdornment={<View pointerEvents="none" style={[addressStyles.edgeHighlight, addressEdgeHighlightSurface(tokens)]} />}
        inputShellStyle={[addressStyles.fieldShell, addressFieldSurface(tokens, reduceTransparency)]}
        inputShellTestID="customer-address-apple-ios26-field"
        onChangeText={updateValue}
        onFocus={() => setOpen(true)}
        placeholder={text.placeholder}
        placeholderTextColor={tokens.subtleText}
        shellStyle={addressStyles.fieldStack}
        style={[addressStyles.input, addressInputFocusSurface(tokens), { color: tokens.text }]}
        testID="customer-address-autocomplete-input"
        value={value}
      />
      {open && suggestions.length > 0 ? (
        <View style={[addressStyles.suggestions, addressSuggestionsSurface(tokens, reduceTransparency)]} testID="customer-address-autocomplete-suggestions">
          <View pointerEvents="none" style={addressStyles.hiddenMarker} testID="customer-address-apple-ios26-suggestion-surface" />
          {suggestions.map((suggestion) => (
            <Pressable
              accessibilityRole="button"
              key={suggestion.place_id}
              onPress={() => selectSuggestion(suggestion)}
              style={({ pressed }) => [
                addressStyles.suggestionButton,
                addressSuggestionSurface(tokens, reduceTransparency),
                pressed ? addressStyles.pressed : null,
                reduceMotionAwarePressStyle(pressed, reduceMotion),
              ]}
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
        <Text style={[addressStyles.fallback, addressFallbackSurface(tokens, reduceTransparency), { color: tokens.muted }]} testID="customer-address-autocomplete-fallback">
          {text.fallback}
        </Text>
      ) : null}
    </View>
  )
}

type AddressTokens = ReturnType<typeof getCustomerThemeTokens>

function addressFieldSurface(tokens: AddressTokens, reduceTransparency: boolean) {
  const dark = tokens.mode === 'dark'
  const lightGradient = 'radial-gradient(circle at 76% 18%, rgba(76,222,199,0.13), transparent 42%), radial-gradient(circle at 18% 0%, rgba(255,255,255,0.78), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(242,255,251,0.92))'
  const darkGradient = 'radial-gradient(circle at 76% 18%, rgba(105,222,198,0.085), transparent 42%), radial-gradient(circle at 18% 0%, rgba(190,210,205,0.085), transparent 32%), linear-gradient(180deg, rgba(24,31,29,0.96), rgba(15,20,19,0.92))'

  return {
    background: reduceTransparency ? undefined : dark ? darkGradient : lightGradient,
    backgroundColor: reduceTransparency ? tokens.base : dark ? 'rgba(24,31,29,0.96)' : '#F8FFFC',
    backgroundImage: reduceTransparency ? undefined : dark ? darkGradient : lightGradient,
    borderColor: dark ? 'rgba(190,210,205,0.12)' : 'rgba(15,133,118,0.12)',
    boxShadow: reduceTransparency ? 'none' : dark ? 'inset 0 1px 0 rgba(190,210,205,0.070)' : '0 9px 22px rgba(31,92,82,0.040), inset 0 1px 0 rgba(255,255,255,0.80)',
    experimental_backgroundImage: reduceTransparency ? undefined : dark ? darkGradient : lightGradient,
  } as any
}

function addressSuggestionsSurface(tokens: AddressTokens, reduceTransparency: boolean) {
  const dark = tokens.mode === 'dark'
  const lightGradient = 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,248,248,0.94))'
  const darkGradient = 'linear-gradient(180deg, rgba(23,29,27,0.97), rgba(16,21,20,0.93))'

  return {
    background: reduceTransparency ? undefined : dark ? darkGradient : lightGradient,
    backgroundColor: reduceTransparency ? tokens.raised : dark ? 'rgba(23,29,27,0.97)' : 'rgba(255,255,255,0.97)',
    backgroundImage: reduceTransparency ? undefined : dark ? darkGradient : lightGradient,
    borderColor: dark ? 'rgba(190,210,205,0.12)' : 'rgba(20,73,66,0.09)',
    boxShadow: reduceTransparency ? 'none' : dark ? '0 12px 26px rgba(0,0,0,0.22), inset 0 1px 0 rgba(190,210,205,0.070)' : '0 12px 26px rgba(31,92,82,0.050), inset 0 1px 0 rgba(255,255,255,0.78)',
    experimental_backgroundImage: reduceTransparency ? undefined : dark ? darkGradient : lightGradient,
  } as any
}

function addressSuggestionSurface(tokens: AddressTokens, reduceTransparency: boolean) {
  return {
    backgroundColor: reduceTransparency ? tokens.raised : 'transparent',
    borderBottomColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.070)' : 'rgba(20,73,66,0.060)',
  }
}

function addressFallbackSurface(tokens: AddressTokens, reduceTransparency: boolean) {
  const dark = tokens.mode === 'dark'
  return {
    backgroundColor: reduceTransparency ? tokens.base : dark ? 'rgba(24,31,29,0.72)' : 'rgba(255,255,255,0.72)',
    borderColor: dark ? 'rgba(190,210,205,0.10)' : 'rgba(20,73,66,0.08)',
  }
}

function addressEdgeHighlightSurface(tokens: AddressTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(255,255,255,0.78)',
  }
}

function addressInputFocusSurface(tokens: AddressTokens) {
  return {
    caretColor: tokens.primary,
    outlineColor: tokens.mode === 'dark' ? 'rgba(255,255,255,0.46)' : 'rgba(255,255,255,0.96)',
    outlineOffset: -1,
    outlineStyle: 'solid',
    outlineWidth: 1,
  } as any
}

const addressStyles = StyleSheet.create({
  edgeHighlight: {
    borderRadius: 999,
    height: 1,
    left: 14,
    opacity: 0.72,
    position: 'absolute',
    right: 14,
    top: 1,
  },
  fallback: {
    borderCurve: 'continuous',
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  fieldShell: {
    alignItems: 'stretch',
    borderCurve: 'continuous',
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 52,
    overflow: 'hidden',
    paddingHorizontal: 0,
    position: 'relative',
  },
  fieldStack: {
    gap: 0,
  },
  hiddenMarker: {
    height: 0,
    opacity: 0,
    position: 'absolute',
    width: 0,
  },
  input: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.8,
  },
  shell: {
    gap: 9,
    marginTop: 16,
  },
  suggestionButton: {
    borderBottomWidth: 1,
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
    borderCurve: 'continuous',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
})
