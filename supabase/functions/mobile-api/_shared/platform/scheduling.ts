export const HCMC_SCHEDULE_VALIDATION_MESSAGE = "Thời gian hẹn phải ở tương lai và khớp múi giờ TP.HCM";

export type HcmcScheduleWindow = {
  date: string;
  start: string;
  end: string;
  time_zone: "Asia/Ho_Chi_Minh";
};

export type HcmcScheduleValidationError =
  | "invalid"
  | "missing_timestamp"
  | "past"
  | "window_mismatch";

export function validateFutureHcmcSchedule(
  scheduledAt: string | null | undefined,
  scheduleWindow?: HcmcScheduleWindow,
  now: Date = new Date(),
): HcmcScheduleValidationError | null {
  if (!scheduledAt) return scheduleWindow ? "missing_timestamp" : null;
  const scheduledMs = Date.parse(scheduledAt);
  if (!Number.isFinite(scheduledMs)) return "invalid";
  if (scheduledMs <= now.getTime()) return "past";
  if (!scheduleWindow) return null;
  if (scheduleWindow.time_zone !== "Asia/Ho_Chi_Minh") return "window_mismatch";

  const expected = hcmcWallClockTimestamp(scheduleWindow.date, scheduleWindow.start);
  const windowEnd = hcmcWallClockTimestamp(scheduleWindow.date, scheduleWindow.end);
  if (
    expected === null ||
    windowEnd === null ||
    windowEnd <= expected ||
    expected !== scheduledMs
  ) return "window_mismatch";
  return null;
}

function hcmcWallClockTimestamp(date: string, time: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const calendarDay = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDay.getUTCFullYear() !== year ||
    calendarDay.getUTCMonth() !== month - 1 ||
    calendarDay.getUTCDate() !== day
  ) return null;
  return Date.UTC(year, month - 1, day, hour - 7, minute);
}
