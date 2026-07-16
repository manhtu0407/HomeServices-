import { LOCAL_DEAL_ID, type LocalDeal } from '@nestscout/shared'

export const customerKaelChatRoute = '/(customer)/kael-chat?mode=normal'
export const customerKaelWorkRoute = '/(customer)/kael-chat?mode=case'

export function isRealCaseDeal(deal: LocalDeal | null | undefined): deal is LocalDeal {
  return Boolean(deal?.id && deal.id !== LOCAL_DEAL_ID)
}

export function cleanRouteJobId(jobId: string | null | undefined) {
  return jobId && jobId !== LOCAL_DEAL_ID ? jobId : null
}

export function customerCaseWorkRouteForDeal(
  deal: LocalDeal | null | undefined,
  suffix = '',
) {
  return isRealCaseDeal(deal)
    ? `/(customer)/kael-chat?mode=case&jobId=${encodeURIComponent(deal.id)}${suffix}`
    : `${customerKaelWorkRoute}${suffix}`
}
