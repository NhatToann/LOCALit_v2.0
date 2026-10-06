import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Auth routes — allow if logged in (redirect to dashboard) or not logged in
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isPublicRoute =
    pathname === '/' ||
    pathname.startsWith('/forgot-password') ||
    pathname === '/search' ||
    pathname === '/browse' ||
    pathname === '/map' ||
    pathname.startsWith('/buddies/') // public buddy profile pages
  const isVerifyEmailRoute = pathname.startsWith('/verify-email')

  // If on auth pages while logged in, redirect to dashboard.
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // If not on auth/public routes and not logged in, redirect to login
  if (!isAuthRoute && !isPublicRoute && !isVerifyEmailRoute && !user) {
    console.warn('[middleware] redirect to /login', {
      pathname,
      hasUser: !!user,
      cookies: request.cookies.getAll().map((c) => c.name),
    })
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  // 2026-10-01: Unified single-web architecture. Every authenticated
  // user lands on /dashboard regardless of role. Old role-prefixed
  // URLs (/tourist/* and /buddy/*) are 308-redirected to their flat
  // equivalents so external bookmarks / Vercel aliases / search-engine
  // caches resolve correctly. /cart → 404 (the unknown route was never
  // defined; treating it as 308 prevents hard-coded data leaks).
  const ROUTE_REWRITES: Array<[RegExp, string]> = [
    [/^\/buddy\/dashboard$/, '/dashboard'],
    [/^\/buddy\/profile$/, '/profile'],
    [/^\/buddy\/requests$/, '/itinerary'],
    [/^\/buddy\/trips\/new$/, '/itinerary/new'],
    [/^\/buddy\/trips$/, '/itinerary'],
    [/^\/buddy(\/|$)/, '/dashboard'],
    [/^\/tourist\/dashboard$/, '/dashboard'],
    [/^\/tourist\/profile$/, '/profile'],
    [/^\/tourist\/browse$/, '/browse'],
    [/^\/tourist\/buddy\/([^\/]+)$/, '/buddies/$1'],
    [/^\/tourist\/trips$/, '/itinerary'],
    [/^\/tourist\/trips\/create$/, '/itinerary/new'],
    [/^\/tourist\/trips\/([^\/]+)$/, '/itinerary/$1'],
    [/^\/tourist(\/|$)/, '/dashboard'],
    // 2026-10-07: trips/* routes are gone; /trips and /trips/create map
    // to the unified /itinerary equivalents. /trips/[id] (old UUIDs) are
    // no longer valid — fall back to /itinerary.
    [/^\/trips\/create$/, '/itinerary/new'],
    [/^\/trips\/([^\/]+)$/, '/itinerary'],
    [/^\/trips$/, '/itinerary'],
  ]
  for (const [pattern, target] of ROUTE_REWRITES) {
    if (pattern.test(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = pathname.replace(pattern, target)
      url.search = ''
      return NextResponse.redirect(url, { status: 308 })
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}