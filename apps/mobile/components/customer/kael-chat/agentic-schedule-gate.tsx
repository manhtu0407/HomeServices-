import { useMemo, useReducer } from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'

import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import {
  availableBookingTimeSlots,
  bookingCustomDateValue,
  bookingCustomTimeValue,
  bookingScheduleDraft,
  bookingScheduleLabel,
  buildBookingScheduleDateOptions,
  normalizeBookingCustomDateInput,
  normalizeBookingCustomTimeInput,
} from '../booking/booking-intake-display-model'
import { useCustomerV21SurfaceTheme } from '../ui/shared-surfaces'

type AgenticScheduleSubmission = {
  message: string
  scheduled_at: string
  schedule_window: {
    date: string
    end: string
    start: string
    time_zone: 'Asia/Ho_Chi_Minh'
  }
}

type ScheduleGateState = {
  customDate: string
  customTime: string
  selectedDate: string | null
  selectedTime: string | null
  submitting: boolean
}

type ScheduleGateAction =
  | { type: 'customDate'; value: string; selectedDate: string | null }
  | { type: 'customTime'; value: string; selectedTime: string | null }
  | { type: 'presetDate'; value: string }
  | { type: 'presetTime'; value: string }
  | { type: 'submitting'; value: boolean }

const initialScheduleGateState: ScheduleGateState = {
  customDate: '',
  customTime: '',
  selectedDate: null,
  selectedTime: null,
  submitting: false,
}

function scheduleGateReducer(state: ScheduleGateState, action: ScheduleGateAction): ScheduleGateState {
  if (action.type === 'presetDate') return { ...state, customDate: '', selectedDate: action.value }
  if (action.type === 'presetTime') return { ...state, customTime: '', selectedTime: action.value }
  if (action.type === 'customDate') return { ...state, customDate: action.value, selectedDate: action.selectedDate }
  if (action.type === 'customTime') return { ...state, customTime: action.value, selectedTime: action.selectedTime }
  return { ...state, submitting: action.value }
}

export function AgenticScheduleGate({
  language,
  onSubmitSchedule,
  textInputStyle,
}: {
  language: AppLanguage
  onSubmitSchedule: (input: AgenticScheduleSubmission) => Promise<void>
  textInputStyle: StyleProp<TextStyle>
}) {
  const { tokens } = useCustomerV21SurfaceTheme()
  const [state, dispatch] = useReducer(scheduleGateReducer, initialScheduleGateState)
  const { customDate, customTime, selectedDate, selectedTime, submitting } = state
  const dateOptions = useMemo(() => buildBookingScheduleDateOptions(language), [language])
  const timeSlots = useMemo(
    () => availableBookingTimeSlots(selectedDate),
    [selectedDate],
  )
  const schedule = useMemo(
    () => bookingScheduleDraft(selectedDate, selectedTime),
    [selectedDate, selectedTime],
  )
  const scheduleLabel = bookingScheduleLabel(
    dateOptions,
    selectedDate,
    selectedTime,
    language,
  )
  const canSubmit = Boolean(schedule.scheduledAt && schedule.scheduleWindow) && !submitting

  const submit = async () => {
    if (!schedule.scheduledAt || !schedule.scheduleWindow || submitting) return
    dispatch({ type: 'submitting', value: true })
    try {
      const { date, end, start } = schedule.scheduleWindow
      await onSubmitSchedule({
        message: language === 'vi'
          ? `Tôi muốn hẹn ${date} từ ${start} đến ${end}.`
          : `I would like an appointment on ${date} from ${start} to ${end}.`,
        scheduled_at: schedule.scheduledAt,
        schedule_window: {
          date,
          end,
          start,
          time_zone: 'Asia/Ho_Chi_Minh',
        },
      })
    } finally {
      dispatch({ type: 'submitting', value: false })
    }
  }

  return (
    <View style={styles.root} testID="customer-v21-agentic-schedule-required">
      <Text style={[styles.title, { color: tokens.text }]}>
        {language === 'vi' ? 'Chọn thời gian hẹn trước khi tìm thợ' : 'Choose a service time before finding workers'}
      </Text>
      <Text style={[styles.hint, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael chỉ mở tìm thợ sau khi bạn chọn thời gian. Lịch này sẽ được gửi lại để Kael kiểm tra đề nghị hiện tại.'
          : 'Kael starts worker matching only after you choose a time. This time is sent back for Kael to check the current offer.'}
      </Text>
      <View style={styles.choices}>
        {dateOptions.map((option) => (
          <KaelChip
            key={option.value}
            label={option.label}
            onPress={() => {
              dispatch({ type: 'presetDate', value: option.value })
            }}
            testID={`customer-v21-agentic-schedule-date-${option.value}`}
            variant={selectedDate === option.value ? 'selected' : 'unselected'}
          />
        ))}
      </View>
      <KaelTextField
        accessibilityLabel={language === 'vi' ? 'Ngày hẹn khác' : 'Other appointment date'}
        keyboardType="numbers-and-punctuation"
        onChangeText={(value) => {
          const normalized = normalizeBookingCustomDateInput(value)
          dispatch({
            selectedDate: bookingCustomDateValue(normalized),
            type: 'customDate',
            value: normalized,
          })
        }}
        placeholder={language === 'vi' ? 'Ngày khác: DD/MM/YYYY' : 'Other date: DD/MM/YYYY'}
        placeholderTextColor={tokens.subtleText}
        style={[textInputStyle, { color: tokens.text }]}
        testID="customer-v21-agentic-schedule-custom-date"
        value={customDate}
      />
      <View style={styles.choices}>
        {timeSlots.map((slot) => (
          <KaelChip
            key={slot}
            label={slot}
            onPress={() => {
              dispatch({ type: 'presetTime', value: slot })
            }}
            testID={`customer-v21-agentic-schedule-time-${slot}`}
            variant={selectedTime === slot ? 'selected' : 'unselected'}
          />
        ))}
      </View>
      <KaelTextField
        accessibilityLabel={language === 'vi' ? 'Giờ hẹn khác' : 'Other appointment time'}
        keyboardType="numbers-and-punctuation"
        onChangeText={(value) => {
          const normalized = normalizeBookingCustomTimeInput(value)
          dispatch({
            selectedTime: bookingCustomTimeValue(normalized),
            type: 'customTime',
            value: normalized,
          })
        }}
        placeholder={language === 'vi' ? 'Giờ khác: HH:MM' : 'Other time: HH:MM'}
        placeholderTextColor={tokens.subtleText}
        style={[textInputStyle, { color: tokens.text }]}
        testID="customer-v21-agentic-schedule-custom-time"
        value={customTime}
      />
      {schedule.scheduledAt && schedule.scheduleWindow ? (
        <Text style={[styles.selection, { color: tokens.text }]} testID="customer-v21-agentic-schedule-selection">
          {`${scheduleLabel ?? schedule.scheduleWindow.date} · ${schedule.scheduleWindow.start}–${schedule.scheduleWindow.end}`}
        </Text>
      ) : null}
      <KaelButton
        disabled={!canSubmit}
        label={submitting
          ? (language === 'vi' ? 'Đang cập nhật lịch' : 'Updating time')
          : (language === 'vi' ? 'Cập nhật lịch để Kael kiểm tra lại' : 'Update time for Kael to check again')}
        loading={submitting}
        onPress={() => void submit()}
        size="small"
        testID="customer-v21-agentic-schedule-submit"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 12, lineHeight: 18 },
  root: { gap: 10 },
  selection: { fontSize: 13, fontWeight: '600', lineHeight: 20 },
  title: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
})
