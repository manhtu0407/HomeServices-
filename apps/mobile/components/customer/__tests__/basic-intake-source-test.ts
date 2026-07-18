import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readCustomerV21Source(fileName: string) {
  return readFileSync(resolve(__dirname, '../v21', fileName), 'utf8')
}

it('keeps the booking route on Basic Intake instead of wiring the static performance questionnaire', () => {
  const surface = readCustomerV21Source('surfaces.tsx')
  const bookingView = readCustomerV21Source('booking-entry-stateful-surfaces.tsx')

  expect(surface).not.toContain('usePerformanceBookingIntake')
  expect(surface).not.toContain('performanceIntakeNode=')
  expect(bookingView).not.toContain('usesPerformanceIntake')
  expect(bookingView).not.toContain('PerformanceIntakePanel')
  expect(bookingView).toContain('testID="customer-v21-booking-description"')
  expect(bookingView).not.toContain('customer-v21-booking-add-media')
  expect(bookingView).not.toContain('customer-v21-booking-media-count')
})
