import type { AdminViewActor } from '@/lib/api-types/admin'
import type { AppLanguage } from '@/lib/app-language'

import type { AdminProductionCapabilityId } from './admin-sections-production-copy'
import { AdminSystemLearningWorkspace } from './admin-system-learning-workspace'
import { AdminSystemModelHealthWorkspace } from './admin-system-model-health-workspace'
import { AdminSystemPriceWorkspace } from './admin-system-price-workspace'
import { AdminSystemTaxonomyWorkspace } from './admin-system-taxonomy-workspace'

export function AdminSystemWorkspace({ actor, capability, language }: {
  actor: AdminViewActor
  capability: AdminProductionCapabilityId
  language: AppLanguage
}) {
  if (capability === 'system-price-baseline') return <AdminSystemPriceWorkspace actor={actor} language={language} />
  if (capability === 'system-taxonomy') return <AdminSystemTaxonomyWorkspace actor={actor} language={language} />
  if (capability === 'system-learning-rules') return <AdminSystemLearningWorkspace actor={actor} language={language} />
  return <AdminSystemModelHealthWorkspace language={language} />
}
