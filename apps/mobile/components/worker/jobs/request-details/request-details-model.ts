import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../../ui/format'
import type { WorkerV5AcceptCheck } from '../acceptance'
import type { WorkerV5OfferDetailRow } from '../offer'
import type { RequestDetailsGroup, RequestDetailsIconName, RequestDetailsPillTone, RequestDetailsRow } from './request-details.types'

/** One glyph per row position, none of them a section mark and none of them repeated across the
 *  four cards. The approved fixture only fills the first entry of each list; the rest carry the
 *  rows a live offer adds. */
const REQUEST_ROW_ICONS: readonly RequestDetailsIconName[] = ['bubble', 'wrench', 'photo']
const ADDRESS_ROW_ICONS: readonly RequestDetailsIconName[] = ['home', 'user']
const PRICE_ROW_ICONS: readonly RequestDetailsIconName[] = ['tag', 'banknote', 'wallet', 'check']
const READY_ROW_ICONS: readonly RequestDetailsIconName[] = ['envelope', 'shieldCheck', 'lock', 'receipt']

function mapRows(
  rows: readonly WorkerV5OfferDetailRow[],
  icons: readonly RequestDetailsIconName[],
  keyPrefix: string,
  tone: RequestDetailsPillTone,
): RequestDetailsRow[] {
  return rows.map((row, index) => ({
    icon: icons[index] ?? icons[icons.length - 1],
    key: `${keyPrefix}-${index}`,
    meta: row.meta,
    status: row.status,
    title: row.title,
    tone,
  }))
}

/**
 * Group the offer's rows into the four approved section cards.
 *
 * Pill tone follows the group, not the status text: the request and address groups report state the
 * worker only reads, the price group is the value the system has settled, and only the readiness
 * checks carry something still on the worker — which is the one group whose rows already know their
 * own state.
 */
export function buildWorkerRequestDetailsGroups({
  addressRows,
  checks,
  language,
  priceRows,
  requestRows,
}: {
  addressRows: readonly WorkerV5OfferDetailRow[]
  checks: readonly WorkerV5AcceptCheck[]
  language: AppLanguage
  priceRows: readonly WorkerV5OfferDetailRow[]
  requestRows: readonly WorkerV5OfferDetailRow[]
}): RequestDetailsGroup[] {
  return [
    {
      description: textByLanguage(language, 'Thông tin yêu cầu và hiện trạng của công việc.', 'Request and condition details for the job.'),
      icon: 'clipboard',
      key: 'request',
      rows: mapRows(requestRows, REQUEST_ROW_ICONS, 'request', 'neutral'),
      testID: 'worker-v5-offer-request-list',
      title: textByLanguage(language, 'Yêu cầu', 'Request'),
    },
    {
      description: textByLanguage(language, 'Thông tin địa chỉ và khách hàng của công việc.', 'Address and customer details for the job.'),
      icon: 'map',
      key: 'address',
      rows: mapRows(addressRows, ADDRESS_ROW_ICONS, 'address', 'neutral'),
      testID: 'worker-v5-offer-address-list',
      title: textByLanguage(language, 'Địa chỉ & khách hàng', 'Address & customer'),
    },
    {
      description: textByLanguage(language, 'Thông tin giá và tiền công của công việc.', 'Price and earnings details for the job.'),
      icon: 'coins',
      key: 'price',
      rows: mapRows(priceRows, PRICE_ROW_ICONS, 'price', 'mint'),
      testID: 'worker-v5-offer-price-list',
      title: textByLanguage(language, 'Giá dịch vụ & tiền công', 'Service price & earnings'),
    },
    {
      description: textByLanguage(language, 'Các thông tin cần thiết để bắt đầu công việc.', 'What you need before starting the job.'),
      icon: 'briefcase',
      key: 'ready',
      rows: checks.map((check, index) => ({
        icon: READY_ROW_ICONS[index] ?? 'receipt',
        key: `ready-${index}`,
        meta: check.meta,
        status: check.state === 'done'
          ? textByLanguage(language, 'Đạt', 'Ready')
          : textByLanguage(language, 'Cần xử lý', 'Needs action'),
        testID: `worker-v5-accept-check-${index}`,
        title: check.label,
        tone: check.state === 'done' ? 'mint' : 'amber',
      })),
      testID: 'worker-v5-accept-checklist-card',
      title: textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready to accept'),
    },
  ]
}
