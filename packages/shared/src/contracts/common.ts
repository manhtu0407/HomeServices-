import { z } from 'zod'
import { SERVICE_TYPES } from '../constants'
export const serviceTypeSchema = z.enum(SERVICE_TYPES)
export const clientRequestIdSchema = z.uuidv4()
export const uuidPathPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
export const jobMediaStages = [
  'before',
  'after',
  'kael_reference',
  'cancellation_evidence',
  'scope_change_evidence',
  'access_check_in',
] as const
export const privateJobMediaRefSchema = z.string().min(10).max(500).regex(
  new RegExp(`^supabase://job-media/${uuidPathPattern}/(?:${jobMediaStages.join('|')})/(?!.*(?:\\.\\.|//))[^\\s?#/]+$`, 'i'),
  'Evidence must be an attached private job-media ref',
)
export const workerVerificationRefSchema = (folder: 'cccd-front' | 'cccd-back' | 'selfie') => z
  .string()
  .max(500)
  .regex(
    new RegExp(`^supabase://worker-verification/${uuidPathPattern}/${folder}/(?!.*(?:\\.\\.|//))[^\\s?#/]+$`, 'i'),
    `Worker verification ${folder} must be an owned private storage ref`,
  )
