import type { ServiceType } from '@nestscout/shared'

import { appCopy, localizedProblemLabel, type AppLanguage } from './app-language'

const taxonomyLabels: Record<AppLanguage, Record<string, string>> = {
  vi: {
    electrical_flickering_light: '\u0110\u00e8n ch\u1eadp ch\u1eddn',
    electrical_outlet_or_switch_broken: '\u1ed4 c\u1eafm/c\u00f4ng t\u1eafc h\u1ecfng',
    electrical_outlet_switch: '\u1ed4 \u0111i\u1ec7n',
    faucet_issue: 'V\u00f2i h\u1ecfng',
    flickering_light: '\u0110\u00e8n ch\u1eadp ch\u1eddn',
    outlet_or_switch_broken: '\u1ed4 c\u1eafm/c\u00f4ng t\u1eafc h\u1ecfng',
    outlet_switch: '\u1ed4 \u0111i\u1ec7n',
    pipe_leak: 'R\u00f2 n\u01b0\u1edbc',
    plumbing_faucet_issue: 'V\u00f2i h\u1ecfng',
    plumbing_pipe_leak: 'R\u00f2 n\u01b0\u1edbc',
    plumbing_weak_pressure: '\u00c1p y\u1ebfu',
    plumbing_clogged_drain: 'T\u1eafc c\u1ed1ng',
    weak_pressure: '\u00c1p y\u1ebfu',
    clogged_drain: 'T\u1eafc c\u1ed1ng',
  },
  en: {
    electrical_flickering_light: 'Flickering light',
    electrical_outlet_or_switch_broken: 'Outlet or switch issue',
    electrical_outlet_switch: 'Outlet or switch',
    faucet_issue: 'Faucet issue',
    flickering_light: 'Flickering light',
    outlet_or_switch_broken: 'Outlet or switch issue',
    outlet_switch: 'Outlet or switch',
    pipe_leak: 'Pipe leak',
    plumbing_faucet_issue: 'Faucet issue',
    plumbing_pipe_leak: 'Pipe leak',
    plumbing_weak_pressure: 'Weak water pressure',
    plumbing_clogged_drain: 'Clogged drain',
    weak_pressure: 'Weak water pressure',
    clogged_drain: 'Clogged drain',
  },
}

export function localizedAgenticProblemLabel(value: string, serviceType: ServiceType, language: AppLanguage) {
  const normalized = normalizeKaelRoutingText(value).replace(/[^a-z0-9]+/g, '_')
  const taxonomyLabel = taxonomyLabels[language][normalized]
  if (taxonomyLabel) return taxonomyLabel
  if (looksLikeRawProblemTaxonomy(value)) return null

  const localized = localizedProblemLabel(value, serviceType, language)
  return localized === appCopy[language].common.unknown ? null : localized.trim()
}

function looksLikeRawProblemTaxonomy(value: string) {
  const trimmed = value.trim()
  return /^[a-z]+:[\s_a-z0-9-]+$/i.test(trimmed) || /^[a-z]+(?:_[a-z0-9]+)+$/i.test(trimmed)
}

function normalizeKaelRoutingText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
