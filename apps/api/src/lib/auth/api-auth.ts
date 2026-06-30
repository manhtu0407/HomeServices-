import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import type { Database } from '@nestscout/shared'
import type { UserRole } from '@nestscout/shared'

type AuthSuccess = {
  success: true
  user: { id: string; email?: string }
  role: UserRole
  supabase: SupabaseClient<Database>
}

type AuthFailure = {
  success: false
  error: string
  status: 401 | 403
}

export type AuthResult = AuthSuccess | AuthFailure

export async function authenticateRequest(
  request: Request,
  allowedRoles?: UserRole[],
): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { success: false, error: 'Vui lòng đăng nhập', status: 401 }
  }

  const token = authHeader.slice(7)
  if (!token) {
    return { success: false, error: 'Vui lòng đăng nhập', status: 401 }
  }

  const SUPABASE_TIMEOUT_MS = 10_000

  const supabase = createClient<Database>(
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
    {
      global: {
        fetch: (url, options = {}) => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS)
          return fetch(url, { ...options, signal: controller.signal }).finally(() =>
            clearTimeout(timeout),
          )
        },
      },
    },
  )

  const { data: userData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !userData.user) {
    return { success: false, error: 'Phiên đăng nhập hết hạn', status: 401 }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile) {
    return { success: false, error: 'Phiên đăng nhập hết hạn', status: 401 }
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return {
      success: false,
      error: 'Bạn không có quyền thực hiện hành động này',
      status: 403,
    }
  }

  return {
    success: true,
    user: { id: userData.user.id, email: userData.user.email },
    role: profile.role,
    supabase,
  }
}

export function apiError(
  code: string,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error: message, code }, { status })
}

export function apiSuccess<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status })
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
