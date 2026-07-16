import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@nestscout/shared'
import { env } from './env'
import { createTimedFetch } from './supabase/timed-fetch'

const SUPABASE_AUTH_TIMEOUT_MS = 10_000
const SUPABASE_AUTH_COOKIE_PATTERN = /^sb-.+-auth-token(?:\.\d+)?$/
const PUBLIC_UI_PATHS = new Set(['/', '/admin/kael-learning'])

export async function updateSession(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  if (PUBLIC_UI_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next({
      request,
    })
  }

  if (!hasSupabaseAuthCookie(request)) {
    return redirectToLanding(request)
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  try {
    const supabase = createServerClient<Database>(
      env.supabaseUrl,
      env.supabasePublishableKey,
      {
        global: { fetch: createTimedFetch(SUPABASE_AUTH_TIMEOUT_MS) },
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      },
    )

    const { data: { user } } = await supabase.auth.getUser()
    return user ? supabaseResponse : redirectToLanding(request)
  } catch {
    return redirectToLanding(request)
  }
}

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => SUPABASE_AUTH_COOKIE_PATTERN.test(cookie.name))
}

function redirectToLanding(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = '/'
  url.search = ''
  return NextResponse.redirect(url)
}
