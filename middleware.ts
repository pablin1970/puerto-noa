import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // Refrescar sesión — esto sincroniza las cookies entre servidor y cliente
  const { data: { session } } = await supabase.auth.getSession()

  const isAuthCallback = req.nextUrl.pathname.startsWith('/auth/callback')
  const isLogin = req.nextUrl.pathname === '/'
  const isProtected = !isAuthCallback && !isLogin

  // Si no hay sesión y está en ruta protegida → redirigir al login
  if (!session && isProtected) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Si hay sesión y está en login → redirigir al dashboard
  if (session && isLogin) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.png|.*\\.jpg|.*\\.svg).*)',
  ],
}
