import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { createTimedFetch } from '@/lib/supabase/timed-fetch'
import type { Database } from '@nestscout/shared'
import type { UserRole } from '@nestscout/shared'

const SUPABASE_TIMEOUT_MS = 10_000
const MAX_BEARER_TOKEN_LENGTH = 8_192
const MAX_AUTHORIZATION_HEADER_LENGTH = MAX_BEARER_TOKEN_LENGTH + 32
const BEARER_CREDENTIAL_PATTERN = /^Bearer +([A-Za-z0-9._~+\/-]+=*)$/i
const PRIVATE_RESPONSE_HEADERS = { 'Cache-Control': 'private, no-store' }

type AuthFailureCode = 'AUTH_MISSING' | 'AUTH_FORBIDDEN' | 'AUTH_UNAVAILABLE'

type AuthSuccess = {
  success: true
  user: { id: string }
  role: UserRole
  supabase: SupabaseClient<Database>
}

type AuthFailure = {
  success: false
  code: AuthFailureCode
  error: string
  status: 401 | 403 | 503
}

export type AuthResult = AuthSuccess | AuthFailure

export async function authenticateRequest(
  request: Request,
  allowedRoles?: UserRole[],
): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization')
  const token = bearerTokenFrom(authHeader)
  if (!token) {
    return authMissing('Vui lòng đăng nhập')
  }

  let supabase: SupabaseClient<Database>
  try {
    supabase = createClient<Database>(
      env.supabaseUrl,
      env.supabaseServiceRoleKey,
      {
        global: {
          fetch: createTimedFetch(SUPABASE_TIMEOUT_MS),
        },
      },
    )
  } catch {
    return authUnavailable()
  }

  let userResult: Awaited<ReturnType<typeof supabase.auth.getUser>>
  try {
    userResult = await supabase.auth.getUser(token)
  } catch {
    return authUnavailable()
  }

  const { data: userData, error: authError } = userResult
  if (authError) {
    return isInvalidSessionError(authError)
      ? authMissing('Phiên đăng nhập hết hạn')
      : authUnavailable()
  }
  if (!userData.user) {
    return authMissing('Phiên đăng nhập hết hạn')
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single()

    if (profileError) {
      return profileError.code === 'PGRST116'
        ? authMissing('Phiên đăng nhập hết hạn')
        : authUnavailable()
    }
    if (!profile) {
      return authMissing('Phiên đăng nhập hết hạn')
    }

    if (allowedRoles && !allowedRoles.includes(profile.role)) {
      return {
        success: false,
        code: 'AUTH_FORBIDDEN',
        error: 'Bạn không có quyền thực hiện hành động này',
        status: 403,
      }
    }

    return {
      success: true,
      user: { id: userData.user.id },
      role: profile.role,
      supabase,
    }
  } catch {
    return authUnavailable()
  }
}

function authMissing(error: string): AuthFailure {
  return { success: false, code: 'AUTH_MISSING', error, status: 401 }
}

function authUnavailable(): AuthFailure {
  return {
    success: false,
    code: 'AUTH_UNAVAILABLE',
    error: 'Dịch vụ xác thực tạm thời không khả dụng',
    status: 503,
  }
}

function isInvalidSessionError(error: { status?: number }): boolean {
  return error.status === 400 || error.status === 401 || error.status === 403
}

function bearerTokenFrom(authHeader: string | null): string | null {
  if (!authHeader || authHeader.length > MAX_AUTHORIZATION_HEADER_LENGTH) return null
  const token = BEARER_CREDENTIAL_PATTERN.exec(authHeader)?.[1]
  return token && token.length <= MAX_BEARER_TOKEN_LENGTH ? token : null
}

export function apiError(
  code: string,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json(
    { error: message, code },
    { status, headers: PRIVATE_RESPONSE_HEADERS },
  )
}

export function apiSuccess<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status, headers: PRIVATE_RESPONSE_HEADERS })
}

export function assertOwnership(
  job: { customer_id: string | null; worker_id: string | null },
  userId: string,
  role: UserRole,
): { allowed: boolean } {
  if (role === 'admin') return { allowed: true }
  if (role === 'customer') return { allowed: job.customer_id === userId }
  if (role === 'worker') return { allowed: job.worker_id === userId }
  return { allowed: false }
}
