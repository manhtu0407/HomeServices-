import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Alert, Platform, type AlertButton } from 'react-native'
import type { AppLanguage } from '@/lib/app-language'

export type HistorySupportPresenter = (title: string, message: string, buttons?: AlertButton[]) => void
export type HistorySupportDialogState = {
  title: string
  message: string
  actions: { label: string; cancel: boolean; onPress: () => void }[]
  dismiss: () => void
}

export function useServiceHistorySupportAlert(ownerId: string | null, language: AppLanguage) {
  const scope = useMemo(() => ({ ownerId, language }), [ownerId, language])
  const active = useRef<{ scope: typeof scope } | null>(null)
  const [state, setState] = useState<(HistorySupportDialogState & { scope: typeof scope }) | null>(null)
  useLayoutEffect(() => () => {
    if (active.current?.scope === scope) active.current = null
  }, [scope])

  const createPresentation = (): HistorySupportPresenter => {
    const group = { scope }
    active.current = group
    return (title, message, buttons) => {
      if (!ownerId || active.current !== group) return
      let consumed = false
      const dismiss = () => {
        if (consumed || active.current !== group) return
        consumed = true
        active.current = null
        setState(null)
      }
      const wrap = (button: AlertButton): AlertButton => ({
        ...button,
        onPress: () => {
          if (consumed || active.current !== group) return
          consumed = true
          setState(null)
          if (button.style === 'cancel') active.current = null
          button.onPress?.()
        },
      })
      if (Platform.OS !== 'web') {
        if (buttons) Alert.alert(title, message, buttons.map(wrap))
        else Alert.alert(title, message)
        return
      }
      const actions = buttons ?? [{ text: language === 'vi' ? 'Đóng' : 'Close', style: 'cancel' as const }]
      setState({ scope, title, message, dismiss, actions: actions.map(button => ({
        label: button.text ?? (language === 'vi' ? 'Đóng' : 'Close'),
        cancel: button.style === 'cancel',
        onPress: () => wrap(button).onPress?.(),
      })) })
    }
  }
  return { createPresentation, dialog: state?.scope === scope ? state : null }
}
