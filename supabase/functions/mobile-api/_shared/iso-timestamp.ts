export function normalizeIsoTimestamp(value: string): string | null {
  const isoTimestamp =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/;
  const match = isoTimestamp.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0;

  if (
    year === 0 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 ||
    second > 59 || offsetHour > 23 || offsetMinute > 59
  ) return null;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
