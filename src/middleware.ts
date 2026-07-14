import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, role, mustChangePassword } = await updateSession(request)

  const path = request.nextUrl.pathname

  // 1. If not logged in and trying to access restricted routes, redirect to /login
  if (!user && (path.startsWith('/dashboard') || path.startsWith('/my-department') || path === '/' || path === '/reset-password')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. If logged in and must change password, force redirect to /reset-password
  if (user && mustChangePassword && path !== '/reset-password') {
    const url = request.nextUrl.clone()
    url.pathname = '/reset-password'
    return NextResponse.redirect(url)
  }

  // 3. If logged in but does not need reset, and trying to access /reset-password, redirect to home
  if (user && !mustChangePassword && path === '/reset-password') {
    const url = request.nextUrl.clone()
    url.pathname = (role === 'super_admin' || role === 'coordinator') ? '/dashboard' : '/my-department'
    return NextResponse.redirect(url)
  }

  // 4. If logged in and trying to access /login, redirect to home page based on role
  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = (role === 'super_admin' || role === 'coordinator') ? '/dashboard' : '/my-department'
    return NextResponse.redirect(url)
  }

  // 5. Root path redirection
  if (user && path === '/') {
    const url = request.nextUrl.clone()
    url.pathname = (role === 'super_admin' || role === 'coordinator') ? '/dashboard' : '/my-department'
    return NextResponse.redirect(url)
  }

  // 6. Role-based path access control
  if (user) {
    const isAdmin = role === 'super_admin' || role === 'coordinator'

    if (isAdmin && path.startsWith('/my-department')) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    if (!isAdmin && path.startsWith('/dashboard')) {
      const url = request.nextUrl.clone()
      url.pathname = '/my-department'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth/callback (auth route handler)
     */
    '/((?!_next/static|_next/image|favicon.ico|auth/callback).*)',
  ],
}
