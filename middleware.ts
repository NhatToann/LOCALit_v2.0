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
  const isPublicRoute = pathname === '/' || pathname.startsWith('/forgot-password')

  // If on auth pages while logged in, redirect to dashboard
  if (isAuthRoute && user) {
    // Get user role to redirect appropriately
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const dashboardPath = profile?.role === 'buddy' ? '/buddy/dashboard' : '/tourist/dashboard'
    return NextResponse.redirect(new URL(dashboardPath, request.url))
  }

  // If not on auth/public routes and not logged in, redirect to login
  if (!isAuthRoute && !isPublicRoute && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  // Role-based routing for protected routes
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const userRole = profile?.role || 'tourist'
    const isTouristRoute = pathname.startsWith('/tourist/')
    const isBuddyRoute = pathname.startsWith('/buddy/')

    // Redirect tourists away from buddy routes and vice versa
    if (isBuddyRoute && userRole !== 'buddy') {
      return NextResponse.redirect(new URL('/tourist/dashboard', request.url))
    }
    if (isTouristRoute && userRole !== 'tourist') {
      return NextResponse.redirect(new URL('/buddy/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
