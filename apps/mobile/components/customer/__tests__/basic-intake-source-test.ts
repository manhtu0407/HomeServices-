import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Customer surfaces live in per-domain buckets, so look a file up by name.
const CUSTOMER_BUCKETS = ['v21', 'dock', 'ui', 'home', 'booking', 'history', 'profile', 'kael-chat']

function readCustomerV21Source(fileName: string) {
  const bucket = CUSTOMER_BUCKETS.find((dir) => existsSync(resolve(__dirname, '..', dir, fileName)))
  if (!bucket) throw new Error(`customer surface not found in any bucket: ${fileName}`)
  return readFileSync(resolve(__dirname, '..', bucket, fileName), 'utf8')
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
